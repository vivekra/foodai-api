import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../../../utils/prisma.js';
import { catchAsync } from '../../../shared/catchAsync.js';
import { sendCreated, sendSuccess } from '../../../shared/sendResponse.js';
import { AppError } from '../../../shared/AppError.js';

export const register = catchAsync(async (req: Request, res: Response) => {
  const { name, email, password, phone, role } = req.body;

  const existingUser = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
  });

  if (existingUser) {
    throw AppError.badRequest('An account with this email already exists');
  }

  // Cost factor 12 per security spec
  const hashedPassword = await bcrypt.hash(password, 12);
  const userRole = role === 'SUPER_ADMIN' || role === 'RESTAURANT_OWNER' ? role : 'CUSTOMER';

  const user = await prisma.user.create({
    data: {
      name,
      email: email.toLowerCase(),
      phone: phone ?? null,
      role: userRole,
      accounts: {
        create: {
          accountId: email.toLowerCase(),
          providerId: 'credential',
          password: hashedPassword,
        },
      },
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      phone: true,
      createdAt: true,
    },
  });

  const sessionToken = uuidv4();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  await prisma.session.create({
    data: {
      userId: user.id,
      token: sessionToken,
      expiresAt,
      ipAddress: req.ip ?? null,
      userAgent: req.headers['user-agent'] ?? null,
    },
  });

  sendCreated(res, { user, token: sessionToken }, 'Registration successful');
});

export const login = catchAsync(async (req: Request, res: Response) => {
  const { email, password } = req.body;

  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    include: {
      accounts: {
        where: { providerId: 'credential' },
      },
    },
  });

  if (!user || user.accounts.length === 0 || !user.accounts[0]?.password) {
    throw AppError.unauthorized('Invalid email or password');
  }

  const isPasswordValid = await bcrypt.compare(password, user.accounts[0].password);
  if (!isPasswordValid) {
    throw AppError.unauthorized('Invalid email or password');
  }

  const sessionToken = uuidv4();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  await prisma.session.create({
    data: {
      userId: user.id,
      token: sessionToken,
      expiresAt,
      ipAddress: req.ip ?? null,
      userAgent: req.headers['user-agent'] ?? null,
    },
  });

  sendSuccess(
    res,
    {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone,
      },
      token: sessionToken,
    },
    'Login successful'
  );
});

export const getMe = catchAsync(async (req: Request, res: Response) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    throw AppError.unauthorized('Authorization header missing');
  }

  const session = await prisma.session.findUnique({
    where: { token },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          phone: true,
          whatsappPhone: true,
          restaurantUsers: {
            select: {
              restaurantId: true,
              role: true,
            },
          },
        },
      },
    },
  });

  if (!session || session.expiresAt < new Date()) {
    throw AppError.unauthorized('Session invalid or expired');
  }

  sendSuccess(res, { user: session.user }, 'User session active');
});

export const logout = catchAsync(async (req: Request, res: Response) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token) {
    await prisma.session.deleteMany({
      where: { token },
    });
  }

  sendSuccess(res, null, 'Logged out successfully');
});

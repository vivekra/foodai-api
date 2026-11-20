import type { Request, Response } from 'express';
import { prisma } from '../../../utils/prisma.js';
import { catchAsync } from '../../../shared/catchAsync.js';
import { sendCreated, sendPaginated, sendSuccess } from '../../../shared/sendResponse.js';
import { AppError } from '../../../shared/AppError.js';

export const getRestaurants = catchAsync(async (req: Request, res: Response) => {
  const page = Math.max(1, Number(req.query['page']) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query['limit']) || 20));
  const skip = (page - 1) * limit;

  const search = typeof req.query['search'] === 'string' ? req.query['search'].trim() : undefined;
  const cuisine = typeof req.query['cuisine'] === 'string' ? req.query['cuisine'].trim() : undefined;
  const city = typeof req.query['city'] === 'string' ? req.query['city'].trim() : undefined;

  const where: any = {
    isActive: true,
  };

  if (city) {
    where.city = { contains: city, mode: 'insensitive' };
  }

  if (cuisine) {
    where.cuisineType = { has: cuisine };
  }

  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
      { city: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [restaurants, total] = await Promise.all([
    prisma.restaurant.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        slug: true,
        name: true,
        description: true,
        logoUrl: true,
        coverImageUrl: true,
        cuisineType: true,
        city: true,
        postcode: true,
        avgPrepTimeMinutes: true,
        minimumOrderAmount: true,
        isVerified: true,
      },
    }),
    prisma.restaurant.count({ where }),
  ]);

  sendPaginated(res, restaurants, { page, limit, total });
});

export const getRestaurantBySlug = catchAsync(async (req: Request, res: Response) => {
  const { slug } = req.params;

  const restaurant = await prisma.restaurant.findUnique({
    where: { slug },
    include: {
      menuCategories: {
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
        include: {
          items: {
            where: { isActive: true },
            orderBy: { sortOrder: 'asc' },
          },
        },
      },
      tables: {
        where: { isActive: true },
        orderBy: { tableNumber: 'asc' },
      },
    },
  });

  if (!restaurant) {
    throw AppError.notFound(`Restaurant not found with slug: ${slug}`);
  }

  sendSuccess(res, restaurant);
});

export const getRestaurantById = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;

  const restaurant = await prisma.restaurant.findUnique({
    where: { id },
    include: {
      menuCategories: {
        orderBy: { sortOrder: 'asc' },
        include: {
          items: {
            orderBy: { sortOrder: 'asc' },
          },
        },
      },
      tables: {
        orderBy: { tableNumber: 'asc' },
      },
    },
  });

  if (!restaurant) {
    throw AppError.notFound('Restaurant not found');
  }

  sendSuccess(res, restaurant);
});

export const createRestaurant = catchAsync(async (req: Request, res: Response) => {
  const {
    name,
    slug,
    description,
    addressLine1,
    addressLine2,
    city,
    postcode,
    phone,
    whatsappNumber,
    email,
    cuisineType,
    userId,
  } = req.body;

  const existing = await prisma.restaurant.findUnique({ where: { slug } });
  if (existing) {
    throw AppError.badRequest(`Restaurant slug '${slug}' is already in use`);
  }

  // Create restaurant with default 10 tables
  const defaultTables = Array.from({ length: 10 }, (_, i) => ({
    tableNumber: String(i + 1),
    isActive: true,
  }));

  const restaurant = await prisma.restaurant.create({
    data: {
      name,
      slug,
      description,
      addressLine1,
      addressLine2,
      city,
      postcode: postcode.toUpperCase(),
      phone,
      whatsappNumber,
      email,
      cuisineType,
      tables: {
        create: defaultTables,
      },
      ...(userId
        ? {
            users: {
              create: {
                userId,
                role: 'OWNER',
              },
            },
          }
        : {}),
    },
    include: {
      tables: true,
    },
  });

  sendCreated(res, restaurant, 'Restaurant created successfully with default 10 QR dining tables');
});

export const updateRestaurant = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const updateData = { ...req.body };

  // Disallow direct updating of id or slug via general update
  delete updateData.id;
  delete updateData.slug;

  const updated = await prisma.restaurant.update({
    where: { id },
    data: updateData,
  });

  sendSuccess(res, updated, 'Restaurant updated successfully');
});

export const getRestaurantTables = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;

  const tables = await prisma.restaurantTable.findMany({
    where: { restaurantId: id },
    orderBy: { tableNumber: 'asc' },
  });

  sendSuccess(res, tables);
});

export const createRestaurantTable = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { tableNumber } = req.body;

  if (!tableNumber) {
    throw AppError.badRequest('tableNumber is required');
  }

  const table = await prisma.restaurantTable.create({
    data: {
      restaurantId: id as string,
      tableNumber: String(tableNumber),
      isActive: true,
    },
  });

  sendCreated(res, table, `Table #${tableNumber} created successfully`);
});

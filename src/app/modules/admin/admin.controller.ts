import type { Request, Response } from 'express';
import { prisma } from '../../../utils/prisma.js';
import { bustPricingCache, getActivePricing } from '../pricing/pricing.service.js';
import { catchAsync } from '../../../shared/catchAsync.js';
import { sendCreated, sendPaginated, sendSuccess } from '../../../shared/sendResponse.js';
import { AppError } from '../../../shared/AppError.js';

export const getStats = catchAsync(async (_req: Request, res: Response) => {
  const [totalOrders, totalRestaurants, activeRestaurants, ordersSummary] = await Promise.all([
    prisma.order.count(),
    prisma.restaurant.count(),
    prisma.restaurant.count({ where: { isActive: true, isVerified: true } }),
    prisma.order.aggregate({
      _sum: {
        total: true,
        platformFee: true,
        voiceSurcharge: true,
      },
    }),
  ]);

  const gmv = Number(ordersSummary._sum.total || 0);
  const platformRevenue =
    Number(ordersSummary._sum.platformFee || 0) + Number(ordersSummary._sum.voiceSurcharge || 0);

  sendSuccess(res, {
    totalOrders,
    totalRestaurants,
    activeRestaurants,
    gmv,
    platformRevenue,
  });
});

export const getAdminRestaurants = catchAsync(async (req: Request, res: Response) => {
  const page = Math.max(1, Number(req.query['page']) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query['limit']) || 20));
  const skip = (page - 1) * limit;

  const verifiedParam = req.query['isVerified'];
  const where: any = {};
  if (verifiedParam !== undefined) {
    where.isVerified = verifiedParam === 'true';
  }

  const [restaurants, total] = await Promise.all([
    prisma.restaurant.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        users: {
          select: {
            role: true,
            user: { select: { id: true, name: true, email: true, phone: true } },
          },
        },
      },
    }),
    prisma.restaurant.count({ where }),
  ]);

  sendPaginated(res, restaurants, { page, limit, total });
});

export const verifyRestaurant = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { isVerified } = req.body;

  if (typeof isVerified !== 'boolean') {
    throw AppError.badRequest('isVerified must be a boolean');
  }

  const restaurant = await prisma.restaurant.update({
    where: { id },
    data: { isVerified },
  });

  sendSuccess(res, restaurant, `Restaurant verification updated to ${isVerified}`);
});

export const getPricing = catchAsync(async (_req: Request, res: Response) => {
  const activePricing = await getActivePricing();
  sendSuccess(res, activePricing);
});

export const updatePricing = catchAsync(async (req: Request, res: Response) => {
  const {
    freeCommissionRate,
    starterCommissionRate,
    proCommissionRate,
    enterpriseCommissionRate,
    voiceSurchargeRate,
    changeReason,
  } = req.body;

  // Fetch current active config to determine next version
  const currentConfig = await prisma.platformPricingConfig.findFirst({
    where: { isActive: true },
    orderBy: { version: 'desc' },
  });

  const nextVersion = (currentConfig?.version ?? 0) + 1;
  const updatedBy = req.user?.id ?? 'admin';

  // Run in transaction: deactivate previous, create new version, record audit
  const newConfig = await prisma.$transaction(async (tx) => {
    if (currentConfig) {
      await tx.platformPricingConfig.update({
        where: { id: currentConfig.id },
        data: { isActive: false },
      });
    }

    const created = await tx.platformPricingConfig.create({
      data: {
        version: nextVersion,
        isActive: true,
        freeCommissionRate,
        starterCommissionRate,
        proCommissionRate,
        enterpriseCommissionRate,
        voiceSurchargeRate,
        changeReason: changeReason ?? 'Updated via Super Admin Dashboard',
        updatedBy,
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: updatedBy,
        action: 'UPDATE_PRICING',
        resource: 'platform_pricing_configs',
        resourceId: created.id,
        oldValue: currentConfig as any,
        newValue: created as any,
      },
    });

    return created;
  });

  // Bust Redis cache immediately
  await bustPricingCache();

  sendCreated(res, newConfig, `Dynamic pricing updated to version ${nextVersion}`);
});

export const getUsers = catchAsync(async (req: Request, res: Response) => {
  const page = Math.max(1, Number(req.query['page']) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query['limit']) || 20));
  const skip = (page - 1) * limit;

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        phone: true,
        createdAt: true,
      },
    }),
    prisma.user.count(),
  ]);

  sendPaginated(res, users, { page, limit, total });
});

export const updateUserRole = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { role } = req.body;

  const validRoles = ['SUPER_ADMIN', 'RESTAURANT_OWNER', 'RESTAURANT_STAFF', 'CUSTOMER'];
  if (!validRoles.includes(role)) {
    throw AppError.badRequest(`Invalid user role: ${role}`);
  }

  const updatedUser = await prisma.user.update({
    where: { id },
    data: { role },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
    },
  });

  sendSuccess(res, updatedUser, `User role updated to ${role}`);
});

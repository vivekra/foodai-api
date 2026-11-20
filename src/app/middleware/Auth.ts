import type { Request, Response, NextFunction } from 'express';
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { prisma } from '../../utils/prisma.js';
import { authConfig } from '@/auth';
import { AppError } from '../../shared/AppError.js';

export const auth = betterAuth({
  ...authConfig,
  database: prismaAdapter(prisma, { provider: 'postgresql' }),
  secret: process.env['BETTER_AUTH_SECRET']!,
  baseURL: process.env['BETTER_AUTH_URL']!,
});

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        name: string;
        role: string;
        emailVerified: boolean;
      };
      session?: {
        id: string;
        token: string;
        expiresAt: Date;
      };
      restaurantId?: string;
    }
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) {
    next(AppError.unauthorized());
    return;
  }
  next();
}

export function requireRole(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      next(AppError.forbidden());
      return;
    }
    next();
  };
}

export function requireSuperAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user || req.user.role !== 'SUPER_ADMIN') {
    next(AppError.forbidden('Super admin access required'));
    return;
  }
  next();
}

export function requireRestaurantAccess(req: Request, _res: Response, next: NextFunction): void {
  const restaurantId = req.params['restaurantId'] ?? req.body?.restaurantId;
  if (!restaurantId) {
    next(AppError.badRequest('restaurantId is required'));
    return;
  }
  // Restaurant owners can only access their own restaurant
  // Super admins can access any
  req.restaurantId = restaurantId;
  next();
}

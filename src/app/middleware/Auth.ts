import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../../utils/prisma.js';
import { AppError } from '../../shared/AppError.js';

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        name: string;
        role: string;
        phone?: string | null;
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

/**
 * Resolves session token from Authorization: Bearer <token> or Cookie
 * Attaches req.user and req.session if valid.
 */
export async function authenticateSession(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    let token: string | undefined;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7).trim();
    } else if (req.headers['x-session-token']) {
      token = String(req.headers['x-session-token']).trim();
    }

    if (!token) {
      return next();
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
          },
        },
      },
    });

    if (session && session.expiresAt > new Date()) {
      req.session = {
        id: session.id,
        token: session.token,
        expiresAt: session.expiresAt,
      };
      req.user = session.user;
    }

    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Middleware: Strictly requires an authenticated user session
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.user) {
    await authenticateSession(req, res, () => {});
  }

  if (!req.user) {
    next(AppError.unauthorized('Authentication required. Please sign in.'));
    return;
  }
  next();
}

/**
 * Middleware: Requires specific roles (e.g. SUPER_ADMIN, RESTAURANT_OWNER)
 */
export function requireRole(...roles: string[]) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      await authenticateSession(req, res, () => {});
    }

    if (!req.user) {
      next(AppError.unauthorized('Authentication required'));
      return;
    }

    if (!roles.includes(req.user.role)) {
      next(AppError.forbidden(`Access denied. Requires one of: [${roles.join(', ')}]`));
      return;
    }
    next();
  };
}

/**
 * Middleware: Strictly enforces Super Admin access only
 */
export async function requireSuperAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.user) {
    await authenticateSession(req, res, () => {});
  }

  if (!req.user) {
    next(AppError.unauthorized('Super Admin authentication required.'));
    return;
  }

  if (req.user.role !== 'SUPER_ADMIN') {
    next(AppError.forbidden('Access denied: Super Admin privileges required.'));
    return;
  }

  next();
}

/**
 * Middleware: Validates that the user owns or has staff access to the requested restaurant
 */
export async function requireRestaurantAccess(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.user) {
    await authenticateSession(req, res, () => {});
  }

  if (!req.user) {
    next(AppError.unauthorized('Authentication required'));
    return;
  }

  // Super admins have access to all restaurants
  if (req.user.role === 'SUPER_ADMIN') {
    return next();
  }

  const targetRestaurantId =
    (req.params['restaurantId'] as string) ||
    (req.params['id'] as string) ||
    (req.body?.restaurantId as string) ||
    (req.query['restaurantId'] as string);

  if (!targetRestaurantId) {
    return next();
  }

  // Check if user is linked to this restaurant
  const link = await prisma.restaurantUser.findFirst({
    where: {
      userId: req.user.id,
      restaurantId: targetRestaurantId,
    },
  });

  if (!link) {
    next(AppError.forbidden('You do not have permission to manage this restaurant.'));
    return;
  }

  req.restaurantId = targetRestaurantId;
  next();
}

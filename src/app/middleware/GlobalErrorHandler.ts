import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../../shared/AppError.js';
import { logger } from './Logger.js';

export function globalErrorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Zod validation errors
  if (err instanceof ZodError) {
    const errors: Record<string, string[]> = {};
    for (const e of err.errors) {
      const key = e.path.join('.') || 'body';
      errors[key] ??= [];
      errors[key]!.push(e.message);
    }
    res.status(400).json({ success: false, message: 'Validation error', errors });
    return;
  }

  // Known operational errors
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      message: err.message,
      ...(err.errors ? { errors: err.errors } : {}),
    });
    return;
  }

  // Prisma errors
  if (err.constructor.name === 'PrismaClientKnownRequestError') {
    const prismaErr = err as Error & { code?: string };
    if (prismaErr.code === 'P2002') {
      res.status(409).json({ success: false, message: 'Resource already exists' });
      return;
    }
    if (prismaErr.code === 'P2025') {
      res.status(404).json({ success: false, message: 'Resource not found' });
      return;
    }
  }

  // Unknown errors — never leak internals
  logger.error({ err, url: req.url, method: req.method }, 'Unhandled error');
  res.status(500).json({ success: false, message: 'Internal server error' });
}

import type { Request, Response, NextFunction } from 'express';
import type { ZodSchema } from 'zod';
import { AppError } from '../../shared/AppError.js';

export function validateBody(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const errors: Record<string, string[]> = {};
      for (const e of result.error.errors) {
        const key = e.path.join('.') || 'body';
        errors[key] ??= [];
        errors[key]!.push(e.message);
      }
      next(AppError.badRequest('Validation failed', errors));
      return;
    }
    req.body = result.data;
    next();
  };
}

export function validateQuery(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      next(AppError.badRequest('Invalid query parameters'));
      return;
    }
    req.query = result.data as typeof req.query;
    next();
  };
}

export function validateParams(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.params);
    if (!result.success) {
      next(AppError.badRequest('Invalid URL parameters'));
      return;
    }
    req.params = result.data as typeof req.params;
    next();
  };
}

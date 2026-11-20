import rateLimit from 'express-rate-limit';
import slowDown from 'express-slow-down';

// Global: 200 requests per minute per IP
export const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 200,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please slow down' },
});

// Auth endpoints: 10 requests per 15 minutes per IP
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, message: 'Too many authentication attempts' },
});

// AI chat: 30 requests per minute per user
export const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  keyGenerator: (req) =>
    (req.headers['x-user-id'] as string) || req.ip || 'anonymous',
  message: { success: false, message: 'AI rate limit reached, please wait' },
});

// Voice agent: 5 concurrent calls per restaurant
export const voiceLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 5,
  keyGenerator: (req) =>
    (req.params['restaurantId'] as string) || req.ip || 'unknown',
  message: { success: false, message: 'Voice agent busy, please try again' },
});

// Progressive slow-down after 50 requests/min
export const speedLimiter = slowDown({
  windowMs: 60 * 1000,
  delayAfter: 50,
  delayMs: (hits: number) => hits * 100,
});

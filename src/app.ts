import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { globalLimiter, speedLimiter } from './app/middleware/RateLimit.js';
import { requestLogger } from './app/middleware/Logger.js';
import { globalErrorHandler } from './app/middleware/GlobalErrorHandler.js';
import { router } from './app/routes/index.js';

export function createApp() {
  const app = express();

  // Trust proxy (Vercel, Koyeb, Cloudflare)
  app.set('trust proxy', 1);

  // Security headers via helmet
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'https:'],
          connectSrc: ["'self'"],
          frameSrc: ["'none'"],
          objectSrc: ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: false,
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
      },
    })
  );

  // CORS — strict allowlist only
  const allowedOrigins = (process.env['CORS_ORIGINS'] ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error(`CORS: origin ${origin} not allowed`));
        }
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      allowedHeaders: ['Content-Type', 'Authorization', 'x-user-id'],
    })
  );

  // Body parsing — strict size limits
  app.use(express.json({ limit: '16kb' }));
  app.use(express.urlencoded({ extended: true, limit: '16kb' }));

  // Rate limiting
  app.use(globalLimiter);
  app.use(speedLimiter);

  // Request logging
  app.use(requestLogger);

  // API routes
  app.use('/api/v1', router);

  // 404 handler
  app.use((_req, res) => {
    res.status(404).json({ success: false, message: 'Route not found' });
  });

  // Global error handler — MUST be last
  app.use(globalErrorHandler);

  return app;
}

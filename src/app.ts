import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { globalLimiter, speedLimiter } from './app/middleware/RateLimit.js';
import { requestLogger } from './app/middleware/Logger.js';
import { authenticateSession } from './app/middleware/Auth.js';
import { globalErrorHandler } from './app/middleware/GlobalErrorHandler.js';
import { router } from './app/routes/index.js';

export function createApp() {
  const app = express();

  // Trust proxy (Vercel, Koyeb, Cloudflare)
  app.set('trust proxy', 1);

  // Security headers via helmet (CSP disabled on REST API endpoints to avoid blocking client UI apps)
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
      },
    })
  );

  // CORS — support dqserv.com platform domains and custom CORS_ORIGINS
  const envOrigins = (process.env['CORS_ORIGINS'] ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  const defaultPlatformOrigins = [
    'https://merchants.dqserv.com',
    'https://kitchen.dqserv.com',
    'https://foodai.dqserv.com',
    'https://dqserv.com',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:3002',
    'http://localhost:3003',
  ];

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (
          envOrigins.includes(origin) ||
          defaultPlatformOrigins.includes(origin) ||
          origin.endsWith('.dqserv.com') ||
          origin.startsWith('http://localhost:')
        ) {
          callback(null, true);
        } else {
          callback(new Error(`CORS: origin ${origin} not allowed`));
        }
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'x-user-id', 'x-session-token'],
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

  // Authenticate user session from Bearer token / header
  app.use(authenticateSession);

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

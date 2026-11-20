import 'dotenv/config';
import { createServer } from 'http';
import { createApp } from './app.js';
import { logger } from './app/middleware/Logger.js';
import { prisma } from './utils/prisma.js';

const PORT = parseInt(process.env['PORT'] ?? '3001', 10);

async function bootstrap() {
  // Verify DB connection
  await prisma.$connect();
  logger.info('✅ Database connected');

  const app = createApp();
  const httpServer = createServer(app);

  // Dynamically import socket gateway to avoid circular deps
  const { initKitchenGateway } = await import(
    './app/modules/kitchen/kitchen.gateway.js'
  );
  initKitchenGateway(httpServer);

  httpServer.listen(PORT, () => {
    logger.info(`🚀 FoodAI API listening on port ${PORT}`);
    logger.info(`🌍 Environment: ${process.env['NODE_ENV'] ?? 'development'}`);
    logger.info(`🔗 Health: http://localhost:${PORT}/api/v1/health`);
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`${signal} received — shutting down gracefully`);
    httpServer.close(async () => {
      await prisma.$disconnect();
      logger.info('💤 Server closed');
      process.exit(0);
    });
    // Force exit after 10s
    setTimeout(() => process.exit(1), 10_000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap().catch((err) => {
  logger.error(err, '💥 Failed to start server');
  process.exit(1);
});

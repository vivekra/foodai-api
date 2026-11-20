import type { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import { createClient } from 'redis';
import { createAdapter } from '@socket.io/redis-adapter';
import { logger } from '../../middleware/Logger.js';
import type { KitchenOrderEvent } from '@/types';

let io: Server | undefined;

export function initKitchenGateway(httpServer: HttpServer): Server {
  const allowedOrigins = [
    process.env['NEXT_PUBLIC_KITCHEN_URL'] ?? 'http://localhost:3003',
    process.env['NEXT_PUBLIC_WEB_URL'] ?? 'http://localhost:3000',
    process.env['NEXT_PUBLIC_MERCHANT_URL'] ?? 'http://localhost:3002',
  ];

  io = new Server(httpServer, {
    cors: {
      origin: allowedOrigins,
      credentials: true,
      methods: ['GET', 'POST'],
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // Redis pub/sub adapter for horizontal scaling
  const redisUrl = process.env['UPSTASH_REDIS_URL'] ?? 'redis://localhost:6379';
  const pubClient = createClient({ url: redisUrl });
  const subClient = pubClient.duplicate();

  void Promise.all([pubClient.connect(), subClient.connect()]).then(() => {
    io!.adapter(createAdapter(pubClient, subClient));
    logger.info('✅ Socket.io Redis adapter connected');
  });

  io.on('connection', (socket) => {
    logger.info({ socketId: socket.id }, 'Socket connected');

    socket.on('join:kitchen', ({ restaurantId }: { restaurantId: string }) => {
      void socket.join(`kitchen:${restaurantId}`);
      logger.info({ restaurantId, socketId: socket.id }, 'Kitchen client joined room');
    });

    socket.on('join:order', ({ orderId }: { orderId: string }) => {
      void socket.join(`order:${orderId}`);
    });

    socket.on('leave:kitchen', ({ restaurantId }: { restaurantId: string }) => {
      void socket.leave(`kitchen:${restaurantId}`);
    });

    socket.on('disconnect', (reason) => {
      logger.info({ socketId: socket.id, reason }, 'Socket disconnected');
    });
  });

  return io;
}

export function emitNewOrder(restaurantId: string, event: KitchenOrderEvent): void {
  io?.to(`kitchen:${restaurantId}`).emit('order:new', event);
}

export function emitOrderUpdate(restaurantId: string, orderId: string, status: string): void {
  io?.to(`kitchen:${restaurantId}`).emit('order:update', { orderId, status });
  io?.to(`order:${orderId}`).emit('order:update', { orderId, status });
}

export function emitOrderToCustomer(orderId: string, data: unknown): void {
  io?.to(`order:${orderId}`).emit('order:update', data);
}

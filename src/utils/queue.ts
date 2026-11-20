import { Queue } from 'bullmq';
import { Redis } from 'ioredis';

// Use ioredis for BullMQ (not @upstash/redis — BullMQ needs blocking commands)
const connection = new Redis(process.env['UPSTASH_REDIS_URL'] ?? 'redis://localhost:6379', {
  tls: process.env['UPSTASH_REDIS_URL']?.startsWith('rediss')
    ? { rejectUnauthorized: false }
    : undefined,
  maxRetriesPerRequest: null, // Required by BullMQ
  lazyConnect: true,
});

const defaultJobOptions = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 1000 },
  removeOnComplete: { count: 100 },
  removeOnFail: { count: 50 },
};

// Priority queues: lower number = higher priority
export const orderQueue = new Queue('orders', {
  connection,
  defaultJobOptions: { ...defaultJobOptions, priority: 1 },
});

export const notificationQueue = new Queue('notifications', {
  connection,
  defaultJobOptions: { ...defaultJobOptions, priority: 2, attempts: 5 },
});

export const deliveryQueue = new Queue('delivery', {
  connection,
  defaultJobOptions: { ...defaultJobOptions, priority: 3 },
});

export const voiceQueue = new Queue('voice', {
  connection,
  defaultJobOptions: { ...defaultJobOptions, priority: 5 },
});

export const analyticsQueue = new Queue('analytics', {
  connection,
  defaultJobOptions: { ...defaultJobOptions, priority: 10, attempts: 1 },
});

export { connection as redisConnection };

import { Redis } from '@upstash/redis';

export const redis = new Redis({
  url: process.env['UPSTASH_REDIS_URL']!,
  token: process.env['UPSTASH_REDIS_TOKEN']!,
});

export const CACHE_TTL = {
  PRICING: 60 * 5,       // 5 minutes
  MENU: 60 * 10,         // 10 minutes
  RESTAURANT: 60 * 15,   // 15 minutes
  SESSION: 60 * 60 * 24, // 24 hours
} as const;

export async function getOrSet<T>(
  key: string,
  ttl: number,
  fetcher: () => Promise<T>
): Promise<T> {
  const cached = await redis.get<T>(key);
  if (cached !== null && cached !== undefined) return cached;
  const value = await fetcher();
  await redis.setex(key, ttl, JSON.stringify(value));
  return value;
}

export async function bustCache(key: string): Promise<void> {
  await redis.del(key);
}

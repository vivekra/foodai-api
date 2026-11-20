import { prisma } from '../../../utils/prisma.js';
import { redis, CACHE_TTL } from '../../../utils/redis.js';
import type { CommissionResult } from '@/types';

const PRICING_CACHE_KEY = 'platform:pricing:active';

async function fetchActivePricing() {
  const config = await prisma.platformPricingConfig.findFirst({
    where: { isActive: true },
    orderBy: { version: 'desc' },
    select: {
      freeCommissionRate: true,
      starterCommissionRate: true,
      proCommissionRate: true,
      enterpriseCommissionRate: true,
      voiceSurchargeRate: true,
    },
  });
  if (!config) throw new Error('No active pricing config found in DB');
  return config;
}

export async function getActivePricing() {
  const cached = await redis.get(PRICING_CACHE_KEY);
  if (cached) return cached as Awaited<ReturnType<typeof fetchActivePricing>>;

  const pricing = await fetchActivePricing();
  await redis.setex(PRICING_CACHE_KEY, CACHE_TTL.PRICING, JSON.stringify(pricing));
  return pricing;
}

export async function bustPricingCache(): Promise<void> {
  await redis.del(PRICING_CACHE_KEY);
}

export async function calculateCommission(params: {
  restaurantId: string;
  plan: string;
  subtotalGbp: number; // in pounds, e.g. 12.50
  isVoiceOrder: boolean;
}): Promise<CommissionResult> {
  const pricing = await getActivePricing();

  // Check for restaurant-specific commission override (set by Super Admin)
  const override = await prisma.restaurantPricingOverride.findUnique({
    where: { restaurantId: params.restaurantId },
    select: { commissionRate: true, expiresAt: true },
  });

  let commissionRate: number;

  if (override && (!override.expiresAt || override.expiresAt > new Date())) {
    commissionRate = Number(override.commissionRate);
  } else {
    const rateMap: Record<string, number> = {
      FREE: Number(pricing.freeCommissionRate),
      STARTER: Number(pricing.starterCommissionRate),
      PRO: Number(pricing.proCommissionRate),
      ENTERPRISE: Number(pricing.enterpriseCommissionRate),
    };
    commissionRate = rateMap[params.plan] ?? Number(pricing.freeCommissionRate);
  }

  const voiceRate = params.isVoiceOrder ? Number(pricing.voiceSurchargeRate) : 0;

  // Round to 2 decimal places
  const round2 = (n: number) => Math.round(n * 100) / 100;

  const platformFee = round2((params.subtotalGbp * commissionRate) / 100);
  const voiceSurcharge = round2((params.subtotalGbp * voiceRate) / 100);
  const restaurantAmount = round2(params.subtotalGbp - platformFee - voiceSurcharge);
  const total = round2(params.subtotalGbp + voiceSurcharge); // Platform fee taken from restaurant share

  return {
    subtotal: params.subtotalGbp,
    platformFee,
    voiceSurcharge,
    restaurantAmount,
    total,
    commissionRate,
    voiceRate,
  };
}

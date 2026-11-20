import type { Request, Response } from 'express';
import { getAllQuotes, getDeliveryProvider } from './delivery.service.js';
import { prisma } from '../../../utils/prisma.js';
import { encrypt } from '../../../utils/encryption.js';
import { catchAsync } from '../../../shared/catchAsync.js';
import { sendSuccess } from '../../../shared/sendResponse.js';
import { AppError } from '../../../shared/AppError.js';

export const getQuotes = catchAsync(async (req: Request, res: Response) => {
  const { restaurantId, pickup, dropoff, items, orderValueGbp } = req.body;

  if (!restaurantId || !pickup || !dropoff) {
    throw AppError.badRequest('restaurantId, pickup, and dropoff are required');
  }

  const quotes = await getAllQuotes(restaurantId, {
    pickup,
    dropoff,
    items: items ?? [],
    orderValueGbp: orderValueGbp ?? 0,
  });

  sendSuccess(res, quotes, 'Available courier quotes retrieved');
});

export const dispatchCourier = catchAsync(async (req: Request, res: Response) => {
  const { restaurantId, orderId, provider, quoteId, pickup, dropoff, items, orderValueGbp } = req.body;

  if (!restaurantId || !orderId || !provider) {
    throw AppError.badRequest('restaurantId, orderId, and provider are required');
  }

  const deliveryProvider = await getDeliveryProvider(restaurantId, provider);
  const result = await deliveryProvider.createDelivery({
    orderId,
    quoteId,
    pickup,
    dropoff,
    items: items ?? [],
    orderValueGbp: orderValueGbp ?? 0,
  });

  const updatedOrder = await prisma.order.update({
    where: { id: orderId },
    data: {
      deliveryProvider: result.provider,
      deliveryTrackingUrl: result.trackingUrl,
      deliveryQuoteId: result.deliveryId,
      estimatedDeliveryAt: result.estimatedDeliveryTime ? new Date(result.estimatedDeliveryTime) : undefined,
      status: 'OUT_FOR_DELIVERY',
    },
  });

  sendSuccess(res, { order: updatedOrder, delivery: result }, 'Courier successfully dispatched');
});

export const getDeliveryTracking = catchAsync(async (req: Request, res: Response) => {
  const { orderId } = req.params;

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      deliveryProvider: true,
      deliveryTrackingUrl: true,
      estimatedDeliveryAt: true,
    },
  });

  if (!order) {
    throw AppError.notFound('Order not found');
  }

  sendSuccess(res, order);
});

export const getConfigs = catchAsync(async (req: Request, res: Response) => {
  const { restaurantId } = req.params;

  const configs = await prisma.restaurantDeliveryConfig.findMany({
    where: { restaurantId },
    select: {
      id: true,
      provider: true,
      isEnabled: true,
      mode: true,
      createdAt: true,
      updatedAt: true,
      // Do NOT select encryptedConfig to avoid exposing keys
    },
  });

  sendSuccess(res, configs);
});

export const saveConfig = catchAsync(async (req: Request, res: Response) => {
  const { restaurantId } = req.params;
  const { provider, isEnabled, mode, apiKey, clientId, clientSecret, customerId } = req.body;

  if (!restaurantId || !provider) {
    throw AppError.badRequest('restaurantId and provider are required');
  }

  let encryptedConfig: string | null = null;
  if (mode === 'byok' && (apiKey || clientId || clientSecret)) {
    const sensitivePayload = JSON.stringify({
      apiKey,
      clientId,
      clientSecret,
      customerId,
    });
    encryptedConfig = encrypt(sensitivePayload);
  }

  const config = await prisma.restaurantDeliveryConfig.upsert({
    where: {
      restaurantId_provider: {
        restaurantId: restaurantId as string,
        provider,
      },
    },
    update: {
      isEnabled,
      mode: mode ?? 'platform',
      ...(encryptedConfig ? { encryptedConfig } : {}),
    },
    create: {
      restaurantId: restaurantId as string,
      provider,
      isEnabled,
      mode: mode ?? 'platform',
      encryptedConfig,
    },
    select: {
      id: true,
      provider: true,
      isEnabled: true,
      mode: true,
    },
  });

  sendSuccess(res, config, `Delivery config for ${provider} saved`);
});

import type { Request, Response } from 'express';
import { prisma } from '../../../utils/prisma.js';
import { calculateCommission } from '../pricing/pricing.service.js';
import { emitNewOrder } from '../kitchen/kitchen.gateway.js';
import { sendPaymentLink } from '../notifications/whatsapp.service.js';
import { catchAsync } from '../../../shared/catchAsync.js';
import { sendCreated, sendSuccess } from '../../../shared/sendResponse.js';
import { AppError } from '../../../shared/AppError.js';
import type { KitchenOrderEvent } from '@/types';

export const handleInboundCall = catchAsync(async (req: Request, res: Response) => {
  const { Called, From, CallSid } = req.body;

  // Find restaurant associated with this inbound phone number
  const restaurant = await prisma.restaurant.findFirst({
    where: {
      OR: [
        { aiVoiceAgentPhone: Called },
        { phone: Called },
      ],
      isActive: true,
      aiVoiceAgentEnabled: true,
    },
    select: { id: true, name: true },
  });

  if (!restaurant) {
    res.type('text/xml');
    res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Amy">Sorry, this restaurant is currently unable to take phone orders. Please visit our website to place your order. Goodbye.</Say>
  <Hangup/>
</Response>`);
    return;
  }

  // Log incoming call session
  await prisma.aICallLog.create({
    data: {
      restaurantId: restaurant.id,
      callSid: CallSid || `CALL-${Date.now()}`,
      callerPhone: From ?? null,
      outcome: 'IN_PROGRESS',
    },
  });

  const wsUrl = process.env['VOICE_AGENT_WS_URL'] ?? 'wss://voice.foodai.co.uk/media';

  // Generate TwiML response to stream bidirectional audio to LiveKit / voice agent
  res.type('text/xml');
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Amy">Welcome to ${restaurant.name}. Connecting you to our automated ordering assistant.</Say>
  <Connect>
    <Stream url="${wsUrl}">
      <Parameter name="restaurantId" value="${restaurant.id}" />
      <Parameter name="callSid" value="${CallSid}" />
    </Stream>
  </Connect>
</Response>`);
});

export const createVoiceOrder = catchAsync(async (req: Request, res: Response) => {
  const {
    restaurantId,
    callSid,
    callerPhone,
    items,
    deliveryAddress,
    specialInstructions,
    transcript,
    durationSec,
  } = req.body;

  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: {
      id: true,
      name: true,
      subscriptionPlan: true,
      avgPrepTimeMinutes: true,
      isActive: true,
    },
  });

  if (!restaurant || !restaurant.isActive) {
    throw AppError.badRequest('Restaurant not found or inactive');
  }

  // Fetch menu items from DB
  const itemIds = items.map((i: any) => i.menuItemId);
  const dbMenuItems = await prisma.menuItem.findMany({
    where: { id: { in: itemIds }, restaurantId, isActive: true },
  });

  const menuMap = new Map(dbMenuItems.map((item) => [item.id, item]));

  let subtotal = 0;
  const processedItems = items.map((clientItem: any) => {
    const dbItem = menuMap.get(clientItem.menuItemId);
    const basePrice = dbItem ? Number(dbItem.basePrice) : Number(clientItem.unitPrice || 0);
    const unitPrice = basePrice;
    const itemTotal = Math.round(unitPrice * clientItem.quantity * 100) / 100;
    subtotal += itemTotal;

    return {
      menuItemId: dbItem ? dbItem.id : clientItem.menuItemId,
      name: dbItem ? dbItem.name : clientItem.name,
      quantity: clientItem.quantity,
      unitPrice,
      total: itemTotal,
      selectedSize: clientItem.selectedSize ?? null,
      selectedAddons: clientItem.selectedAddons ?? [],
      notes: clientItem.notes ?? null,
    };
  });

  subtotal = Math.round(subtotal * 100) / 100;

  // Commission calculation with mandatory +2% voice surcharge
  const commission = await calculateCommission({
    restaurantId,
    plan: restaurant.subscriptionPlan,
    subtotalGbp: subtotal,
    isVoiceOrder: true,
  });

  const orderNumber = `UK-V${Date.now().toString(36).toUpperCase().slice(-3)}-${Math.floor(1000 + Math.random() * 9000)}`;

  const order = await prisma.order.create({
    data: {
      restaurantId,
      orderNumber,
      orderType: 'VOICE',
      subtotal,
      platformFee: commission.platformFee,
      voiceSurcharge: commission.voiceSurcharge,
      total: commission.total,
      deliveryAddress: deliveryAddress ?? null,
      specialInstructions: specialInstructions ?? null,
      placedByAI: true,
      aiChannel: 'phone_call',
      estimatedPrepTime: restaurant.avgPrepTimeMinutes,
      items: {
        create: processedItems.map((item) => ({
          menuItemId: item.menuItemId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          total: item.total,
          selectedSize: item.selectedSize ?? undefined,
          selectedAddons: item.selectedAddons ?? [],
          notes: item.notes ?? undefined,
        })),
      },
    },
    include: {
      items: {
        include: {
          menuItem: { select: { name: true } },
        },
      },
    },
  });

  // Link AI call log
  if (callSid) {
    await prisma.aICallLog.upsert({
      where: { callSid },
      update: {
        orderId: order.id,
        durationSec: durationSec ?? null,
        transcript: transcript ?? null,
        outcome: 'ORDER_PLACED',
      },
      create: {
        restaurantId,
        orderId: order.id,
        callSid,
        callerPhone: callerPhone ?? null,
        durationSec: durationSec ?? null,
        transcript: transcript ?? null,
        outcome: 'ORDER_PLACED',
      },
    });
  }

  // Emit to kitchen display
  const kitchenEvent: KitchenOrderEvent = {
    orderId: order.id,
    orderNumber: order.orderNumber,
    orderType: 'VOICE',
    items: order.items.map((i) => ({
      name: i.menuItem.name,
      quantity: i.quantity,
      selectedSize: i.selectedSize ? (i.selectedSize as any).name : undefined,
      selectedAddons: [],
      notes: i.notes ?? undefined,
    })),
    specialInstructions: order.specialInstructions ?? undefined,
    createdAt: order.createdAt.toISOString(),
    isVoiceOrder: true,
  };

  emitNewOrder(restaurantId, kitchenEvent);

  // Send WhatsApp payment link if phone provided
  if (callerPhone) {
    const paymentUrl = `${process.env['NEXT_PUBLIC_WEB_URL']}/checkout?orderId=${order.id}`;
    void sendPaymentLink({
      to: callerPhone,
      paymentUrl,
      orderNumber: order.orderNumber,
      total: Number(order.total),
    });
  }

  sendCreated(res, order, 'Voice agent order created successfully');
});

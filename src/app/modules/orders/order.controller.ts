import type { Request, Response } from 'express';
import { prisma } from '../../../utils/prisma.js';
import { calculateCommission } from '../pricing/pricing.service.js';
import { emitNewOrder, emitOrderUpdate } from '../kitchen/kitchen.gateway.js';
import { sendOrderConfirmation, sendOrderStatusUpdate } from '../notifications/whatsapp.service.js';
import { catchAsync } from '../../../shared/catchAsync.js';
import { sendCreated, sendPaginated, sendSuccess } from '../../../shared/sendResponse.js';
import { AppError } from '../../../shared/AppError.js';
import type { KitchenOrderEvent } from '@/types';

export const createOrder = catchAsync(async (req: Request, res: Response) => {
  const {
    restaurantId,
    orderType,
    tableId,
    items,
    deliveryAddress,
    specialInstructions,
    customerPhone,
    placedByAI,
    aiChannel,
  } = req.body;

  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: {
      id: true,
      name: true,
      subscriptionPlan: true,
      isActive: true,
      avgPrepTimeMinutes: true,
    },
  });

  if (!restaurant || !restaurant.isActive) {
    throw AppError.badRequest('Restaurant not found or currently inactive');
  }

  // Fetch menu items from DB to verify price integrity
  const itemIds = items.map((i: any) => i.menuItemId);
  const dbMenuItems = await prisma.menuItem.findMany({
    where: { id: { in: itemIds }, restaurantId, isActive: true },
  });

  if (dbMenuItems.length !== itemIds.length) {
    throw AppError.badRequest('One or more selected menu items are invalid or unavailable');
  }

  const menuMap = new Map(dbMenuItems.map((item) => [item.id, item]));

  // Calculate subtotal securely from server prices
  let subtotal = 0;
  const processedItems = items.map((clientItem: any) => {
    const dbItem = menuMap.get(clientItem.menuItemId)!;
    const basePrice = Number(dbItem.basePrice);
    const sizeModifier = clientItem.selectedSize?.priceModifier ? Number(clientItem.selectedSize.priceModifier) : 0;
    const addonsCost = (clientItem.selectedAddons || []).reduce(
      (sum: number, addon: any) => sum + (Number(addon.price) || 0),
      0
    );

    const unitPrice = Math.round((basePrice + sizeModifier + addonsCost) * 100) / 100;
    const itemTotal = Math.round(unitPrice * clientItem.quantity * 100) / 100;
    subtotal += itemTotal;

    return {
      menuItemId: dbItem.id,
      name: dbItem.name,
      quantity: clientItem.quantity,
      unitPrice,
      total: itemTotal,
      selectedSize: clientItem.selectedSize ?? null,
      selectedAddons: clientItem.selectedAddons ?? [],
      notes: clientItem.notes ?? null,
    };
  });

  subtotal = Math.round(subtotal * 100) / 100;

  // Calculate commission & fees via pricing engine
  const isVoiceOrder = orderType === 'VOICE' || Boolean(placedByAI);
  const commission = await calculateCommission({
    restaurantId,
    plan: restaurant.subscriptionPlan,
    subtotalGbp: subtotal,
    isVoiceOrder,
  });

  // Unique UK Order Number (e.g. UK-M3K7-4829)
  const orderNumber = `UK-${Date.now().toString(36).toUpperCase().slice(-4)}-${Math.floor(1000 + Math.random() * 9000)}`;

  // Save Order & OrderItems in transaction
  const order = await prisma.order.create({
    data: {
      restaurantId,
      userId: req.user?.id ?? null,
      tableId: tableId ?? null,
      orderNumber,
      orderType: orderType ?? 'COUNTER',
      subtotal,
      platformFee: commission.platformFee,
      voiceSurcharge: commission.voiceSurcharge,
      total: commission.total,
      deliveryAddress: deliveryAddress ?? null,
      specialInstructions: specialInstructions ?? null,
      placedByAI: Boolean(placedByAI),
      aiChannel: aiChannel ?? null,
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
          menuItem: { select: { name: true, imageUrl: true } },
        },
      },
      table: { select: { tableNumber: true } },
    },
  });

  // Emit real-time alert to kitchen display systems (KDS)
  const kitchenEvent: KitchenOrderEvent = {
    orderId: order.id,
    orderNumber: order.orderNumber,
    orderType: order.orderType,
    tableNumber: order.table?.tableNumber,
    items: order.items.map((i) => ({
      name: i.menuItem.name,
      quantity: i.quantity,
      selectedSize: i.selectedSize ? (i.selectedSize as any).name : undefined,
      selectedAddons: Array.isArray(i.selectedAddons)
        ? (i.selectedAddons as any[]).map((a) => a.name)
        : [],
      notes: i.notes ?? undefined,
    })),
    specialInstructions: order.specialInstructions ?? undefined,
    createdAt: order.createdAt.toISOString(),
    isVoiceOrder,
  };

  emitNewOrder(restaurantId, kitchenEvent);

  // Send WhatsApp confirmation if phone provided
  const targetPhone = customerPhone || deliveryAddress?.contactPhone || req.user?.phone;
  if (targetPhone) {
    void sendOrderConfirmation({
      to: targetPhone,
      orderNumber: order.orderNumber,
      restaurantName: restaurant.name,
      total: Number(order.total),
      orderType: order.orderType,
    });
  }

  sendCreated(res, order, 'Order placed successfully');
});

export const getOrders = catchAsync(async (req: Request, res: Response) => {
  const page = Math.max(1, Number(req.query['page']) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query['limit']) || 20));
  const skip = (page - 1) * limit;

  const restaurantId = req.query['restaurantId'] as string | undefined;
  const status = req.query['status'] as any;
  const orderType = req.query['orderType'] as any;
  const userId = req.user?.id;

  const where: any = {};

  if (restaurantId) where.restaurantId = restaurantId;
  if (status) where.status = status;
  if (orderType) where.orderType = orderType;
  if (req.user?.role === 'CUSTOMER' && userId) {
    where.userId = userId;
  }

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        items: {
          include: {
            menuItem: { select: { name: true, imageUrl: true } },
          },
        },
        table: { select: { tableNumber: true } },
        restaurant: { select: { id: true, name: true, slug: true } },
      },
    }),
    prisma.order.count({ where }),
  ]);

  sendPaginated(res, orders, { page, limit, total });
});

export const getOrderById = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;

  const order = await prisma.order.findFirst({
    where: {
      OR: [{ id }, { orderNumber: id }],
    },
    include: {
      items: {
        include: {
          menuItem: { select: { name: true, imageUrl: true } },
        },
      },
      table: { select: { tableNumber: true } },
      restaurant: {
        select: {
          id: true,
          name: true,
          slug: true,
          phone: true,
          addressLine1: true,
          city: true,
          postcode: true,
        },
      },
    },
  });

  if (!order) {
    throw AppError.notFound('Order not found');
  }

  sendSuccess(res, order);
});

export const updateOrderStatus = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { status, estimatedPrepTime } = req.body;

  const validStatuses = [
    'PENDING',
    'ACCEPTED',
    'PREPARING',
    'READY',
    'OUT_FOR_DELIVERY',
    'DELIVERED',
    'COMPLETED',
    'CANCELLED',
    'REJECTED',
  ];

  if (!validStatuses.includes(status)) {
    throw AppError.badRequest(`Invalid order status: ${status}`);
  }

  const existingOrder = await prisma.order.findUnique({
    where: { id },
    include: {
      user: { select: { phone: true, whatsappPhone: true } },
    },
  });

  if (!existingOrder) {
    throw AppError.notFound('Order not found');
  }

  const updateData: any = { status };
  if (status === 'ACCEPTED') updateData.acceptedAt = new Date();
  if (status === 'READY') updateData.readyAt = new Date();
  if (status === 'DELIVERED' || status === 'COMPLETED') updateData.completedAt = new Date();
  if (status === 'CANCELLED' || status === 'REJECTED') updateData.cancelledAt = new Date();
  if (estimatedPrepTime) updateData.estimatedPrepTime = Number(estimatedPrepTime);

  const updatedOrder = await prisma.order.update({
    where: { id },
    data: updateData,
  });

  // Real-time broadcast to kitchen and customer sockets
  emitOrderUpdate(existingOrder.restaurantId, existingOrder.id, status);

  // Send WhatsApp update to customer
  const customerPhone =
    existingOrder.user?.whatsappPhone ||
    existingOrder.user?.phone ||
    (existingOrder.deliveryAddress as any)?.contactPhone;

  if (customerPhone) {
    void sendOrderStatusUpdate({
      to: customerPhone,
      orderNumber: existingOrder.orderNumber,
      status,
      estimatedMinutes: updatedOrder.estimatedPrepTime ?? undefined,
      trackingUrl: existingOrder.deliveryTrackingUrl ?? undefined,
    });
  }

  sendSuccess(res, updatedOrder, `Order status updated to ${status}`);
});

export const cancelOrder = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { reason } = req.body;

  const updatedOrder = await prisma.order.update({
    where: { id },
    data: {
      status: 'CANCELLED',
      cancelledAt: new Date(),
      cancelReason: reason ?? 'Cancelled by restaurant/user',
    },
  });

  emitOrderUpdate(updatedOrder.restaurantId, updatedOrder.id, 'CANCELLED');

  sendSuccess(res, updatedOrder, 'Order cancelled');
});

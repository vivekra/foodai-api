import type { Request, Response } from 'express';
import {
  createConnectAccount,
  createAccountLink,
  createCheckoutSession as stripeCreateCheckout,
  validateStripeWebhook,
} from './stripe.service.js';
import { prisma } from '../../../utils/prisma.js';
import { emitOrderUpdate } from '../kitchen/kitchen.gateway.js';
import { catchAsync } from '../../../shared/catchAsync.js';
import { sendCreated, sendSuccess } from '../../../shared/sendResponse.js';
import { AppError } from '../../../shared/AppError.js';
import { logger } from '../../middleware/Logger.js';

export const createCheckout = catchAsync(async (req: Request, res: Response) => {
  const { orderId, successUrl, cancelUrl, customerEmail } = req.body;

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      restaurant: {
        select: {
          id: true,
          stripeAccountId: true,
          subscriptionPlan: true,
        },
      },
    },
  });

  if (!order) {
    throw AppError.notFound('Order not found');
  }

  if (!order.restaurant.stripeAccountId) {
    throw AppError.badRequest('Restaurant has not completed Stripe Connect onboarding');
  }

  const subtotalPence = Math.round(Number(order.subtotal) * 100);

  const session = await stripeCreateCheckout({
    restaurantId: order.restaurantId,
    orderId: order.id,
    subtotalPence,
    plan: order.restaurant.subscriptionPlan,
    isVoiceOrder: order.placedByAI || order.orderType === 'VOICE',
    stripeAccountId: order.restaurant.stripeAccountId,
    customerEmail,
    successUrl: successUrl || `${process.env['NEXT_PUBLIC_WEB_URL']}/orders/${order.id}?status=success`,
    cancelUrl: cancelUrl || `${process.env['NEXT_PUBLIC_WEB_URL']}/orders/${order.id}?status=cancelled`,
  });

  await prisma.order.update({
    where: { id: order.id },
    data: {
      paymentLinkUrl: session.url,
      paymentIntentId: typeof session.payment_intent === 'string' ? session.payment_intent : undefined,
    },
  });

  sendSuccess(res, { checkoutUrl: session.url, sessionId: session.id });
});

export const onboardConnect = catchAsync(async (req: Request, res: Response) => {
  const { restaurantId, email } = req.body;

  if (!restaurantId || !email) {
    throw AppError.badRequest('restaurantId and email are required');
  }

  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { id: true, stripeAccountId: true },
  });

  if (!restaurant) {
    throw AppError.notFound('Restaurant not found');
  }

  let stripeAccountId = restaurant.stripeAccountId;
  if (!stripeAccountId) {
    const account = await createConnectAccount(email);
    stripeAccountId = account.id;

    await prisma.restaurant.update({
      where: { id: restaurantId },
      data: { stripeAccountId },
    });
  }

  const accountLink = await createAccountLink(stripeAccountId);

  sendCreated(res, { onboardingUrl: accountLink.url, stripeAccountId });
});

export const getConnectStatus = catchAsync(async (req: Request, res: Response) => {
  const { restaurantId } = req.params;

  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: {
      id: true,
      stripeAccountId: true,
      stripeOnboarded: true,
    },
  });

  if (!restaurant) {
    throw AppError.notFound('Restaurant not found');
  }

  sendSuccess(res, restaurant);
});

export const handleWebhook = async (req: Request, res: Response): Promise<void> => {
  const sig = req.headers['stripe-signature'];
  if (!sig || typeof sig !== 'string') {
    res.status(400).send('Missing stripe-signature header');
    return;
  }

  try {
    const rawBody = (req as any).rawBody ?? req.body;
    const event = await validateStripeWebhook(rawBody, sig);

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as any;
      const orderId = session.metadata?.orderId;

      if (orderId) {
        const updated = await prisma.order.update({
          where: { id: orderId },
          data: {
            paymentStatus: 'PAID',
            paymentMethod: session.payment_method_types?.[0] ?? 'card',
          },
        });

        emitOrderUpdate(updated.restaurantId, updated.id, updated.status);
        logger.info({ orderId }, 'Stripe webhook: order marked as PAID');
      }
    }

    res.json({ received: true });
  } catch (err: any) {
    logger.error({ err }, 'Stripe webhook verification failed');
    res.status(400).send(`Webhook Error: ${err.message}`);
  }
};

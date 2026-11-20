import Stripe from 'stripe';
import { calculateCommission } from '../pricing/pricing.service.js';
import { AppError } from '../../../shared/AppError.js';

const stripe = new Stripe(process.env['STRIPE_SECRET_KEY']!, {
  apiVersion: '2024-11-20.acacia',
  typescript: true,
});

export { stripe };

export async function createConnectAccount(email: string): Promise<Stripe.Account> {
  return stripe.accounts.create({
    type: 'express',
    country: 'GB',
    email,
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
    settings: {
      payouts: {
        schedule: { interval: 'weekly', weekly_anchor: 'friday' },
      },
    },
  });
}

export async function createAccountLink(accountId: string): Promise<Stripe.AccountLink> {
  return stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${process.env['NEXT_PUBLIC_MERCHANT_URL']}/onboarding/refresh`,
    return_url: `${process.env['NEXT_PUBLIC_MERCHANT_URL']}/onboarding/success`,
    type: 'account_onboarding',
  });
}

export async function createCheckoutSession(params: {
  restaurantId: string;
  orderId: string;
  subtotalPence: number; // amount in pence (GBP)
  plan: string;
  isVoiceOrder: boolean;
  stripeAccountId: string;
  customerEmail?: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<Stripe.Checkout.Session> {
  const commission = await calculateCommission({
    restaurantId: params.restaurantId,
    plan: params.plan,
    subtotalGbp: params.subtotalPence / 100,
    isVoiceOrder: params.isVoiceOrder,
  });

  const applicationFeeAmount = Math.round(
    (commission.platformFee + commission.voiceSurcharge) * 100
  );

  return stripe.checkout.sessions.create({
    mode: 'payment',
    currency: 'gbp',
    payment_intent_data: {
      application_fee_amount: applicationFeeAmount,
      transfer_data: { destination: params.stripeAccountId },
      metadata: {
        orderId: params.orderId,
        restaurantId: params.restaurantId,
        platformFeeGbp: commission.platformFee.toFixed(2),
        voiceSurchargeGbp: commission.voiceSurcharge.toFixed(2),
      },
    },
    line_items: [
      {
        price_data: {
          currency: 'gbp',
          unit_amount: Math.round(commission.total * 100),
          product_data: { name: `Order #${params.orderId.slice(-6).toUpperCase()}` },
        },
        quantity: 1,
      },
    ],
    customer_email: params.customerEmail,
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    metadata: { orderId: params.orderId },
  });
}

export async function validateStripeWebhook(
  payload: Buffer,
  signature: string
): Promise<Stripe.Event> {
  try {
    return stripe.webhooks.constructEvent(
      payload,
      signature,
      process.env['STRIPE_WEBHOOK_SECRET']!
    );
  } catch {
    throw AppError.badRequest('Invalid Stripe webhook signature');
  }
}

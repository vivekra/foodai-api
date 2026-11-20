import twilio from 'twilio';
import { logger } from '../../middleware/Logger.js';

const client = twilio(
  process.env['TWILIO_ACCOUNT_SID']!,
  process.env['TWILIO_AUTH_TOKEN']!
);

const FROM = process.env['TWILIO_WHATSAPP_FROM']!;

function formatTo(phone: string): string {
  const normalized = phone.startsWith('+') ? phone : `+${phone}`;
  return `whatsapp:${normalized}`;
}

export async function sendOrderConfirmation(params: {
  to: string;
  orderNumber: string;
  restaurantName: string;
  total: number;
  paymentUrl?: string;
  orderType: string;
}): Promise<void> {
  const paymentLine = params.paymentUrl
    ? `\n\n💳 *Pay here:* ${params.paymentUrl}`
    : '';

  const body = `🍽️ *Order Confirmed!*\n\nOrder: *#${params.orderNumber}*\n📍 ${params.restaurantName}\n💰 Total: *£${params.total.toFixed(2)}*${paymentLine}\n\nWe'll keep you updated as your order progresses. Thank you! 🙏`;

  try {
    await client.messages.create({ from: FROM, to: formatTo(params.to), body });
    logger.info({ orderNumber: params.orderNumber }, 'WhatsApp: order confirmation sent');
  } catch (err) {
    // Never throw — notification failure must NOT fail the order
    logger.error({ err, orderNumber: params.orderNumber }, 'WhatsApp: order confirmation failed');
  }
}

export async function sendPaymentLink(params: {
  to: string;
  paymentUrl: string;
  orderNumber: string;
  total: number;
}): Promise<void> {
  const body = `💳 *Payment Required*\n\nOrder *#${params.orderNumber}* — £${params.total.toFixed(2)}\n\nComplete payment: ${params.paymentUrl}\n\n⏰ Link expires in 30 minutes.`;

  try {
    await client.messages.create({ from: FROM, to: formatTo(params.to), body });
    logger.info({ orderNumber: params.orderNumber }, 'WhatsApp: payment link sent');
  } catch (err) {
    logger.error({ err }, 'WhatsApp: payment link failed');
  }
}

export async function sendOrderStatusUpdate(params: {
  to: string;
  orderNumber: string;
  status: string;
  estimatedMinutes?: number;
  trackingUrl?: string;
}): Promise<void> {
  const messages: Record<string, string> = {
    ACCEPTED: `✅ Order *#${params.orderNumber}* accepted!\n⏱️ Estimated time: ${params.estimatedMinutes ?? 20} minutes.`,
    REJECTED: `❌ Sorry, order *#${params.orderNumber}* was not accepted.\nYou will receive a full refund within 3-5 business days.`,
    READY: `🎉 Order *#${params.orderNumber}* is ready for collection!`,
    OUT_FOR_DELIVERY: `🛵 Your order is on its way!${params.trackingUrl ? `\n📍 Track here: ${params.trackingUrl}` : ''}`,
    DELIVERED: `✅ Order *#${params.orderNumber}* delivered!\nEnjoy your meal! 🍽️ Please leave us a review.`,
  };

  const body = messages[params.status] ?? `Order *#${params.orderNumber}* — Status: ${params.status}`;

  try {
    await client.messages.create({ from: FROM, to: formatTo(params.to), body });
    logger.info({ orderNumber: params.orderNumber, status: params.status }, 'WhatsApp: status update sent');
  } catch (err) {
    logger.error({ err }, 'WhatsApp: status update failed');
  }
}

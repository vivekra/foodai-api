import twilio from 'twilio';
import { logger } from '../../middleware/Logger.js';

const client = twilio(
  process.env['TWILIO_ACCOUNT_SID']!,
  process.env['TWILIO_AUTH_TOKEN']!
);

const FROM = process.env['TWILIO_PHONE_NUMBER']!;

export async function sendSms(to: string, body: string): Promise<void> {
  try {
    await client.messages.create({ from: FROM, to, body });
    logger.info({ to: to.slice(-4) }, 'SMS sent');
  } catch (err) {
    logger.error({ err }, 'SMS send failed');
  }
}

export async function sendOrderSms(params: {
  to: string;
  orderNumber: string;
  status: string;
  restaurantName: string;
}): Promise<void> {
  const messages: Record<string, string> = {
    ACCEPTED: `FoodAI: Order #${params.orderNumber} at ${params.restaurantName} accepted! We'll notify you when ready.`,
    REJECTED: `FoodAI: Sorry, order #${params.orderNumber} was rejected. Full refund in 3-5 days.`,
    READY: `FoodAI: Order #${params.orderNumber} is ready! Please collect from ${params.restaurantName}.`,
    DELIVERED: `FoodAI: Order #${params.orderNumber} delivered. Enjoy your meal!`,
  };

  const body = messages[params.status] ?? `FoodAI: Order #${params.orderNumber} - ${params.status}`;
  await sendSms(params.to, body);
}

import OpenAI from 'openai';
import { prisma } from '../../../utils/prisma.js';
import { AppError } from '../../../shared/AppError.js';
import { logger } from '../../middleware/Logger.js';

const openai = new OpenAI({ apiKey: process.env['OPENAI_API_KEY']! });

const INJECTION_PATTERNS = [
  /ignore\s+(previous|all|above)/i,
  /forget\s+(your|previous|all)/i,
  /disregard\s+(instructions|rules)/i,
  /(system|admin)\s*prompt/i,
  /jailbreak/i,
  /\[SYSTEM\]/i,
  /\[INST\]/i,
];

/**
 * Sanitize user input before sending to AI — prevent prompt injection.
 */
export function sanitizeInput(input: string): string {
  let sanitized = input.replace(/[<>]/g, '').trim().slice(0, 2000);

  for (const pattern of INJECTION_PATTERNS) {
    sanitized = sanitized.replace(pattern, '[removed]');
  }

  return sanitized;
}

export async function getMenuForAI(restaurantId: string) {
  return prisma.menuCategory.findMany({
    where: { restaurantId, isActive: true },
    include: {
      items: {
        where: { isActive: true },
        select: {
          id: true,
          name: true,
          description: true,
          basePrice: true,
          sizes: true,
          addons: true,
          dietary: true,
          allergens: true,
          spiceLevel: true,
          calories: true,
        },
        orderBy: { sortOrder: 'asc' },
      },
    },
    orderBy: { sortOrder: 'asc' },
  });
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AiChatResponse {
  message: string;
  action: 'none' | 'show_items' | 'confirm_order' | 'call_staff';
  items?: Array<{ menuItemId: string; name: string; quantity: number; unitPrice: number }>;
  suggestedItems?: Array<{ id: string; name: string; price: number }>;
}

export async function processChat(params: {
  restaurantId: string;
  message: string;
  conversationHistory: ChatMessage[];
  userId?: string;
}): Promise<AiChatResponse> {
  const sanitized = sanitizeInput(params.message);
  if (!sanitized) throw AppError.badRequest('Message is empty or invalid');

  const [menu, restaurant] = await Promise.all([
    getMenuForAI(params.restaurantId),
    prisma.restaurant.findUnique({
      where: { id: params.restaurantId },
      select: { name: true, minimumOrderAmount: true, isActive: true },
    }),
  ]);

  if (!restaurant || !restaurant.isActive) {
    throw AppError.notFound('Restaurant not found or not active');
  }

  const systemPrompt = `You are a helpful food ordering assistant for "${restaurant.name}".
Your job: help customers browse the menu, answer questions, and place orders.
Be friendly, concise, and helpful. Only discuss items on the MENU below.
Minimum order: £${restaurant.minimumOrderAmount}.

Respond ONLY with valid JSON in this exact format:
{
  "message": "Your friendly response here",
  "action": "none|show_items|confirm_order|call_staff",
  "items": [{"menuItemId":"...","name":"...","quantity":1,"unitPrice":0.00}],
  "suggestedItems": [{"id":"...","name":"...","price":0.00}]
}

Rules:
- Never make up menu items or prices not in the MENU.
- action="confirm_order" only when customer explicitly says they want to order and items are selected.
- action="show_items" when you want to highlight specific items.
- action="call_staff" if customer has a complaint or complex request.
- action="none" for general chat.

MENU:
${JSON.stringify(menu, null, 2)}`;

  const response = await openai.chat.completions.create({
    model: process.env['OPENAI_MODEL'] ?? 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      ...params.conversationHistory.slice(-10), // last 10 messages
      { role: 'user', content: sanitized },
    ],
    response_format: { type: 'json_object' },
    max_tokens: 600,
    temperature: 0.7,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    return { message: "Sorry, I couldn't process that. Please try again.", action: 'none' };
  }

  try {
    return JSON.parse(content) as AiChatResponse;
  } catch {
    logger.warn({ content }, 'AI returned invalid JSON — using fallback');
    return { message: content, action: 'none' };
  }
}

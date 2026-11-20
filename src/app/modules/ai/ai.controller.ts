import type { Request, Response } from 'express';
import { processChat } from './ai.service.js';
import { catchAsync } from '../../../shared/catchAsync.js';
import { sendSuccess } from '../../../shared/sendResponse.js';
import { AppError } from '../../../shared/AppError.js';

export const chatWithAssistant = catchAsync(async (req: Request, res: Response) => {
  const { restaurantId, message, conversationHistory } = req.body;

  if (!restaurantId || !message) {
    throw AppError.badRequest('restaurantId and message are required');
  }

  const result = await processChat({
    restaurantId,
    message,
    conversationHistory: conversationHistory ?? [],
    userId: req.user?.id,
  });

  sendSuccess(res, result);
});

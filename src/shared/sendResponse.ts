import type { Response } from 'express';

interface ResponsePayload<T> {
  success: boolean;
  message: string;
  data?: T;
  meta?: Record<string, unknown>;
  errors?: Record<string, string[]>;
}

export function sendResponse<T>(
  res: Response,
  statusCode: number,
  payload: ResponsePayload<T>
): Response {
  return res.status(statusCode).json(payload);
}

export function sendSuccess<T>(
  res: Response,
  data: T,
  message = 'Success',
  statusCode = 200
): Response {
  return sendResponse(res, statusCode, { success: true, message, data });
}

export function sendCreated<T>(res: Response, data: T, message = 'Created'): Response {
  return sendSuccess(res, data, message, 201);
}

export function sendPaginated<T>(
  res: Response,
  data: T[],
  meta: { page: number; limit: number; total: number },
  message = 'Success'
): Response {
  return sendResponse(res, 200, {
    success: true,
    message,
    data: data as unknown as T,
    meta: {
      ...meta,
      totalPages: Math.ceil(meta.total / meta.limit),
    },
  });
}

export function sendNoContent(res: Response): Response {
  return res.status(204).send();
}

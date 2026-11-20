export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly errors?: Record<string, string[]>;

  constructor(
    message: string,
    statusCode: number = 500,
    errors?: Record<string, string[]>
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.isOperational = true;
    this.errors = errors;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message: string, errors?: Record<string, string[]>) {
    return new AppError(message, 400, errors);
  }
  static unauthorized(message = 'Authentication required') {
    return new AppError(message, 401);
  }
  static forbidden(message = 'Insufficient permissions') {
    return new AppError(message, 403);
  }
  static notFound(message = 'Resource not found') {
    return new AppError(message, 404);
  }
  static conflict(message: string) {
    return new AppError(message, 409);
  }
  static tooManyRequests(message = 'Too many requests') {
    return new AppError(message, 429);
  }
  static internal(message = 'Internal server error') {
    return new AppError(message, 500);
  }
}

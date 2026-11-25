import type { ApiError, ApiErrorCode } from '@darvas/contracts';
import type { ErrorRequestHandler, RequestHandler, Response } from 'express';
import { ZodError } from 'zod';

export function sendError(response: Response, status: number, code: ApiErrorCode, message: string) {
  const requestId = String(response.getHeader('x-request-id'));
  const body: ApiError = { success: false, error: { code, message, requestId } };
  response.status(status).json(body);
}

export const notFoundHandler: RequestHandler = (_request, response) => {
  sendError(response, 404, 'NOT_FOUND', 'The requested resource was not found.');
};

export const errorHandler: ErrorRequestHandler = (error: unknown, request, response, next) => {
  if (response.headersSent) {
    next(error);
    return;
  }
  if (error instanceof ZodError) {
    sendError(response, 422, 'VALIDATION_ERROR', 'Request validation failed.');
    return;
  }
  if (error instanceof SyntaxError && 'status' in error && error.status === 400) {
    sendError(response, 400, 'VALIDATION_ERROR', 'Request body must be valid JSON.');
    return;
  }
  if (error instanceof Error && 'status' in error && error.status === 413) {
    sendError(response, 413, 'VALIDATION_ERROR', 'Request body exceeds the allowed size.');
    return;
  }
  // Record a safe classification, never exception messages, bodies, or configuration.
  request.log.error(
    { errorType: error instanceof Error ? error.name : 'UnknownError' },
    'Request failed',
  );
  sendError(response, 500, 'INTERNAL_ERROR', 'An unexpected error occurred.');
};

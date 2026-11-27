import type { ApiError, ApiErrorCode } from '@darvas/contracts';
import type { ErrorRequestHandler, RequestHandler, Response } from 'express';
import { ZodError } from 'zod';
import { AuthError } from '../modules/auth/service.js';
import { InvitationError } from '../modules/invitations/types.js';

export function sendError(response: Response, status: number, code: ApiErrorCode, message: string) {
  const requestId = String(response.getHeader('x-request-id'));
  const body: ApiError = { success: false, error: { code, message, requestId } };
  response
    .status(status)
    .json(
      /^\/api\/v1\/(auth|invitations)(\/|\?|$)/.test(response.req.originalUrl)
        ? { error: body.error }
        : body,
    );
}

export const notFoundHandler: RequestHandler = (_request, response) => {
  sendError(response, 404, 'NOT_FOUND', 'The requested resource was not found.');
};

export const errorHandler: ErrorRequestHandler = (error: unknown, request, response, next) => {
  if (response.headersSent) {
    next(error);
    return;
  }
  // Authentication/authorization guards are reusable outside the auth router.
  if (error instanceof AuthError || error instanceof InvitationError) {
    response.status(error.status).json({
      error: {
        code: error.code,
        message: error.message,
        requestId: String(response.getHeader('x-request-id')),
      },
    });
    return;
  }
  if (/^\/api\/v1\/(auth|invitations)(\/|\?|$)/.test(request.originalUrl)) {
    const oversized = error instanceof Error && 'status' in error && error.status === 413;
    const status = oversized
      ? 413
      : error instanceof ZodError
        ? 422
        : error instanceof SyntaxError
          ? 400
          : 503;
    response.status(status).json({
      error: {
        code:
          status === 422 || status === 400 || status === 413
            ? 'VALIDATION_ERROR'
            : request.originalUrl.startsWith('/api/v1/invitations')
              ? 'INVITATION_UNAVAILABLE'
              : 'AUTH_UNAVAILABLE',
        message:
          status === 422 || status === 400 || status === 413
            ? 'Request validation failed.'
            : 'Sign-in is temporarily unavailable.',
        requestId: String(response.getHeader('x-request-id')),
      },
    });
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

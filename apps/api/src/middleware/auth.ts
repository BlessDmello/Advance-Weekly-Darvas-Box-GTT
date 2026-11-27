import { publicUserSchema } from '@darvas/contracts';
import type { PublicUser } from '@darvas/contracts';
import type { RequestHandler, Response } from 'express';
import type { ApiEnvironment } from '../config/env.js';
import type { AuthRuntime } from '../modules/auth/types.js';
import { authCookies, readSessionHash } from '../modules/auth/cookies.js';
import { AuthError } from '../modules/auth/service.js';

// Only the session middleware establishes this context; request identity fields are ignored.
const identities = new WeakMap<Response, PublicUser>();

export function authenticatedUser(response: Response): PublicUser {
  const user = identities.get(response);
  if (!user || user.status !== 'ACTIVE')
    throw new AuthError(401, 'UNAUTHORIZED', 'Please sign in to continue.');
  return user;
}

export function requireAuthenticated(
  environment: ApiEnvironment,
  runtime: AuthRuntime,
): RequestHandler {
  const cookies = authCookies(environment);
  return async (request, response, next) => {
    identities.delete(response);
    const hash = readSessionHash(request, cookies.names.session);
    if (!hash) {
      cookies.clear(response);
      throw new AuthError(401, 'UNAUTHORIZED', 'Please sign in to continue.');
    }
    let session;
    try {
      // Repository validation includes current User and Family status, expiry and revocation.
      session = await (await runtime.repository()).findSession(hash, new Date());
    } catch {
      throw new AuthError(503, 'AUTH_UNAVAILABLE', 'Authentication is temporarily unavailable.');
    }
    if (!session || session.user.status !== 'ACTIVE') {
      cookies.clear(response);
      throw new AuthError(401, 'UNAUTHORIZED', 'Please sign in to continue.');
    }
    identities.set(response, publicUserSchema.parse(session.user));
    response.locals.sessionHash = hash;
    next();
  };
}

export const requireActiveAccount: RequestHandler = (_request, response, next) => {
  authenticatedUser(response);
  next();
};

export const requireAdmin: RequestHandler = (_request, response, next) => {
  if (authenticatedUser(response).role !== 'ADMIN')
    throw new AuthError(403, 'FORBIDDEN', 'You do not have permission to perform this action.');
  next();
};

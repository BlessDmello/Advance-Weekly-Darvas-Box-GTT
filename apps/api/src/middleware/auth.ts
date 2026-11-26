import type { RequestHandler } from 'express';
import type { ApiEnvironment } from '../config/env.js';
import type { AuthRuntime } from '../modules/auth/types.js';
import { authCookies, readSessionHash } from '../modules/auth/cookies.js';
import { AuthError } from '../modules/auth/service.js';

export function requireAuth(environment: ApiEnvironment, runtime: AuthRuntime): RequestHandler {
  const cookies = authCookies(environment);
  return async (request, response, next) => {
    const hash = readSessionHash(request, cookies.names.session);
    if (!hash) {
      cookies.clear(response);
      throw new AuthError(401, 'UNAUTHORIZED', 'Please sign in to continue.');
    }
    const session = await (await runtime.repository()).findSession(hash, new Date());
    if (!session) {
      cookies.clear(response);
      throw new AuthError(401, 'UNAUTHORIZED', 'Please sign in to continue.');
    }
    response.locals.authUser = session.user;
    response.locals.sessionHash = hash;
    next();
  };
}

import { randomBytes } from 'node:crypto';
import { doubleCsrf } from 'csrf-csrf';
import type { RequestHandler } from 'express';
import type { ApiEnvironment } from '../config/env.js';
import { authCookies, readCookie, readSessionHash } from '../modules/auth/cookies.js';
import { AuthError } from '../modules/auth/service.js';

export function createCsrf(environment: ApiEnvironment, secret: string) {
  const cookies = authCookies(environment);
  const origin = new URL(environment.WEB_ORIGIN).origin;
  const checkOrigin: RequestHandler = (request, _response, next) => {
    if (request.get('origin') !== origin || request.get('sec-fetch-site') === 'cross-site') {
      next(
        new AuthError(403, 'CSRF_INVALID', 'Request verification failed. Refresh and try again.'),
      );
    } else next();
  };
  const bind: RequestHandler = (request, response, next) => {
    const sessionHash = readSessionHash(request, cookies.names.session);
    if (sessionHash) response.locals.csrfIdentifier = `session:${sessionHash}`;
    else {
      let nonce = readCookie(request, cookies.names.preauth);
      if (!nonce || !/^[A-Za-z0-9_-]{43}$/.test(nonce)) {
        nonce = randomBytes(32).toString('base64url');
        response.cookie(cookies.names.preauth, nonce, {
          ...cookies.options,
          maxAge: 30 * 60 * 1000,
        });
      }
      response.locals.csrfIdentifier = `anonymous:${nonce}`;
    }
    next();
  };
  const tools = doubleCsrf({
    getSecret: () => secret,
    getSessionIdentifier: (request) => String(request.res?.locals.csrfIdentifier ?? ''),
    cookieName: cookies.names.csrf,
    cookieOptions: { ...cookies.options, maxAge: 7 * 24 * 60 * 60 * 1000 },
    getCsrfTokenFromRequest: (request) => request.get('x-csrf-token'),
  });
  const protect: RequestHandler = (request, response, next) => {
    tools.doubleCsrfProtection(request, response, (error?: unknown) => {
      next(
        error
          ? new AuthError(
              403,
              'CSRF_INVALID',
              'Request verification failed. Refresh and try again.',
            )
          : undefined,
      );
    });
  };
  const safeRead: RequestHandler = (request, _response, next) => {
    const source = request.get('origin');
    if ((source && source !== origin) || request.get('sec-fetch-site') === 'cross-site') {
      next(new AuthError(403, 'CSRF_INVALID', 'Request verification failed.'));
    } else next();
  };
  return { ...tools, bind, checkOrigin, protect, safeRead };
}

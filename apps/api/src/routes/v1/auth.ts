import { randomBytes } from 'node:crypto';
import { loginInputSchema, publicUserSchema } from '@darvas/contracts';
import cookieParser from 'cookie-parser';
import { Router } from 'express';
import type { ApiEnvironment } from '../../config/env.js';
import type { AuthRuntime } from '../../modules/auth/types.js';
import { authCookies, readSessionHash } from '../../modules/auth/cookies.js';
import { AuthError, login } from '../../modules/auth/service.js';
import { requireAuth } from '../../middleware/auth.js';
import { createCsrf } from '../../middleware/csrf.js';
import { loginRateLimits } from '../../middleware/login-rate-limit.js';

export function authRouter(environment: ApiEnvironment, runtime: AuthRuntime) {
  const router = Router();
  const cookies = authCookies(environment);
  const secret = environment.CSRF_SECRET ?? randomBytes(32).toString('base64url');
  const csrf = createCsrf(environment, secret);
  router.use((_request, _response, next) => {
    if (
      environment.NODE_ENV === 'production' &&
      (!environment.CSRF_SECRET || new URL(environment.WEB_ORIGIN).protocol !== 'https:')
    ) {
      throw new AuthError(503, 'AUTH_UNAVAILABLE', 'Sign-in is temporarily unavailable.');
    }
    next();
  });
  router.use(cookieParser());
  router.get('/csrf', csrf.safeRead, csrf.bind, (request, response) => {
    response.json({ data: { csrfToken: csrf.generateCsrfToken(request, response) } });
  });
  router.post(
    '/login',
    csrf.checkOrigin,
    csrf.bind,
    csrf.protect,
    ...loginRateLimits(secret),
    async (request, response) => {
      const input = loginInputSchema.parse(request.body);
      const result = await login(
        await runtime.repository(),
        input.email,
        input.password,
        input.rememberMe,
        readSessionHash(request, cookies.names.session),
      );
      response.cookie(cookies.names.session, result.token, {
        ...cookies.options,
        ...(input.rememberMe ? { maxAge: result.lifetime * 1000 } : {}),
      });
      response.clearCookie(cookies.names.preauth, cookies.options);
      response.locals.csrfIdentifier = `session:${result.hash}`;
      csrf.generateCsrfToken(request, response, { overwrite: true });
      response.json({ data: { user: result.user } });
    },
  );
  router.get('/me', requireAuth(environment, runtime), (_request, response) => {
    response.json({ data: { user: publicUserSchema.parse(response.locals.authUser) } });
  });
  router.post(
    '/logout',
    csrf.checkOrigin,
    csrf.bind,
    csrf.protect,
    requireAuth(environment, runtime),
    async (request, response) => {
      const hash = readSessionHash(request, cookies.names.session)!;
      await (await runtime.repository()).revokeSession(hash);
      cookies.clear(response);
      response.status(204).end();
    },
  );
  return router;
}

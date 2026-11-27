import { Router } from 'express';
import {
  acceptInvitationSchema,
  createInvitationSchema,
  invitationDtoSchema,
  invitationListQuerySchema,
  invitationListSchema,
  invitationVerificationSchema,
  objectIdSchema,
  verifyInvitationSchema,
} from '@darvas/contracts';
import type { ApiEnvironment } from '../../config/env.js';
import type { AuthRuntime } from '../../modules/auth/types.js';
import {
  authenticatedUser,
  requireActiveAccount,
  requireAdmin,
  requireAuthenticated,
} from '../../middleware/auth.js';
import type { createCsrf } from '../../middleware/csrf.js';
import { invitationRateLimits } from '../../middleware/invitation-rate-limit.js';
import { hashToken } from '../../modules/auth/tokens.js';
import { authCookies, readSessionHash } from '../../modules/auth/cookies.js';
import {
  acceptInvitation,
  invitationOperation,
  issueInvitation,
} from '../../modules/invitations/service.js';
import { InvitationError } from '../../modules/invitations/types.js';
import type { InvitationDependencies } from '../../modules/invitations/types.js';

export function invitationsRouter(
  environment: ApiEnvironment,
  auth: AuthRuntime,
  dependencies: InvitationDependencies,
  security: { secret: string; csrf: ReturnType<typeof createCsrf> },
) {
  const router = Router();
  const { csrf } = security;
  const limits = invitationRateLimits(security.secret);
  const admin = [requireAuthenticated(environment, auth), requireActiveAccount, requireAdmin];
  const mutation = [csrf.checkOrigin, csrf.bind, csrf.protect];
  router.use((_request, _response, next) => {
    const origin = new URL(environment.WEB_ORIGIN);
    if (
      !['http:', 'https:'].includes(origin.protocol) ||
      origin.username ||
      origin.password ||
      origin.pathname !== '/' ||
      origin.search ||
      origin.hash ||
      (environment.NODE_ENV === 'production' &&
        (!environment.CSRF_SECRET || origin.protocol !== 'https:'))
    )
      throw new InvitationError(
        503,
        'INVITATION_UNAVAILABLE',
        'Invitations are temporarily unavailable.',
      );
    next();
  });
  router.post('/verify', ...mutation, limits.public, async (request, response) => {
    const input = verifyInvitationSchema.parse(request.body);
    const result = await invitationOperation(async () =>
      (await dependencies.repository()).verify(hashToken(input.token)),
    );
    response.json(invitationVerificationSchema.parse({ data: result }));
  });
  router.post('/accept', ...mutation, limits.public, async (request, response) => {
    const input = acceptInvitationSchema.parse(request.body);
    const hash = readSessionHash(request, authCookies(environment).names.session);
    if (hash && (await (await auth.repository()).findSession(hash, new Date())))
      throw new InvitationError(
        409,
        'ALREADY_AUTHENTICATED',
        'Sign out before accepting an invitation.',
      );
    const userId = await acceptInvitation(dependencies, input);
    response.status(201).json({ data: { userId } });
  });
  router.get('/', ...admin, async (request, response) => {
    const input = invitationListQuerySchema.parse(request.query);
    response.json(
      invitationListSchema.parse(
        await invitationOperation(async () =>
          (await dependencies.repository()).list(authenticatedUser(response), input),
        ),
      ),
    );
  });
  router.post('/', ...admin, ...mutation, limits.admin, async (request, response) => {
    const input = createInvitationSchema.parse(request.body);
    const invite = await issueInvitation(
      dependencies,
      authenticatedUser(response),
      input.email,
      new URL(environment.WEB_ORIGIN).origin,
    );
    response.status(201).json({ data: invitationDtoSchema.parse(invite) });
  });
  router.post('/:id/revoke', ...admin, ...mutation, async (request, response) => {
    const id = objectIdSchema.parse(request.params.id);
    // Empty mutation bodies cannot smuggle identity or privilege fields.
    if (request.body && Object.keys(request.body as object).length)
      throw new InvitationError(422, 'VALIDATION_ERROR', 'Request validation failed.');
    await invitationOperation(async () =>
      (await dependencies.repository()).revoke(authenticatedUser(response), id),
    );
    response.status(204).end();
  });
  router.post('/:id/resend', ...admin, ...mutation, limits.admin, async (request, response) => {
    const id = objectIdSchema.parse(request.params.id);
    if (request.body && Object.keys(request.body as object).length)
      throw new InvitationError(422, 'VALIDATION_ERROR', 'Request validation failed.');
    const invite = await issueInvitation(
      dependencies,
      authenticatedUser(response),
      undefined,
      new URL(environment.WEB_ORIGIN).origin,
      id,
    );
    response.status(201).json({ data: invitationDtoSchema.parse(invite) });
  });
  return router;
}

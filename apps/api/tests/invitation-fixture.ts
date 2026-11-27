import express from 'express';
import type { Express } from 'express';
import cookieParser from 'cookie-parser';
import { createInvitationRepository, verifyInvitationStorage } from '@darvas/database';
import { invitationTokenSchema } from '@darvas/contracts';
import { z } from 'zod';
import { hashToken } from '../src/modules/auth/tokens.js';
import type { InvitationDependencies } from '../src/modules/invitations/types.js';
import type { startAuthFixture } from '../../../tests/support/mongo.js';
import { testCredentials } from '../../../tests/support/credentials.js';
import { parseEnvironment } from '../src/config/env.js';
import {
  authenticatedUser,
  requireAuthenticated,
  requireActiveAccount,
  requireAdmin,
} from '../src/middleware/auth.js';
import { errorHandler } from '../src/middleware/error-handler.js';
type Fixture = Awaited<ReturnType<typeof startAuthFixture>>;
// Test-owned memory only: never persist mock mail or expose tokens in API JSON.
const mailboxes = new WeakMap<Fixture, Map<string, string>>();
function mailbox(fixture: Fixture) {
  let messages = mailboxes.get(fixture);
  if (!messages) {
    messages = new Map<string, string>();
    mailboxes.set(fixture, messages);
  }
  return messages;
}
// Keep browser scenarios from spending one another's transport-IP rate budget.
// Only this test dispatcher partitions application instances; production limits stay intact.
// SSR forwards cookies, so the same partition applies through both Next request paths.
export function isolatedTestApplications(factory: () => Express) {
  const dispatcher = express();
  // Rate-limit middleware must be constructed before any request, including in tests.
  const pool = Array.from({ length: 256 }, () => factory());
  const applications = new Map<string, Express>();
  dispatcher.use((request, response, next) => {
    const cookies = request.headers.cookie ?? '';
    const token =
      /(?:^|;\s*)adb_session=([^;]+)/.exec(cookies)?.[1] ??
      /(?:^|;\s*)adb_preauth=([^;]+)/.exec(cookies)?.[1];
    const key = token ? hashToken(token) : 'anonymous';
    let application = applications.get(key);
    if (!application) {
      if (applications.size >= 256) {
        response.status(503).end();
        return;
      }
      application = pool[applications.size]!;
      applications.set(key, application);
    }
    application(request, response, next);
  });
  return dispatcher;
}
export function invitationTestDependencies(fixture: Fixture): InvitationDependencies {
  return {
    repository: async () => {
      fixture.assertOwned();
      await verifyInvitationStorage(fixture.connection);
      return createInvitationRepository(fixture.connection);
    },
    sender: {
      configured: () => true,
      send: async (mail, id) => {
        fixture.assertOwned();
        const link = new URL(mail.link);
        if (
          link.protocol !== 'http:' ||
          link.hostname !== '127.0.0.1' ||
          link.pathname !== '/accept-invitation' ||
          link.search ||
          !/^#token=[A-Za-z0-9_-]{43}$/.test(link.hash)
        )
          throw new Error('Mock email requires a loopback invitation link.');
        mailbox(fixture).set(id, mail.link);
        return { delivery: 'ACCEPTED' };
      },
    },
  };
}
// Test-only input accepts a synthetic token generated in the Playwright worker.
// It is hashed immediately and is never returned in JSON or written to files.
export function createInvitationTestApp(application: Express, fixture: Fixture) {
  fixture.assertOwned();
  const app = express();
  const environment = parseEnvironment({ NODE_ENV: 'test', LOG_LEVEL: 'silent' });
  app.get(
    '/api/v1/__test/invitations/:id/email',
    (_request, response, next) => {
      fixture.assertOwned();
      response.setHeader('Cache-Control', 'no-store');
      response.setHeader('Referrer-Policy', 'no-referrer');
      next();
    },
    cookieParser(),
    requireAuthenticated(environment, fixture.runtime),
    requireActiveAccount,
    requireAdmin,
    async (request, response) => {
      const id = String(request.params.id);
      const link = mailbox(fixture).get(id);
      const user = authenticatedUser(response);
      if (
        !/^[a-f\d]{24}$/.test(id) ||
        !link ||
        !(await fixture.models.Invitation.exists({ _id: id, familyId: user.familyId }))
      ) {
        response.status(404).end();
        return;
      }
      mailbox(fixture).delete(id);
      response.status(303).location(link).end();
    },
  );
  app.post(
    '/api/v1/__test/invitation',
    express.json({ limit: '4kb' }),
    async (request, response) => {
      fixture.assertOwned();
      const parsed = z
        .object({
          token: invitationTokenSchema,
          email: z.email(),
          state: z.enum(['PENDING', 'EXPIRED', 'REVOKED', 'CONSUMED']).default('PENDING'),
        })
        .strict()
        .safeParse(request.body);
      if (!parsed.success) {
        response.status(400).json({ error: { message: 'Invalid test fixture.' } });
        return;
      }
      const user = await fixture.models.User.findOne({
        emailNormalized: testCredentials.email,
      }).orFail();
      const now = new Date();
      const row = await fixture.models.Invitation.create({
        familyId: user.familyId,
        invitedBy: user._id,
        emailNormalized: parsed.data.email,
        tokenHash: hashToken(parsed.data.token),
        status: parsed.data.state,
        expiresAt: new Date(
          now.getTime() + (parsed.data.state === 'EXPIRED' ? -1000 : 72 * 3600_000),
        ),
        ...(parsed.data.state === 'CONSUMED' ? { consumedAt: now, consumedBy: user._id } : {}),
      });
      response.json({ data: { invitationId: row._id.toHexString() } });
    },
  );
  app.use(application);
  app.use(errorHandler);
  return app;
}

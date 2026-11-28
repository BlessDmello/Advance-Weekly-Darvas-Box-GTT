import { createApp as sourceApp } from '../../apps/api/src/app.js';
import { parseEnvironment } from '../../apps/api/src/config/env.js';
import { startAuthFixture } from './mongo.js';
import { createAuthorizationTestApp } from '../../apps/api/tests/authorization-fixture.js';
import { importTestDependencies } from '../../apps/api/tests/import-fixture.js';
import {
  createInvitationTestApp,
  invitationTestDependencies,
  isolatedTestApplications,
} from '../../apps/api/tests/invitation-fixture.js';

// Deliberately no --env-file or application MongoDB environment loading.
const fixture = await startAuthFixture();
const market = await importTestDependencies(fixture);
const port = Number(process.env.E2E_API_PORT ?? '4000');
const webPort = Number(process.env.E2E_WEB_PORT ?? '3000');
const createApp: typeof sourceApp =
  process.env.E2E_PRODUCTION === '1'
    ? (
        (await import(new URL('../../apps/api/dist/app.js', import.meta.url).href)) as {
          createApp: typeof sourceApp;
        }
      ).createApp
    : sourceApp;
const environment = parseEnvironment({
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  WEB_ORIGIN: `http://127.0.0.1:${webPort}`,
  CSRF_SECRET: 'e'.repeat(64),
});
const { app } = await createAuthorizationTestApp(
  isolatedTestApplications(() =>
    createApp(environment, fixture.runtime, invitationTestDependencies(fixture), market),
  ),
  environment,
  fixture,
  process.env.E2E_PRODUCTION === '1',
);
const server = createInvitationTestApp(app, fixture).listen(port, '127.0.0.1');
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  server.close(async () => {
    try {
      await fixture.close();
      process.exit(0);
    } catch {
      process.exit(1);
    }
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
server.on('error', async () => {
  await fixture.close();
  process.exit(1);
});
process.on('SIGINT', () => void stop());
process.on('SIGTERM', () => void stop());

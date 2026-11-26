import { input, password } from '@inquirer/prompts';
import { displayNameSchema, emailSchema, workspaceNameSchema } from '@darvas/contracts';
import {
  BootstrapError,
  connectDatabase,
  disconnectDatabase,
  prepareAuthStorage,
  readDatabaseConfig,
} from '@darvas/database';
import type { DatabaseConnection } from '@darvas/database';
import { bootstrapAdmin, bootstrapInputSchema } from '../modules/auth/bootstrap-admin.js';
import { isPasswordAllowed } from '../modules/auth/password.js';

class BootstrapCliError extends Error {}

export function readBootstrapConfig(environment: Record<string, string | undefined>) {
  if (environment.NODE_ENV !== 'development') {
    throw new BootstrapCliError(
      'Bootstrap permits development mode only. Production bootstrap requires separate approval and implementation.',
    );
  }
  const config = readDatabaseConfig(environment);
  try {
    const uri = new URL(config.uri);
    if (
      !uri.hostname ||
      uri.hash ||
      /<[^>]+>|YOUR_[A-Z0-9_]+/i.test(decodeURIComponent(config.uri)) ||
      decodeURIComponent(uri.pathname.slice(1)) !== 'advanced_darvas_dev' ||
      config.databaseName !== 'advanced_darvas_dev'
    ) {
      throw new Error('Invalid target');
    }
  } catch {
    throw new BootstrapCliError(
      'Bootstrap requires the explicit advanced_darvas_dev database in both settings without placeholders.',
    );
  }
  return config;
}

export async function promptAdminInput() {
  const workspaceName = await input({
    message: 'Workspace name:',
    default: 'Family Workspace',
    validate: (value) =>
      workspaceNameSchema.safeParse(value).success ||
      'Enter a workspace name (1 to 100 characters).',
  });
  const email = await input({
    message: 'Admin email:',
    validate: (value) => emailSchema.safeParse(value).success || 'Enter a valid email address.',
  });
  const displayName = await input({
    message: 'Display name:',
    validate: (value) =>
      displayNameSchema.safeParse(value).success || 'Enter a display name (1 to 100 characters).',
  });
  const secret = await password({
    message: 'Password (15 to 128 characters):',
    mask: false,
    toggleMask: false,
    validate: (value) =>
      isPasswordAllowed(value) || 'Use 15 to 128 characters without null characters.',
  });
  const confirmPassword = await password({
    message: 'Confirm password:',
    mask: false,
    toggleMask: false,
    validate: (value) => value === secret || 'Passwords do not match.',
  });
  return { workspaceName, email, displayName, password: secret, confirmPassword };
}

// Dependency injection keeps CLI tests isolated from real files, terminals and Atlas.
const defaultDependencies = {
  connectDatabase,
  disconnectDatabase,
  prepareAuthStorage,
  bootstrapAdmin,
  promptAdminInput,
};
export async function runBootstrapCli(
  environment: Record<string, string | undefined>,
  terminal: { stdinIsTTY: boolean; stdoutIsTTY: boolean; args: readonly string[] },
  dependencies = defaultDependencies,
): Promise<number> {
  let connection: DatabaseConnection | undefined;
  let exitCode = 1;
  try {
    const config = readBootstrapConfig(environment);
    if (!terminal.stdinIsTTY || !terminal.stdoutIsTTY || terminal.args.length > 0) {
      throw new BootstrapCliError(
        'Bootstrap requires an interactive terminal and accepts no command-line arguments.',
      );
    }
    const values = await dependencies.promptAdminInput();
    if (!bootstrapInputSchema.safeParse(values).success)
      throw new BootstrapCliError('Invalid bootstrap input.');
    connection = await dependencies.connectDatabase(config);
    await dependencies.prepareAuthStorage(connection);
    await dependencies.bootstrapAdmin(connection, values);
    console.info('Initial Family and Admin created. No login session was created.');
    exitCode = 0;
  } catch (error) {
    console.error(
      error instanceof BootstrapError || error instanceof BootstrapCliError
        ? error.message
        : 'Bootstrap did not complete. Check local configuration and input, or retry after cancellation. Database details are hidden.',
    );
  } finally {
    if (connection) {
      try {
        await dependencies.disconnectDatabase(connection);
      } catch {
        console.error('Database shutdown failed. Check initialization state before retrying.');
        exitCode = 1;
      }
    }
  }
  return exitCode;
}

if (import.meta.main) {
  process.exitCode = await runBootstrapCli(process.env, {
    stdinIsTTY: process.stdin.isTTY === true,
    stdoutIsTTY: process.stdout.isTTY === true,
    args: process.argv.slice(2),
  });
}

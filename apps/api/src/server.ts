import { createApp } from './app.js';
import { parseEnvironment } from './config/env.js';
import { createLogger } from './config/logger.js';

const environment = parseEnvironment(process.env);
const logger = createLogger(environment.LOG_LEVEL);
const server = createApp(environment).listen(environment.PORT, environment.HOST, () => {
  logger.info({ port: environment.PORT, host: environment.HOST }, 'API listening');
});

server.on('error', () => {
  logger.fatal('API failed to start. Check the configured host and port.');
  process.exitCode = 1;
});

let shuttingDown = false;
function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'API shutting down');
  server.close((error) => {
    if (error) logger.error('API shutdown failed');
    process.exit(error ? 1 : 0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

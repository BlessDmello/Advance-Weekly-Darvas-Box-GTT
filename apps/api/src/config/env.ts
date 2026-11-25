import { portSchema } from '@darvas/contracts';
import { z } from 'zod';

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().min(1).default('127.0.0.1'),
  PORT: portSchema.default(4000),
  WEB_ORIGIN: z.url().default('http://localhost:3000'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

export type ApiEnvironment = z.infer<typeof environmentSchema>;

export function parseEnvironment(environment: Record<string, string | undefined>): ApiEnvironment {
  const result = environmentSchema.safeParse(environment);
  if (!result.success) {
    // Never serialize raw input; environment values can contain credentials.
    const fields = result.error.issues.map((issue) => issue.path.join('.')).join(', ');
    throw new Error(`Invalid API environment fields: ${fields}`);
  }
  return result.data;
}

import { displayNameSchema, emailSchema, workspaceNameSchema } from '@darvas/contracts';
import { createInitialAdmin } from '@darvas/database';
import type { DatabaseConnection } from '@darvas/database';
import { z } from 'zod';
import { hashPassword, isPasswordAllowed } from './password.js';

export const bootstrapInputSchema = z
  .object({
    workspaceName: workspaceNameSchema,
    email: emailSchema,
    displayName: displayNameSchema,
    password: z.string().refine(isPasswordAllowed),
    confirmPassword: z.string(),
  })
  .strict()
  .refine((input) => input.password === input.confirmPassword);

export async function bootstrapAdmin(
  connection: DatabaseConnection,
  values: unknown,
): Promise<void> {
  const parsed = bootstrapInputSchema.safeParse(values);
  if (!parsed.success)
    throw new Error(
      'Invalid bootstrap input. Check names, email and matching password requirements.',
    );
  const { workspaceName, email, displayName, password } = parsed.data;
  const passwordHash = await hashPassword(password);
  await createInitialAdmin(connection, { workspaceName, email, displayName, passwordHash });
}

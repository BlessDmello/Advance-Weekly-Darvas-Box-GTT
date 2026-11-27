import type { PublicUser } from '@darvas/contracts';
import { AuthError } from './service.js';

// Pass only authenticatedUser(response), never request bodies or client-provided identity.
export function privateResourceScope(user: PublicUser): { ownerId: string } {
  if (user.status !== 'ACTIVE')
    throw new AuthError(401, 'UNAUTHORIZED', 'Please sign in to continue.');
  return { ownerId: user.id };
}

export interface OwnedResource {
  ownerId: string;
  familyId?: string;
}

// Future repositories must constrain reads AND writes by privateResourceScope(user),
// plus authorized parent IDs. Check server-loaded metadata before returning content.
// Collections without familyId keep their approved schema; resolve family via the owner
// when needed. An ADMIN role never overrides ownership or family boundaries.
export function authorizeOwnedResource<T extends OwnedResource>(
  user: PublicUser,
  resource: T | null,
): T {
  const scope = privateResourceScope(user);
  if (
    !resource ||
    resource.ownerId !== scope.ownerId ||
    (resource.familyId !== undefined && resource.familyId !== user.familyId)
  ) {
    throw new AuthError(404, 'NOT_FOUND', 'The requested resource was not found.');
  }
  return resource;
}

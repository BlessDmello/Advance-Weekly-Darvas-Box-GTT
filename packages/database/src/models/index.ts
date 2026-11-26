import type { Connection } from 'mongoose';
import { familySchema } from './family.js';
import { userSchema } from './user.js';
import { sessionSchema } from './session.js';
import { invitationSchema } from './invitation.js';

export function createAuthModels(connection: Connection) {
  return {
    Family: connection.model('Family', familySchema),
    User: connection.model('User', userSchema),
    Session: connection.model('Session', sessionSchema),
    Invitation: connection.model('Invitation', invitationSchema),
  };
}
export type AuthModels = ReturnType<typeof createAuthModels>;
export { toPublicUser } from './user.js';

import type { Connection, ClientSession } from 'mongoose';
import { Types } from 'mongoose';
import type { InvitationDto, InvitationVerification, PublicUser } from '@darvas/contracts';
import { createAuthModels } from './models/index.js';

export class InvitationStorageError extends Error {
  constructor(
    public readonly code: 'INVALID' | 'CONFLICT' | 'NOT_FOUND' | 'RATE_LIMITED' | 'FORBIDDEN',
  ) {
    super('Invitation operation denied.');
  }
}
export function createInvitationRepository(connection: Connection) {
  const { Invitation, User, Family } = createAuthModels(connection);
  type Invite = InstanceType<typeof Invitation>;
  function dto(invite: Invite, now = new Date()): InvitationDto {
    return {
      invitationId: invite._id.toHexString(),
      email: invite.emailNormalized,
      status: invite.status === 'PENDING' && invite.expiresAt <= now ? 'EXPIRED' : invite.status,
      expiresAt: invite.expiresAt.toISOString(),
      createdAt: invite.createdAt.toISOString(),
      delivery: invite.delivery ?? 'UNCONFIRMED',
    };
  }
  async function membership(invite: Invite, session?: ClientSession) {
    const options = session ? { session } : {};
    const family = await Family.findOne({ _id: invite.familyId, status: 'ACTIVE' }, null, options);
    const inviter = await User.findOne(
      { _id: invite.invitedBy, familyId: invite.familyId, role: 'ADMIN', status: 'ACTIVE' },
      null,
      options,
    );
    return family && inviter ? { family, inviter } : null;
  }
  async function admin(actor: PublicUser, session: ClientSession) {
    if (
      !(await User.exists({
        _id: actor.id,
        familyId: actor.familyId,
        role: 'ADMIN',
        status: 'ACTIVE',
      }).session(session)) ||
      !(await Family.exists({ _id: actor.familyId, status: 'ACTIVE' }).session(session))
    )
      throw new InvitationStorageError('FORBIDDEN');
  }
  async function transaction<T>(work: (session: ClientSession) => Promise<T>): Promise<T> {
    try {
      return await connection.transaction(work, {
        writeConcern: { w: 'majority' },
        readConcern: { level: 'snapshot' },
      });
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 11000)
        throw new InvitationStorageError('CONFLICT');
      throw error;
    }
  }
  return {
    async issue(actor: PublicUser, email: string, tokenHash: string, previousId?: string) {
      return transaction(async (session) => {
        const now = new Date();
        await admin(actor, session);
        let previous: Invite | null = null;
        if (previousId) {
          previous = await Invitation.findOne({
            _id: previousId,
            familyId: actor.familyId,
          }).session(session);
          if (!previous) throw new InvitationStorageError('NOT_FOUND');
          if (!['PENDING', 'EXPIRED'].includes(previous.status) || previous.replacedBy)
            throw new InvitationStorageError('CONFLICT');
          email = previous.emailNormalized;
        }
        if (await User.exists({ emailNormalized: email }).session(session))
          throw new InvitationStorageError('CONFLICT');
        const latest = await Invitation.findOne({
          familyId: actor.familyId,
          emailNormalized: email,
        })
          .sort({ createdAt: -1, _id: -1 })
          .session(session);
        if (previous && latest && !latest._id.equals(previous._id))
          throw new InvitationStorageError('CONFLICT');
        if (latest?.nextSendAt && latest.nextSendAt > now)
          throw new InvitationStorageError('RATE_LIMITED');
        const sameWindow =
          latest?.sendWindowStartedAt &&
          now.getTime() - latest.sendWindowStartedAt.getTime() < 86400_000;
        const count = sameWindow ? (latest.sendCount ?? 0) : 0;
        if (count >= 3) throw new InvitationStorageError('RATE_LIMITED');
        await Invitation.updateMany(
          {
            familyId: actor.familyId,
            emailNormalized: email,
            status: 'PENDING',
            expiresAt: { $lte: now },
          },
          { $set: { status: 'EXPIRED' } },
          { session },
        );
        const id = new Types.ObjectId();
        if (previous) {
          const result = await Invitation.updateOne(
            {
              _id: previous._id,
              familyId: actor.familyId,
              status: { $in: ['PENDING', 'EXPIRED'] },
              replacedBy: null,
            },
            {
              $set: {
                status: previous.expiresAt <= now ? 'EXPIRED' : 'REVOKED',
                revokedAt: now,
                revokedBy: actor.id,
                replacedBy: id,
              },
            },
            { session },
          );
          if (result.modifiedCount !== 1) throw new InvitationStorageError('CONFLICT');
        }
        const [invite] = await Invitation.create(
          [
            {
              _id: id,
              familyId: actor.familyId,
              invitedBy: actor.id,
              emailNormalized: email,
              tokenHash,
              expiresAt: new Date(now.getTime() + 72 * 3600_000),
              delivery: 'PENDING',
              sendWindowStartedAt: sameWindow ? latest!.sendWindowStartedAt! : now,
              sendCount: count + 1,
              nextSendAt: new Date(now.getTime() + 60_000),
            },
          ],
          { session },
        );
        return dto(invite!);
      });
    },
    async emailForResend(actor: PublicUser, id: string) {
      const invite = await Invitation.findOne({ _id: id, familyId: actor.familyId });
      if (!invite) throw new InvitationStorageError('NOT_FOUND');
      return invite.emailNormalized;
    },
    async markDelivery(
      id: string,
      delivery: InvitationDto['delivery'],
      providerMessageId?: string,
    ) {
      await Invitation.updateOne(
        { _id: id },
        { $set: { delivery, ...(providerMessageId ? { providerMessageId } : {}) } },
      );
    },
    async list(
      actor: PublicUser,
      input: { status?: string | undefined; limit: number; cursor?: string | undefined },
    ) {
      const now = new Date();
      const filter: Record<string, unknown> = { familyId: actor.familyId };
      if (input.status === 'EXPIRED')
        filter.$or = [{ status: 'EXPIRED' }, { status: 'PENDING', expiresAt: { $lte: now } }];
      else if (input.status) {
        filter.status = input.status;
        if (input.status === 'PENDING') filter.expiresAt = { $gt: now };
      }
      if (input.cursor) {
        // Cursor is a single ObjectId; IDs are time-ordered. Scope always remains session-owned.
        if (!/^[a-f\d]{24}$/.test(input.cursor)) throw new InvitationStorageError('INVALID');
        filter._id = { $lt: new Types.ObjectId(input.cursor) };
      }
      const rows = await Invitation.find(filter)
        .sort({ _id: -1 })
        .limit(input.limit + 1);
      return {
        data: rows.slice(0, input.limit).map((row) => dto(row, now)),
        meta: {
          nextCursor: rows.length > input.limit ? rows[input.limit - 1]!._id.toHexString() : null,
        },
      };
    },
    async verify(hash: string): Promise<InvitationVerification> {
      const invite = await Invitation.findOne({ tokenHash: hash });
      if (!invite) return { state: 'INVALID' };
      if (invite.status === 'CONSUMED' || invite.consumedAt || invite.consumedBy)
        return { state: 'CONSUMED' };
      if (invite.status === 'REVOKED' || invite.revokedAt || invite.replacedBy)
        return { state: 'REVOKED' };
      if (invite.status === 'EXPIRED' || invite.expiresAt <= new Date())
        return { state: 'EXPIRED' };
      const members = await membership(invite);
      if (!members || invite.status !== 'PENDING') return { state: 'INVALID' };
      return {
        state: 'VALID',
        email: invite.emailNormalized,
        familyName: members.family.name,
        inviterName: members.inviter.displayName,
        expiresAt: invite.expiresAt.toISOString(),
      };
    },
    async accept(hash: string, displayName: string, passwordHash: string) {
      return transaction(async (session) => {
        const invite = await Invitation.findOne({
          tokenHash: hash,
          status: 'PENDING',
          consumedAt: null,
          consumedBy: null,
          revokedAt: null,
          replacedBy: null,
          expiresAt: { $gt: new Date() },
        }).session(session);
        if (!invite || !(await membership(invite, session)))
          throw new InvitationStorageError('INVALID');
        const now = new Date();
        const id = new Types.ObjectId();
        const updated = await Invitation.updateOne(
          {
            _id: invite._id,
            status: 'PENDING',
            expiresAt: { $gt: now },
            consumedAt: null,
            consumedBy: null,
            revokedAt: null,
            replacedBy: null,
          },
          { $set: { status: 'CONSUMED', consumedAt: now, consumedBy: id } },
          { session },
        );
        if (updated.modifiedCount !== 1) throw new InvitationStorageError('INVALID');
        await User.create(
          [
            {
              _id: id,
              familyId: invite.familyId,
              emailNormalized: invite.emailNormalized,
              displayName,
              passwordHash,
              role: 'MEMBER',
              status: 'ACTIVE',
              emailVerifiedAt: now,
            },
          ],
          { session },
        );
        return id.toHexString();
      });
    },
    async revoke(actor: PublicUser, id: string) {
      await transaction(async (session) => {
        await admin(actor, session);
        const invite = await Invitation.findOne({ _id: id, familyId: actor.familyId }).session(
          session,
        );
        if (!invite) throw new InvitationStorageError('NOT_FOUND');
        if (invite.status === 'REVOKED') return;
        if (invite.status !== 'PENDING') throw new InvitationStorageError('CONFLICT');
        invite.status = 'REVOKED';
        invite.revokedAt = new Date();
        invite.revokedBy = new Types.ObjectId(actor.id);
        await invite.save({ session });
      });
    },
  };
}
export type InvitationRepository = ReturnType<typeof createInvitationRepository>;

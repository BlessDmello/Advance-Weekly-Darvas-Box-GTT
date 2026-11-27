import type { ApiEnvironment } from '../../config/env.js';
import type { InvitationSender } from './types.js';

const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!,
  );
export function createInvitationSender(environment: ApiEnvironment): InvitationSender {
  return {
    configured() {
      return Boolean(
        environment.RESEND_API_KEY &&
        !/YOUR_|PLACEHOLDER/i.test(environment.RESEND_API_KEY) &&
        environment.RESEND_FROM_EMAIL,
      );
    },
    async send(mail, id) {
      const text = `${mail.inviterName} invited you to ${mail.familyName} on Advanced Darvas Box. Create your family workspace account: ${mail.link}\nThis single-use invitation expires at ${mail.expiresAt} (72 hours after issuance). If you were not expecting this invitation, ignore it.`;
      const body = JSON.stringify({
        from: `Advanced Darvas Box <${environment.RESEND_FROM_EMAIL}>`,
        to: [mail.to],
        subject: 'Your Advanced Darvas Box invitation',
        text,
        html: `<div style="font-family:Arial,sans-serif;color:#102c25;max-width:560px"><h1 style="color:#047857">Advanced Darvas Box</h1><p>${escape(mail.inviterName)} invited you to ${escape(mail.familyName)}.</p><p><a href="${escape(mail.link)}" style="color:#047857">Accept invitation and create your account</a></p><p>This single-use link expires at ${escape(mail.expiresAt)}, 72 hours after issuance.</p><p>If you were not expecting this invitation, ignore it.</p></div>`,
      });
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${environment.RESEND_API_KEY}`,
              'Content-Type': 'application/json',
              'Idempotency-Key': `invitation/${id}`,
            },
            body,
            signal: AbortSignal.timeout(10_000),
            redirect: 'error',
          });
          if (response.ok) {
            const data: unknown = await response.json();
            if (data && typeof data === 'object' && 'id' in data && typeof data.id === 'string')
              return { delivery: 'ACCEPTED', providerMessageId: data.id };
            return { delivery: 'UNCONFIRMED' };
          }
          if (response.status !== 429 && response.status < 500) return { delivery: 'FAILED' };
        } catch {
          /* Never log provider bodies, headers, credentials or invitation links. */
        }
      }
      return { delivery: 'UNCONFIRMED' };
    },
  };
}

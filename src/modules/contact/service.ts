// contact module — service. Business logic; orchestrates the auth +
// notifications modules. Callable by other modules ONLY through index.ts
// (module boundary rule).
import type { Locale, Role } from '@prisma/client';
import { authService } from '@modules/auth';
import { notificationsService } from '@modules/notifications';
import { assertWriteNotRateLimited } from '@lib/rate-limit';
import { getPrimaryOrgId } from '@lib/primary-org';
import { SubmitContactMessageInput, isHoneypotTripped, additionalRolesForTopic, OPS_LEADERSHIP_ROLES } from './domain';

const RATE_LIMIT_WINDOW_MINUTES = 60;
const RATE_LIMIT_MAX_ATTEMPTS = 5; // same order of magnitude as booking.cancel_via_lookup

export type SubmitContactMessageResult = { ok: true } | { ok: false; error: string };

export const contactService = {
  /**
   * Public, no-ctx (a guest submitting this form has no session/account).
   * Validation and rate-limit failures ARE surfaced to the caller -- a real
   * user action, not best-effort telemetry like analytics.recordWizardStep.
   * Once past both checks, nothing downstream (recipient resolution, the
   * actual notification sends) can flip the response to an error (charter
   * rule 8): if every notification channel fails, the guest is still told
   * "sent" -- an explicit, accepted tradeoff of this module's deliberate
   * no-persistence design (DR-255). There is no DB row to fall back to.
   */
  async submitContactMessage(raw: unknown, ctx: { ip: string | undefined; locale: Locale }): Promise<SubmitContactMessageResult> {
    const parsed = SubmitContactMessageInput.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, error: 'Please check the form for errors and try again.' };
    }
    const input = parsed.data;
    const organizationId = await getPrimaryOrgId();

    if (ctx.ip) {
      try {
        await assertWriteNotRateLimited({
          organizationId,
          action: 'contact.submit',
          ip: ctx.ip,
          windowMinutes: RATE_LIMIT_WINDOW_MINUTES,
          maxAttempts: RATE_LIMIT_MAX_ATTEMPTS,
        });
      } catch {
        return { ok: false, error: 'Too many messages sent recently -- please try again later.' };
      }
    }

    // Honeypot: pretend success, send nothing. Never reveal detection.
    if (isHoneypotTripped(input)) {
      return { ok: true };
    }

    try {
      await notifyOpsLeadership(organizationId, input);
      await notificationsService.notifyEmail('CONTACT_FORM_CONFIRMATION', input.email, ctx.locale, organizationId, {
        contactName: input.name,
      });
    } catch {
      // See this method's own doc comment: a notification failure here
      // must never surface as a form error to the guest.
    }

    return { ok: true };
  },
};

/** Mirrors visa/service.ts's notifyFacilitatorQueue shape (sequential, one
 * notify() call per recipient -- notify() itself never throws) but
 * resolves a role SET rather than one fixed role, and dedupes across roles
 * since one person can hold multiple qualifying roles (authService
 * .listUsersByRole already unions primary-role + Membership-role per
 * DR-225, so the same user id can otherwise come back from more than one
 * role query). */
async function notifyOpsLeadership(organizationId: string, input: SubmitContactMessageInput): Promise<void> {
  const roles: readonly Role[] = [...OPS_LEADERSHIP_ROLES, ...additionalRolesForTopic(input.topic)];
  const recipientsById = new Map<string, { id: string }>();
  for (const role of roles) {
    const users = await authService.listUsersByRole(organizationId, role);
    for (const u of users) recipientsById.set(u.id, u);
  }
  for (const recipient of recipientsById.values()) {
    await notificationsService.notify('CONTACT_FORM_RECEIVED', recipient.id, organizationId, {
      contactName: input.name,
      contactEmail: input.email,
      contactPhone: input.phone,
      contactTopic: input.topic,
      contactMessage: input.message,
    });
  }
}

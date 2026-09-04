// notifications module — service. Business logic; orchestrates the auth
// module + gateways. Callable by other modules ONLY through index.ts
// (module boundary rule).
import type { Locale } from '@prisma/client';
import { authService } from '@modules/auth';
import { cmsService } from '@modules/cms';
import { audit } from '@lib/audit';
import { logger, newTraceId } from '@lib/logger';
import {
  renderMessage,
  renderSmsMessage,
  resolveChannelOrder,
  type EmailAttachment,
  type EmailTemplateOverrides,
  type NotificationChannel,
  type NotificationData,
  type NotificationEvent,
} from './domain';
import { gateways } from './gateway';

const EMAIL_TEMPLATE_KEY_PREFIX = 'email.';

/** DR-217: one bulk CMS read per send, mapped into the shape domain.ts's
 * pure renderMessage expects (title -> heading, body -> bodyTemplate) --
 * this is the one place notifications reaches into @modules/cms, keeping
 * domain.ts itself framework/DB-free. Never throws: a CMS read failure
 * degrades to "no overrides" (coded defaults render normally) rather than
 * blocking a transactional email, same charter-rule-8 posture as every
 * other external read in this module. */
async function getEmailOverrides(locale: Locale, log: ReturnType<typeof logger>): Promise<EmailTemplateOverrides> {
  try {
    const cmsLocale = locale === 'FR' ? 'fr' : 'en';
    const rows = await cmsService.listPublicTextBlocksByKeyPrefix(EMAIL_TEMPLATE_KEY_PREFIX, cmsLocale);
    const overrides: EmailTemplateOverrides = {};
    for (const row of rows) {
      overrides[row.key.slice(EMAIL_TEMPLATE_KEY_PREFIX.length)] = { eyebrow: row.eyebrow, heading: row.title, bodyTemplate: row.body };
    }
    return overrides;
  } catch (err) {
    log.warn('getEmailOverrides: CMS read failed, using coded defaults', { message: err instanceof Error ? err.message : String(err) });
    return {};
  }
}

export const notificationsService = {
  /**
   * Fire-and-forget from the caller's perspective: catches everything
   * internally and NEVER throws -- this (not any Next.js background-work
   * primitive; see plan notes on why after() doesn't fit this repo's test
   * harness) is what satisfies charter rule 8's "a channel outage must
   * never fail a booking." Uses its own trace id -- the originating
   * request's traceId isn't threaded this far down today, so these log
   * lines correlate to their own trace, not the request that triggered them.
   */
  async notify(
    event: NotificationEvent,
    recipientUserId: string,
    organizationId: string,
    data: NotificationData,
  ): Promise<void> {
    const log = logger(newTraceId());

    let user;
    try {
      user = await authService.getUser(recipientUserId);
    } catch (err) {
      log.error('notify: failed to resolve recipient', { event, message: err instanceof Error ? err.message : String(err) });
      return;
    }
    if (!user) {
      log.warn('notify: recipient not found', { event, recipientUserId });
      return;
    }

    const locale = user.preferredLocale;
    const overrides = await getEmailOverrides(locale, log);
    const message = renderMessage(event, locale, data, overrides);
    const order = resolveChannelOrder({ phone: user.phone, email: user.email });

    // DR-205: EMAIL sends the full branded HTML body; WHATSAPP/SMS need
    // renderSmsMessage's plain-text twin instead -- an event's HTML body is
    // now a full document (branded shell), not a bare sentence, so sending
    // it verbatim over WhatsApp/SMS would show raw markup as the message
    // text. An event with no plain-text template for a given channel is
    // treated as unavailable on that channel (skip to the next one in
    // `order`), not an error.
    function bodyFor(channel: NotificationChannel): string | null {
      if (channel === 'EMAIL') return message.body;
      return renderSmsMessage(event, locale, data);
    }

    for (const channel of order) {
      const body = bodyFor(channel);
      if (body === null) {
        log.warn('notify: no plain-text template for channel, skipping', { event, channel });
        continue;
      }
      const to = channel === 'EMAIL' ? user.email : (user.phone as string);
      try {
        const { providerRef } = await gateways[channel].send({ to, subject: message.subject, body });
        await audit({
          action: 'notification.sent',
          resourceType: 'Notification',
          organizationId,
          metadata: { event, channel, providerRef },
        });
        log.info('notification sent', { event, channel });
        return;
      } catch (err) {
        log.warn('notification channel failed, falling back', {
          event,
          channel,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }

    await audit({
      action: 'notification.failed',
      resourceType: 'Notification',
      organizationId,
      metadata: { event, attemptedChannels: order },
    });
    log.error('notification failed on all channels', { event, recipientUserId });
  },

  /**
   * DR-055: sends straight to an explicit email address rather than
   * resolving one from a User row -- for an anonymous guest session (e.g.
   * a fresh /plan-my-trip TAILOR_MADE request), User.email is a synthetic
   * placeholder, not somewhere a real reply can land; the real address is
   * booking-scoped (Booking.contactEmail). No WHATSAPP/SMS fallback is
   * possible without a phone number, so this only ever tries EMAIL -- same
   * fire-and-forget, never-throws contract as notify() (charter rule 8).
   */
  async notifyEmail(
    event: NotificationEvent,
    email: string,
    locale: Locale,
    organizationId: string,
    data: NotificationData,
    // DR-250: optional, EMAIL-channel-only -- e.g. PAYMENT_SUCCEEDED attaches
    // the invoice/receipt PDF. Every other caller simply omits it.
    attachments?: EmailAttachment[],
  ): Promise<void> {
    const log = logger(newTraceId());
    const overrides = await getEmailOverrides(locale, log);
    const message = renderMessage(event, locale, data, overrides);

    try {
      const { providerRef } = await gateways.EMAIL.send({ to: email, subject: message.subject, body: message.body, attachments });
      await audit({
        action: 'notification.sent',
        resourceType: 'Notification',
        organizationId,
        metadata: { event, channel: 'EMAIL', providerRef },
      });
      log.info('notification sent', { event, channel: 'EMAIL' });
    } catch (err) {
      await audit({
        action: 'notification.failed',
        resourceType: 'Notification',
        organizationId,
        metadata: { event, attemptedChannels: ['EMAIL'] },
      });
      log.error('notification failed', { event, channel: 'EMAIL', message: err instanceof Error ? err.message : String(err) });
    }
  },

  /**
   * DR-223 (explicit user decision): for an event whose email carries the
   * real actionable content (a document to download, a rejection reason,
   * a resubmit link) but where a fast heads-up also matters, send BOTH --
   * a full email (always attempted, the guaranteed channel, via the
   * existing notifyEmail) and a short WhatsApp/SMS notice in parallel
   * (best-effort, WhatsApp before SMS, stopping at the first success).
   * Unlike notify()'s single fallback chain, the text leg never blocks or
   * substitutes for the email and vice versa -- this is deliberately two
   * independent attempts, not one chain. Takes an explicit
   * email/phone recipient (not a userId) so the caller can resolve the
   * real tour-lead contact first (DR-194's Traveler.email -> contactEmail
   * -> User.email fallback), same "explicit recipient" shape as
   * notifyEmail/notifySms above -- never throws (charter rule 8).
   */
  async notifyEmailWithHeadsUp(
    event: NotificationEvent,
    recipient: { email: string; phone: string | null },
    locale: Locale,
    organizationId: string,
    data: NotificationData,
  ): Promise<void> {
    await notificationsService.notifyEmail(event, recipient.email, locale, organizationId, data);

    if (!recipient.phone) return;
    const smsBody = renderSmsMessage(event, locale, data);
    if (!smsBody) return;

    const log = logger(newTraceId());
    for (const channel of ['WHATSAPP', 'SMS'] as const) {
      try {
        const { providerRef } = await gateways[channel].send({ to: recipient.phone, body: smsBody });
        await audit({
          action: 'notification.sent',
          resourceType: 'Notification',
          organizationId,
          metadata: { event, channel, providerRef },
        });
        log.info('notification sent', { event, channel });
        return;
      } catch (err) {
        log.warn('notification channel failed, falling back', {
          event,
          channel,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }

    await audit({
      action: 'notification.failed',
      resourceType: 'Notification',
      organizationId,
      metadata: { event, attemptedChannels: ['WHATSAPP', 'SMS'] },
    });
    log.error('heads-up text failed on all channels', { event });
  },

  /**
   * DR-056: sends straight to an explicit phone number via only the SMS
   * gateway -- same "explicit recipient, not a User lookup" shape as
   * notifyEmail, for the same caller (a fresh TAILOR_MADE request) that
   * already has the tourist's phone on hand. Unlike notifyEmail, this uses
   * a separate plain-text template map (renderSmsMessage) -- SMS has no
   * HTML rendering, so the HTML-formatted email body can't be reused
   * as-is. A no-op (not an error) when the event has no SMS template.
   */
  async notifySms(
    event: NotificationEvent,
    phone: string,
    locale: Locale,
    organizationId: string,
    data: NotificationData,
  ): Promise<void> {
    const log = logger(newTraceId());
    const body = renderSmsMessage(event, locale, data);
    if (!body) {
      log.warn('notifySms: no SMS template for event, skipping', { event });
      return;
    }

    try {
      const { providerRef } = await gateways.SMS.send({ to: phone, body });
      await audit({
        action: 'notification.sent',
        resourceType: 'Notification',
        organizationId,
        metadata: { event, channel: 'SMS', providerRef },
      });
      log.info('notification sent', { event, channel: 'SMS' });
    } catch (err) {
      await audit({
        action: 'notification.failed',
        resourceType: 'Notification',
        organizationId,
        metadata: { event, attemptedChannels: ['SMS'] },
      });
      log.error('notification failed', { event, channel: 'SMS', message: err instanceof Error ? err.message : String(err) });
    }
  },
};

// notifications module — service. Business logic; orchestrates the auth
// module + gateways. Callable by other modules ONLY through index.ts
// (module boundary rule).
import type { Locale } from '@prisma/client';
import { authService } from '@modules/auth';
import { audit } from '@lib/audit';
import { logger, newTraceId } from '@lib/logger';
import { renderMessage, renderSmsMessage, resolveChannelOrder, type NotificationData, type NotificationEvent } from './domain';
import { gateways } from './gateway';

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

    const message = renderMessage(event, user.preferredLocale, data);
    const order = resolveChannelOrder({ phone: user.phone, email: user.email });

    for (const channel of order) {
      const to = channel === 'EMAIL' ? user.email : (user.phone as string);
      try {
        const { providerRef } = await gateways[channel].send({ to, subject: message.subject, body: message.body });
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
  ): Promise<void> {
    const log = logger(newTraceId());
    const message = renderMessage(event, locale, data);

    try {
      const { providerRef } = await gateways.EMAIL.send({ to: email, subject: message.subject, body: message.body });
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

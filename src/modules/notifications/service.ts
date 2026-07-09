// notifications module — service. Business logic; orchestrates the auth
// module + gateways. Callable by other modules ONLY through index.ts
// (module boundary rule).
import { authService } from '@modules/auth';
import { audit } from '@lib/audit';
import { logger, newTraceId } from '@lib/logger';
import { renderMessage, resolveChannelOrder, type NotificationData, type NotificationEvent } from './domain';
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
};

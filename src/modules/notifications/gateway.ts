// notifications module — real (not permanently-stubbed) HTTP adapters for
// Resend/WhatsApp Cloud API/Africa's Talking, wrapped per charter rule 8
// (timeouts, retries, circuit breaker, graceful degradation). Resend +
// Africa's Talking credentials wired 2026-07-15, resolving OI-05/07 locally
// (not yet in Vercel/Production); WhatsApp/OI-06 stays unconfigured on
// purpose. Each adapter throws ChannelUnavailableError before any network
// attempt when its env var(s) are absent, which is how the
// WhatsApp -> SMS -> email fallback chain degrades gracefully. Mirrors
// invoicing/gateway.ts's interface-plus-singleton-export shape.
import type { NotificationChannel } from './domain';

export interface SendRequest {
  to: string;
  subject?: string;
  body: string;
}

export interface SendResult {
  providerRef: string;
}

export interface NotificationChannelGateway {
  send(req: SendRequest): Promise<SendResult>;
}

export class ChannelUnavailableError extends Error {}

const BREAKER_THRESHOLD = 3;
const BREAKER_COOLDOWN_MS = 60_000;

/** Per-instance (not shared module-level) breaker state, deliberately --
 * lets a test get isolated breaker behavior for free via `new XGateway()`. */
abstract class BreakerGateway {
  private failures = 0;
  private openUntil = 0;

  protected isBreakerOpen(): boolean {
    return this.openUntil > Date.now();
  }

  protected recordFailure(): void {
    this.failures += 1;
    if (this.failures >= BREAKER_THRESHOLD) {
      this.openUntil = Date.now() + BREAKER_COOLDOWN_MS;
      this.failures = 0;
    }
  }

  protected recordSuccess(): void {
    this.failures = 0;
    this.openUntil = 0;
  }
}

function isTimeoutOrAbort(err: unknown): boolean {
  return err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
}

/** One retry on a genuine failure -- but NOT on a timeout/abort, since an
 * aborted request is ambiguous (the provider may have already sent the
 * message) and retrying it risks a duplicate customer-facing notification. */
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (isTimeoutOrAbort(err)) throw err;
    return fn();
  }
}

export class ResendEmailGateway extends BreakerGateway implements NotificationChannelGateway {
  async send(req: SendRequest): Promise<SendResult> {
    if (this.isBreakerOpen()) throw new ChannelUnavailableError('EMAIL circuit open');
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) throw new ChannelUnavailableError('RESEND_API_KEY not configured');

    try {
      const json = await withRetry(async () => {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            // Resend rejects sends from an unverified domain -- polcotours.com
            // can't be verified until real DNS records exist for it (and
            // *.vercel.app subdomains aren't ours to add DKIM/SPF to), so
            // this defaults to Resend's own no-verification-needed testing
            // sender. Set RESEND_FROM_EMAIL once a real domain is verified.
            from: process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev',
            to: req.to,
            subject: req.subject ?? '',
            html: req.body,
          }),
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) throw new Error(`Resend responded ${res.status}`);
        return (await res.json()) as { id: string };
      });
      this.recordSuccess();
      return { providerRef: json.id };
    } catch (err) {
      this.recordFailure();
      throw err;
    }
  }
}

export class WhatsAppCloudGateway extends BreakerGateway implements NotificationChannelGateway {
  async send(req: SendRequest): Promise<SendResult> {
    if (this.isBreakerOpen()) throw new ChannelUnavailableError('WHATSAPP circuit open');
    const token = process.env.WHATSAPP_CLOUD_API_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    if (!token || !phoneNumberId) throw new ChannelUnavailableError('WhatsApp Cloud API not configured');

    try {
      const json = await withRetry(async () => {
        const res = await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}/messages`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: req.to,
            type: 'text',
            text: { body: req.body },
          }),
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) throw new Error(`WhatsApp Cloud API responded ${res.status}`);
        return (await res.json()) as { messages: { id: string }[] };
      });
      this.recordSuccess();
      return { providerRef: json.messages[0]?.id ?? 'unknown' };
    } catch (err) {
      this.recordFailure();
      throw err;
    }
  }
}

export class AfricasTalkingSmsGateway extends BreakerGateway implements NotificationChannelGateway {
  async send(req: SendRequest): Promise<SendResult> {
    if (this.isBreakerOpen()) throw new ChannelUnavailableError('SMS circuit open');
    const apiKey = process.env.AFRICAS_TALKING_API_KEY;
    const username = process.env.AFRICAS_TALKING_USERNAME;
    if (!apiKey || !username) throw new ChannelUnavailableError("Africa's Talking not configured");

    try {
      const json = await withRetry(async () => {
        const res = await fetch('https://api.africastalking.com/version1/messaging', {
          method: 'POST',
          headers: {
            apiKey,
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json',
          },
          body: new URLSearchParams({ username, to: req.to, message: req.body }),
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) throw new Error(`Africa's Talking responded ${res.status}`);
        return (await res.json()) as { SMSMessageData: { Recipients: { messageId: string }[] } };
      });
      this.recordSuccess();
      return { providerRef: json.SMSMessageData.Recipients[0]?.messageId ?? 'unknown' };
    } catch (err) {
      this.recordFailure();
      throw err;
    }
  }
}

export const gateways: Record<NotificationChannel, NotificationChannelGateway> = {
  WHATSAPP: new WhatsAppCloudGateway(),
  SMS: new AfricasTalkingSmsGateway(),
  EMAIL: new ResendEmailGateway(),
};

// notifications module — real (not permanently-stubbed) HTTP adapters for
// Resend/Baileys (WhatsApp)/Africa's Talking, wrapped per charter rule 8
// (timeouts, retries, circuit breaker, graceful degradation). Resend +
// Africa's Talking credentials wired 2026-07-15, resolving OI-05/07 locally
// (not yet in Vercel/Production). Each adapter throws ChannelUnavailableError
// before any network attempt when its env var(s) are absent, which is how the
// WhatsApp -> SMS -> email fallback chain degrades gracefully. Mirrors
// invoicing/gateway.ts's interface-plus-singleton-export shape.
//
// DR-258: WhatsApp is Baileys (an unofficial WhatsApp Web client), not the
// Meta WhatsApp Business Cloud API OI-06 originally planned for. Baileys
// needs a persistent WebSocket held open against a real paired WhatsApp
// account -- incompatible with a Vercel serverless function -- so it runs as
// its own always-on process (see whatsapp-bridge/ at the repo root) and this
// gateway is a plain HTTP client to that bridge's `/send` endpoint, not a
// direct Baileys import. Never import the `baileys` package from this app.
import type { EmailAttachment, NotificationChannel } from './domain';

export interface SendRequest {
  to: string;
  subject?: string;
  body: string;
  attachments?: EmailAttachment[];
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
            // DR-250: this repo talks to Resend's plain REST API, not their
            // Node SDK, which is why content needs an explicit base64
            // encode here -- the SDK auto-encodes a Buffer, this raw fetch
            // body doesn't.
            ...(req.attachments && req.attachments.length > 0
              ? { attachments: req.attachments.map((a) => ({ filename: a.filename, content: a.content.toString('base64') })) }
              : {}),
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

export class BaileysWhatsAppGateway extends BreakerGateway implements NotificationChannelGateway {
  async send(req: SendRequest): Promise<SendResult> {
    if (this.isBreakerOpen()) throw new ChannelUnavailableError('WHATSAPP circuit open');
    const bridgeUrl = process.env.WHATSAPP_BRIDGE_URL;
    const secret = process.env.WHATSAPP_BRIDGE_SECRET;
    if (!bridgeUrl || !secret) throw new ChannelUnavailableError('WhatsApp bridge not configured');

    // DR-259: only the FIRST attachment is ever sent -- the one real use
    // case (the invoice/receipt PDF) is always exactly one file; the bridge
    // sends it as a WhatsApp document message with `req.body` as its
    // caption, in place of a plain text message.
    const attachment = req.attachments?.[0];

    try {
      const json = await withRetry(async () => {
        const res = await fetch(`${bridgeUrl.replace(/\/$/, '')}/send`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: req.to,
            message: req.body,
            ...(attachment
              ? {
                  document: {
                    filename: attachment.filename,
                    // Every attachment this app produces is a PDF (invoice/
                    // receipt, itinerary, package summary) -- no caller has
                    // ever needed another file type, so this stays hardcoded
                    // rather than threaded through as its own field.
                    mimeType: 'application/pdf',
                    contentBase64: attachment.content.toString('base64'),
                  },
                }
              : {}),
          }),
          signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) throw new Error(`WhatsApp bridge responded ${res.status}`);
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
  WHATSAPP: new BaileysWhatsAppGateway(),
  SMS: new AfricasTalkingSmsGateway(),
  EMAIL: new ResendEmailGateway(),
};

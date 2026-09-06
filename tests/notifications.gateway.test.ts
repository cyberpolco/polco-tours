import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  AfricasTalkingSmsGateway,
  BaileysWhatsAppGateway,
  ChannelUnavailableError,
  ResendEmailGateway,
} from '../src/modules/notifications/gateway';

/**
 * Deep-imports the gateway classes directly (same convention as this repo's
 * other domain-level tests) so each test gets a fresh circuit-breaker
 * instance -- breaker state is per-instance, not a shared module-level map,
 * specifically for this kind of test isolation.
 */
describe('notification gateways', () => {
  const fetchSpy = vi.fn();

  beforeEach(() => {
    fetchSpy.mockReset();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  describe('graceful degradation when unconfigured (no provider credentials exist yet, OI-07)', () => {
    it('ResendEmailGateway throws without RESEND_API_KEY, never calling fetch', async () => {
      const gw = new ResendEmailGateway();
      await expect(gw.send({ to: 'a@example.test', body: 'hi' })).rejects.toBeInstanceOf(ChannelUnavailableError);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('BaileysWhatsAppGateway throws without its env vars, never calling fetch', async () => {
      const gw = new BaileysWhatsAppGateway();
      await expect(gw.send({ to: '+15551234567', body: 'hi' })).rejects.toBeInstanceOf(ChannelUnavailableError);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("AfricasTalkingSmsGateway throws without its env vars, never calling fetch", async () => {
      const gw = new AfricasTalkingSmsGateway();
      await expect(gw.send({ to: '+15551234567', body: 'hi' })).rejects.toBeInstanceOf(ChannelUnavailableError);
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe('BaileysWhatsAppGateway (DR-258)', () => {
    it('POSTs to the bridge /send endpoint with a bearer token and the message body', async () => {
      vi.stubEnv('WHATSAPP_BRIDGE_URL', 'https://bridge.internal');
      vi.stubEnv('WHATSAPP_BRIDGE_SECRET', 'test-secret');
      fetchSpy.mockResolvedValue({ ok: true, json: async () => ({ id: 'wamid.123' }) });
      const gw = new BaileysWhatsAppGateway();

      const result = await gw.send({ to: '+264811234567', body: 'hi' });

      expect(result).toEqual({ providerRef: 'wamid.123' });
      const [url, requestInit] = fetchSpy.mock.calls[0]!;
      expect(url).toBe('https://bridge.internal/send');
      expect(requestInit.headers.Authorization).toBe('Bearer test-secret');
      expect(JSON.parse(requestInit.body as string)).toEqual({ to: '+264811234567', message: 'hi' });
    });

    it('throws ChannelUnavailableError when only one of the two env vars is set', async () => {
      vi.stubEnv('WHATSAPP_BRIDGE_URL', 'https://bridge.internal');
      const gw = new BaileysWhatsAppGateway();
      await expect(gw.send({ to: '+15551234567', body: 'hi' })).rejects.toBeInstanceOf(ChannelUnavailableError);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    // DR-259: the first attachment (only) becomes a WhatsApp document
    // message, base64-encoded, with the text body as its caption.
    it('sends the first attachment as a base64 document, with the body as its caption', async () => {
      vi.stubEnv('WHATSAPP_BRIDGE_URL', 'https://bridge.internal');
      vi.stubEnv('WHATSAPP_BRIDGE_SECRET', 'test-secret');
      fetchSpy.mockResolvedValue({ ok: true, json: async () => ({ id: 'wamid.456' }) });
      const gw = new BaileysWhatsAppGateway();

      const content = Buffer.from('%PDF-1.7 fake pdf bytes');
      await gw.send({ to: '+264811234567', body: 'Your booking is confirmed!', attachments: [{ filename: 'invoice.pdf', content }] });

      const [, requestInit] = fetchSpy.mock.calls[0]!;
      const sentBody = JSON.parse(requestInit.body as string);
      expect(sentBody.message).toBe('Your booking is confirmed!');
      expect(sentBody.document).toEqual({
        filename: 'invoice.pdf',
        mimeType: 'application/pdf',
        contentBase64: content.toString('base64'),
      });
    });

    it('omits the document field entirely when no attachment is given', async () => {
      vi.stubEnv('WHATSAPP_BRIDGE_URL', 'https://bridge.internal');
      vi.stubEnv('WHATSAPP_BRIDGE_SECRET', 'test-secret');
      fetchSpy.mockResolvedValue({ ok: true, json: async () => ({ id: 'wamid.789' }) });
      const gw = new BaileysWhatsAppGateway();

      await gw.send({ to: '+264811234567', body: 'hi' });

      const [, requestInit] = fetchSpy.mock.calls[0]!;
      const sentBody = JSON.parse(requestInit.body as string);
      expect(sentBody.document).toBeUndefined();
    });
  });

  describe('circuit breaker', () => {
    it('opens after 3 consecutive failures and skips the network call entirely while open', async () => {
      vi.stubEnv('RESEND_API_KEY', 'test-key');
      fetchSpy.mockResolvedValue({ ok: false, status: 500 });
      const gw = new ResendEmailGateway();

      for (let i = 0; i < 3; i++) {
        await expect(gw.send({ to: 'a@example.test', body: 'hi' })).rejects.toThrow();
      }
      expect(fetchSpy).toHaveBeenCalledTimes(6); // 3 failed sends x (1 attempt + 1 retry)

      fetchSpy.mockClear();
      await expect(gw.send({ to: 'a@example.test', body: 'hi' })).rejects.toBeInstanceOf(ChannelUnavailableError);
      expect(fetchSpy).not.toHaveBeenCalled(); // breaker open -- no network attempt at all
    });
  });

  describe('attachments (DR-250)', () => {
    it('base64-encodes a Buffer attachment into the Resend REST call body', async () => {
      vi.stubEnv('RESEND_API_KEY', 'test-key');
      fetchSpy.mockResolvedValue({ ok: true, json: async () => ({ id: 'resend-id' }) });
      const gw = new ResendEmailGateway();

      const content = Buffer.from('%PDF-1.7 fake pdf bytes');
      await gw.send({ to: 'a@example.test', body: 'hi', attachments: [{ filename: 'invoice.pdf', content }] });

      const [, requestInit] = fetchSpy.mock.calls[0]!;
      const sentBody = JSON.parse(requestInit.body as string);
      expect(sentBody.attachments).toEqual([{ filename: 'invoice.pdf', content: content.toString('base64') }]);
    });

    it('omits the attachments field entirely when none are given', async () => {
      vi.stubEnv('RESEND_API_KEY', 'test-key');
      fetchSpy.mockResolvedValue({ ok: true, json: async () => ({ id: 'resend-id' }) });
      const gw = new ResendEmailGateway();

      await gw.send({ to: 'a@example.test', body: 'hi' });

      const [, requestInit] = fetchSpy.mock.calls[0]!;
      const sentBody = JSON.parse(requestInit.body as string);
      expect(sentBody.attachments).toBeUndefined();
    });
  });

  describe('retry policy', () => {
    it('retries once on a genuine failure', async () => {
      vi.stubEnv('RESEND_API_KEY', 'test-key');
      fetchSpy.mockRejectedValue(new Error('network error'));
      const gw = new ResendEmailGateway();
      await expect(gw.send({ to: 'a@example.test', body: 'hi' })).rejects.toThrow();
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('does NOT retry on a timeout/abort (avoids a duplicate send to the recipient)', async () => {
      vi.stubEnv('RESEND_API_KEY', 'test-key');
      const abortErr = new Error('The operation was aborted');
      abortErr.name = 'TimeoutError';
      fetchSpy.mockRejectedValue(abortErr);
      const gw = new ResendEmailGateway();
      await expect(gw.send({ to: 'a@example.test', body: 'hi' })).rejects.toThrow();
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });
  });
});

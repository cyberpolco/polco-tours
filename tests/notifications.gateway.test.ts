import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  AfricasTalkingSmsGateway,
  ChannelUnavailableError,
  ResendEmailGateway,
  WhatsAppCloudGateway,
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

  describe('graceful degradation when unconfigured (no provider credentials exist yet, OI-05/06/07)', () => {
    it('ResendEmailGateway throws without RESEND_API_KEY, never calling fetch', async () => {
      const gw = new ResendEmailGateway();
      await expect(gw.send({ to: 'a@example.test', body: 'hi' })).rejects.toBeInstanceOf(ChannelUnavailableError);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('WhatsAppCloudGateway throws without its env vars, never calling fetch', async () => {
      const gw = new WhatsAppCloudGateway();
      await expect(gw.send({ to: '+15551234567', body: 'hi' })).rejects.toBeInstanceOf(ChannelUnavailableError);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("AfricasTalkingSmsGateway throws without its env vars, never calling fetch", async () => {
      const gw = new AfricasTalkingSmsGateway();
      await expect(gw.send({ to: '+15551234567', body: 'hi' })).rejects.toBeInstanceOf(ChannelUnavailableError);
      expect(fetchSpy).not.toHaveBeenCalled();
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

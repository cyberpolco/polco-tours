import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const verifyMock = vi.fn();
vi.mock('@upstash/qstash', () => ({
  Receiver: vi.fn().mockImplementation(() => ({ verify: verifyMock })),
}));

// A single static import is enough -- like rate-limit.ts (DR-066), every
// function here reads process.env fresh on each call, so vi.stubEnv per
// test is sufficient with no module-reset dance needed.
import { isQstashConfigured, verifyQstashSignature } from '../../src/lib/qstash';

describe('qstash (DR-067)', () => {
  beforeEach(() => {
    verifyMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('unconfigured (OI-11, no account provisioned yet)', () => {
    it('isQstashConfigured() is false', () => {
      expect(isQstashConfigured()).toBe(false);
    });

    it('verifyQstashSignature returns false without ever constructing a Receiver', async () => {
      const result = await verifyQstashSignature('some-signature', 'body');
      expect(result).toBe(false);
      expect(verifyMock).not.toHaveBeenCalled();
    });

    it('verifyQstashSignature returns false with no signature header at all', async () => {
      expect(await verifyQstashSignature(null, 'body')).toBe(false);
    });
  });

  describe('configured', () => {
    beforeEach(() => {
      vi.stubEnv('QSTASH_CURRENT_SIGNING_KEY', 'current-key');
      vi.stubEnv('QSTASH_NEXT_SIGNING_KEY', 'next-key');
    });

    it('isQstashConfigured() is true', () => {
      expect(isQstashConfigured()).toBe(true);
    });

    it('returns true when the signature verifies', async () => {
      verifyMock.mockResolvedValue(true);
      const result = await verifyQstashSignature('sig', 'the-body');
      expect(result).toBe(true);
      expect(verifyMock).toHaveBeenCalledWith({ signature: 'sig', body: 'the-body' });
    });

    it('returns false when the signature does not verify', async () => {
      verifyMock.mockResolvedValue(false);
      expect(await verifyQstashSignature('sig', 'body')).toBe(false);
    });

    it('returns false, never throws, when Receiver.verify itself throws', async () => {
      verifyMock.mockRejectedValue(new Error('bad signature'));
      await expect(verifyQstashSignature('sig', 'body')).resolves.toBe(false);
    });

    it('still returns false with no signature header, without calling verify', async () => {
      expect(await verifyQstashSignature(null, 'body')).toBe(false);
      expect(verifyMock).not.toHaveBeenCalled();
    });
  });
});

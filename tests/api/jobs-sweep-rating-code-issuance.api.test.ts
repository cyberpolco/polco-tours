import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const verifyQstashSignatureMock = vi.fn();
vi.mock('@lib/qstash', () => ({
  verifyQstashSignature: (...args: unknown[]) => verifyQstashSignatureMock(...args),
}));

const runAutomaticRatingCodeIssuanceMock = vi.fn();
vi.mock('@modules/ratings', () => ({
  ratingsService: { runAutomaticRatingCodeIssuance: (...args: unknown[]) => runAutomaticRatingCodeIssuanceMock(...args) },
}));

const { POST } = await import('../../src/app/api/jobs/sweep-rating-code-issuance/route');

function makeRequest(body: string, signature?: string): NextRequest {
  const headers = new Headers();
  if (signature) headers.set('upstash-signature', signature);
  return new NextRequest('http://localhost/api/jobs/sweep-rating-code-issuance', { method: 'POST', headers, body });
}

describe('POST /api/jobs/sweep-rating-code-issuance (DR-261)', () => {
  beforeEach(() => {
    verifyQstashSignatureMock.mockReset();
    runAutomaticRatingCodeIssuanceMock.mockReset();
  });

  it('rejects with 401 when the signature does not verify, and never runs the sweep', async () => {
    verifyQstashSignatureMock.mockResolvedValue(false);

    const res = await POST(makeRequest('{}', 'bad-sig'));

    expect(res.status).toBe(401);
    expect(runAutomaticRatingCodeIssuanceMock).not.toHaveBeenCalled();
  });

  it('rejects with 401 when there is no signature header at all', async () => {
    verifyQstashSignatureMock.mockResolvedValue(false);

    const res = await POST(makeRequest('{}'));

    expect(res.status).toBe(401);
    expect(runAutomaticRatingCodeIssuanceMock).not.toHaveBeenCalled();
  });

  it('runs the sweep and returns its result once the signature verifies', async () => {
    verifyQstashSignatureMock.mockResolvedValue(true);
    runAutomaticRatingCodeIssuanceMock.mockResolvedValue({ organizationsSwept: 2, issuedCount: 3 });

    const res = await POST(makeRequest('{}', 'good-sig'));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ organizationsSwept: 2, issuedCount: 3 });
    expect(runAutomaticRatingCodeIssuanceMock).toHaveBeenCalledOnce();
  });

  it('passes the raw body and signature header straight through to verification', async () => {
    verifyQstashSignatureMock.mockResolvedValue(true);
    runAutomaticRatingCodeIssuanceMock.mockResolvedValue({ organizationsSwept: 0, issuedCount: 0 });

    await POST(makeRequest('raw-body-text', 'good-sig'));

    expect(verifyQstashSignatureMock).toHaveBeenCalledWith('good-sig', 'raw-body-text');
  });

  it('translates an unhandled service error into a clean 500 problem+json response, never leaking internals', async () => {
    verifyQstashSignatureMock.mockResolvedValue(true);
    runAutomaticRatingCodeIssuanceMock.mockRejectedValue(new Error('db exploded'));

    const res = await POST(makeRequest('{}', 'good-sig'));

    expect(res.status).toBe(500);
    expect(res.headers.get('content-type')).toContain('application/problem+json');
    const body = await res.json();
    expect(body.detail).toBeUndefined();
  });
});

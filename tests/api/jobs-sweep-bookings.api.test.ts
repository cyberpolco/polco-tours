import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const verifyQstashSignatureMock = vi.fn();
vi.mock('@lib/qstash', () => ({
  verifyQstashSignature: (...args: unknown[]) => verifyQstashSignatureMock(...args),
}));

const runScheduledSweepMock = vi.fn();
vi.mock('@modules/booking', () => ({
  bookingService: { runScheduledSweep: (...args: unknown[]) => runScheduledSweepMock(...args) },
}));

const { POST } = await import('../../src/app/api/jobs/sweep-bookings/route');

function makeRequest(body: string, signature?: string): NextRequest {
  const headers = new Headers();
  if (signature) headers.set('upstash-signature', signature);
  return new NextRequest('http://localhost/api/jobs/sweep-bookings', { method: 'POST', headers, body });
}

describe('POST /api/jobs/sweep-bookings (DR-067)', () => {
  beforeEach(() => {
    verifyQstashSignatureMock.mockReset();
    runScheduledSweepMock.mockReset();
  });

  it('rejects with 401 when the signature does not verify, and never runs the sweep', async () => {
    verifyQstashSignatureMock.mockResolvedValue(false);

    const res = await POST(makeRequest('{}', 'bad-sig'));

    expect(res.status).toBe(401);
    expect(runScheduledSweepMock).not.toHaveBeenCalled();
  });

  it('rejects with 401 when there is no signature header at all -- same as OI-11 unconfigured', async () => {
    verifyQstashSignatureMock.mockResolvedValue(false);

    const res = await POST(makeRequest('{}'));

    expect(res.status).toBe(401);
    expect(runScheduledSweepMock).not.toHaveBeenCalled();
  });

  it('runs the sweep and returns its result once the signature verifies', async () => {
    verifyQstashSignatureMock.mockResolvedValue(true);
    runScheduledSweepMock.mockResolvedValue({ organizationsSwept: 3 });

    const res = await POST(makeRequest('{}', 'good-sig'));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ organizationsSwept: 3 });
    expect(runScheduledSweepMock).toHaveBeenCalledOnce();
  });

  it('passes the raw body and signature header straight through to verification', async () => {
    verifyQstashSignatureMock.mockResolvedValue(true);
    runScheduledSweepMock.mockResolvedValue({ organizationsSwept: 0 });

    await POST(makeRequest('raw-body-text', 'good-sig'));

    expect(verifyQstashSignatureMock).toHaveBeenCalledWith('good-sig', 'raw-body-text');
  });

  it('translates an unhandled service error into a clean 500 problem+json response, never leaking internals', async () => {
    verifyQstashSignatureMock.mockResolvedValue(true);
    runScheduledSweepMock.mockRejectedValue(new Error('db exploded'));

    const res = await POST(makeRequest('{}', 'good-sig'));

    expect(res.status).toBe(500);
    expect(res.headers.get('content-type')).toContain('application/problem+json');
    const body = await res.json();
    expect(body.detail).toBeUndefined();
  });
});

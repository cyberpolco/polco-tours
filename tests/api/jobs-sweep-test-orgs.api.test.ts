import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const verifyQstashSignatureMock = vi.fn();
vi.mock('@lib/qstash', () => ({
  verifyQstashSignature: (...args: unknown[]) => verifyQstashSignatureMock(...args),
}));

const purgeStaleTestOrganizationsMock = vi.fn();
vi.mock('@lib/test-org-purge', () => ({
  purgeStaleTestOrganizations: (...args: unknown[]) => purgeStaleTestOrganizationsMock(...args),
}));

const { POST } = await import('../../src/app/api/jobs/sweep-test-orgs/route');

function makeRequest(body: string, signature?: string): NextRequest {
  const headers = new Headers();
  if (signature) headers.set('upstash-signature', signature);
  return new NextRequest('http://localhost/api/jobs/sweep-test-orgs', { method: 'POST', headers, body });
}

describe('POST /api/jobs/sweep-test-orgs (DR-235)', () => {
  beforeEach(() => {
    verifyQstashSignatureMock.mockReset();
    purgeStaleTestOrganizationsMock.mockReset();
  });

  it('rejects with 401 when the signature does not verify, and never runs the purge', async () => {
    verifyQstashSignatureMock.mockResolvedValue(false);

    const res = await POST(makeRequest('{}', 'bad-sig'));

    expect(res.status).toBe(401);
    expect(purgeStaleTestOrganizationsMock).not.toHaveBeenCalled();
  });

  it('rejects with 401 when there is no signature header at all', async () => {
    verifyQstashSignatureMock.mockResolvedValue(false);

    const res = await POST(makeRequest('{}'));

    expect(res.status).toBe(401);
    expect(purgeStaleTestOrganizationsMock).not.toHaveBeenCalled();
  });

  it('runs the purge and returns its result once the signature verifies', async () => {
    verifyQstashSignatureMock.mockResolvedValue(true);
    purgeStaleTestOrganizationsMock.mockResolvedValue({ purged: 3, failed: 0, failedIds: [] });

    const res = await POST(makeRequest('{}', 'good-sig'));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ purged: 3, failed: 0, failedIds: [] });
    expect(purgeStaleTestOrganizationsMock).toHaveBeenCalledOnce();
  });

  it('translates an unhandled error into a clean 500 problem+json response, never leaking internals', async () => {
    verifyQstashSignatureMock.mockResolvedValue(true);
    purgeStaleTestOrganizationsMock.mockRejectedValue(new Error('db exploded'));

    const res = await POST(makeRequest('{}', 'good-sig'));

    expect(res.status).toBe(500);
    expect(res.headers.get('content-type')).toContain('application/problem+json');
    const body = await res.json();
    expect(body.detail).toBeUndefined();
  });
});

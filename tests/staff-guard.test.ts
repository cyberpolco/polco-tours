import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.mock factories are hoisted above top-level const declarations, so the
// mock fns themselves must be created via vi.hoisted() to be safely
// referenced from inside them.
const { resolveSession, headersMock } = vi.hoisted(() => ({
  resolveSession: vi.fn(),
  headersMock: vi.fn(async () => new Headers()),
}));

vi.mock('@modules/auth', () => ({
  authService: { resolveSession },
}));

vi.mock('next/headers', () => ({
  headers: headersMock,
}));

// Uses the REAL next/navigation redirect() -- confirmed safe to call outside
// a live Next request: it's a plain synchronous throw of an Error whose
// `.digest` is shaped `NEXT_REDIRECT;${type};${url};${statusCode};`.
import { requireStaffContext } from '../src/lib/staff-guard';

describe('requireStaffContext', () => {
  beforeEach(() => {
    resolveSession.mockReset();
    headersMock.mockClear();
  });

  it('redirects to /staff/login when the session cannot be resolved', async () => {
    resolveSession.mockRejectedValue(new Error('unauthorized'));
    await expect(requireStaffContext('booking.read')).rejects.toMatchObject({
      digest: expect.stringContaining('/staff/login'),
    });
  });

  it('redirects to /staff/forbidden when the role lacks the permission', async () => {
    resolveSession.mockResolvedValue({
      userId: 'u1',
      role: 'TOURIST',
      organizationId: 'org1',
      sessionId: 's1',
      assignedCountry: null,
    });
    await expect(requireStaffContext('booking.confirm')).rejects.toMatchObject({
      digest: expect.stringContaining('/staff/forbidden'),
    });
  });

  it('returns the resolved context when the session and permission both succeed', async () => {
    const ctx = { userId: 'u1', role: 'TOUR_OPERATOR', organizationId: 'org1', sessionId: 's1', assignedCountry: null };
    resolveSession.mockResolvedValue(ctx);
    await expect(requireStaffContext('booking.confirm')).resolves.toEqual(ctx);
  });

  // DR-020: the (dashboard) layout now calls requireStaffContext() with no
  // permission -- "any staff role" -- instead of hardcoding booking.confirm,
  // which previously locked IMMIGRATION_OFFICER out of the dashboard shell
  // entirely despite holding a real permission (immigration.read).
  it('with no permission argument, any staff-side role passes (baseline dashboard gate)', async () => {
    const ctx = {
      userId: 'u2',
      role: 'IMMIGRATION_OFFICER',
      organizationId: 'org1',
      sessionId: 's2',
      assignedCountry: 'NA',
    };
    resolveSession.mockResolvedValue(ctx);
    await expect(requireStaffContext()).resolves.toEqual(ctx);
  });

  it('with no permission argument, TOURIST is still redirected to /staff/forbidden', async () => {
    resolveSession.mockResolvedValue({
      userId: 'u3',
      role: 'TOURIST',
      organizationId: 'org1',
      sessionId: 's3',
      assignedCountry: null,
    });
    await expect(requireStaffContext()).rejects.toMatchObject({
      digest: expect.stringContaining('/staff/forbidden'),
    });
  });
});

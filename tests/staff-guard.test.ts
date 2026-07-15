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
      roles: ['TOURIST'],
      organizationId: 'org1',
      sessionId: 's1',
      assignedCountry: null,
      mustChangePassword: false,
    });
    await expect(requireStaffContext('booking.confirm')).rejects.toMatchObject({
      digest: expect.stringContaining('/staff/forbidden'),
    });
  });

  it('returns the resolved context when the session and permission both succeed', async () => {
    const ctx = {
      userId: 'u1',
      roles: ['TOUR_OPERATOR'],
      organizationId: 'org1',
      sessionId: 's1',
      assignedCountry: null,
      mustChangePassword: false,
    };
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
      roles: ['IMMIGRATION_OFFICER'],
      organizationId: 'org1',
      sessionId: 's2',
      assignedCountry: 'NA',
      mustChangePassword: false,
    };
    resolveSession.mockResolvedValue(ctx);
    await expect(requireStaffContext()).resolves.toEqual(ctx);
  });

  it('with no permission argument, TOURIST is still redirected to /staff/forbidden', async () => {
    resolveSession.mockResolvedValue({
      userId: 'u3',
      roles: ['TOURIST'],
      organizationId: 'org1',
      sessionId: 's3',
      assignedCountry: null,
      mustChangePassword: false,
    });
    await expect(requireStaffContext()).rejects.toMatchObject({
      digest: expect.stringContaining('/staff/forbidden'),
    });
  });

  // DR-026: a forced password change wins over every other gate, including
  // one the role would otherwise pass.
  it('redirects to /staff/change-password when mustChangePassword is true, even for a role that holds the permission', async () => {
    resolveSession.mockResolvedValue({
      userId: 'u4',
      roles: ['SUPERADMIN'],
      organizationId: 'org1',
      sessionId: 's4',
      assignedCountry: null,
      mustChangePassword: true,
    });
    await expect(requireStaffContext('admin.all')).rejects.toMatchObject({
      digest: expect.stringContaining('/staff/change-password'),
    });
  });

  it('DR-026: a user holding multiple roles passes if ANY held role grants the permission', async () => {
    const ctx = {
      userId: 'u5',
      roles: ['TOURIST', 'DRIVER'],
      organizationId: 'org1',
      sessionId: 's5',
      assignedCountry: null,
      mustChangePassword: false,
    };
    resolveSession.mockResolvedValue(ctx);
    await expect(requireStaffContext('fleet.read')).resolves.toEqual(ctx);
  });
});

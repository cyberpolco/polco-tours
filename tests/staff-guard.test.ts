import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Role } from '@prisma/client';
import { resolvePermissionsForRoles } from '../src/lib/rbac';

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
import { requireStaffContext, resolveStaffLandingPath } from '../src/lib/staff-guard';

function permissionSourceFor(roles: Role[]) {
  return { roles, permissions: resolvePermissionsForRoles(roles) };
}

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
      permissions: new Set([]),
      organizationId: 'org1',
      sessionId: 's1',
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
      permissions: new Set(['booking.confirm']),
      organizationId: 'org1',
      sessionId: 's1',
      mustChangePassword: false,
    };
    resolveSession.mockResolvedValue(ctx);
    await expect(requireStaffContext('booking.confirm')).resolves.toEqual(ctx);
  });

  // DR-020: the (dashboard) layout now calls requireStaffContext() with no
  // permission -- "any staff role" -- instead of hardcoding booking.confirm,
  // which previously locked out any role that isn't TOUR_OPERATOR/admin.
  it('with no permission argument, any staff-side role passes (baseline dashboard gate)', async () => {
    const ctx = {
      userId: 'u2',
      roles: ['VISA_FACILITATOR'],
      permissions: new Set([]),
      organizationId: 'org1',
      sessionId: 's2',
      mustChangePassword: false,
    };
    resolveSession.mockResolvedValue(ctx);
    await expect(requireStaffContext()).resolves.toEqual(ctx);
  });

  it('with no permission argument, TOURIST is still redirected to /staff/forbidden', async () => {
    resolveSession.mockResolvedValue({
      userId: 'u3',
      roles: ['TOURIST'],
      permissions: new Set([]),
      organizationId: 'org1',
      sessionId: 's3',
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
      permissions: new Set(['admin.all']),
      organizationId: 'org1',
      sessionId: 's4',
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
      permissions: new Set(['fleet.read']),
      organizationId: 'org1',
      sessionId: 's5',
      mustChangePassword: false,
    };
    resolveSession.mockResolvedValue(ctx);
    await expect(requireStaffContext('fleet.read')).resolves.toEqual(ctx);
  });
});

// Real bug fix: every "where does a just-authenticated staff session land"
// call site hardcoded '/staff/bookings', a page gated to PLATFORM_ADMIN/
// TOUR_OPERATOR only -- a VISA_FACILITATOR-only (or TOUR_GUIDE/DRIVER/
// VEHICLE_OWNER-only) account signed in successfully and was immediately
// bounced to /staff/forbidden. resolveStaffLandingPath is the fix.
describe('resolveStaffLandingPath', () => {
  it('lands PLATFORM_ADMIN, TOUR_OPERATOR, and SUPERADMIN on Bookings (STAFF_PAGE_ACCESS.bookingsBrowse)', () => {
    expect(resolveStaffLandingPath(permissionSourceFor(['PLATFORM_ADMIN']))).toBe('/staff/bookings');
    expect(resolveStaffLandingPath(permissionSourceFor(['TOUR_OPERATOR']))).toBe('/staff/bookings');
    expect(resolveStaffLandingPath(permissionSourceFor(['SUPERADMIN']))).toBe('/staff/bookings');
  });

  it('lands a VISA_FACILITATOR-only account on the Visa Queue instead of the Bookings page it cannot open', () => {
    expect(resolveStaffLandingPath(permissionSourceFor(['VISA_FACILITATOR']))).toBe('/staff/visa-queue');
  });

  it('lands TOUR_GUIDE/DRIVER/VEHICLE_OWNER-only accounts on My Schedule instead of the Bookings page they cannot open', () => {
    expect(resolveStaffLandingPath(permissionSourceFor(['TOUR_GUIDE']))).toBe('/staff/schedule');
    expect(resolveStaffLandingPath(permissionSourceFor(['DRIVER']))).toBe('/staff/schedule');
    expect(resolveStaffLandingPath(permissionSourceFor(['VEHICLE_OWNER']))).toBe('/staff/schedule');
  });

  it('a VISA_FACILITATOR paired with TOUR_OPERATOR or SUPERADMIN (ROLE_COMPATIBILITY) lands on Bookings via the other role', () => {
    expect(resolveStaffLandingPath(permissionSourceFor(['VISA_FACILITATOR', 'TOUR_OPERATOR']))).toBe('/staff/bookings');
    expect(resolveStaffLandingPath(permissionSourceFor(['VISA_FACILITATOR', 'SUPERADMIN']))).toBe('/staff/bookings');
  });
});

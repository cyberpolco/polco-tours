import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * DR-139 regression: real incident (SUPERADMIN's own User.name was silently
 * overwritten with a client's typed name, "Hanna"). Root cause: these three
 * guest booking wizards call authService.resolveSession() with no check on
 * whether the resolved session belongs to a staff account rather than a
 * genuine anonymous tourist -- a staff member opening a guest flow in the
 * same browser they're signed into /staff with got their OWN account back
 * as `ctx`, and the wizard's contact-step name/phone then overwrote it via
 * authService.updateProfile. Fixed by skipping that call whenever
 * isStaffRole(ctx.roles) is true. Same vi.mock/vi.hoisted pattern as
 * tests/staff-guard.test.ts.
 */
const { resolveSession, updateProfile, headersMock, cookiesMock } = vi.hoisted(() => ({
  resolveSession: vi.fn(),
  updateProfile: vi.fn(),
  headersMock: vi.fn(async () => new Headers()),
  cookiesMock: vi.fn(async () => ({ get: () => undefined })),
}));

vi.mock('@modules/auth', () => ({
  authService: { resolveSession, updateProfile },
}));

vi.mock('next/headers', () => ({
  headers: headersMock,
  cookies: cookiesMock,
}));

const createHold = vi.fn();
const createHoldWithDates = vi.fn();
const createTailorMadeRequest = vi.fn();

vi.mock('@modules/booking', async () => {
  const actual = await vi.importActual<typeof import('@modules/booking')>('@modules/booking');
  return { ...actual, bookingService: { createHold, createHoldWithDates, createTailorMadeRequest } };
});

const { createGuestBookingAction } = await import('../src/app/(guest)/book/[departureId]/actions');
const { createGuestPackageBookingAction } = await import('../src/app/(guest)/book-package/[packageId]/actions');
const { createPlanMyTripRequestAction } = await import('../src/app/(guest)/plan-my-trip/actions');

const STAFF_CTX = {
  userId: 'staff-1',
  roles: ['SUPERADMIN'],
  permissions: new Set<string>(),
  organizationId: 'org-1',
  sessionId: 'sess-staff',
  mustChangePassword: false,
};

const GUEST_CTX = {
  userId: 'guest-1',
  roles: ['TOURIST'],
  permissions: new Set<string>(),
  organizationId: 'org-1',
  sessionId: 'sess-guest',
  mustChangePassword: false,
};

function bookingFormData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

describe('guest booking wizards never overwrite a staff session\'s own profile (DR-139)', () => {
  beforeEach(() => {
    resolveSession.mockReset();
    updateProfile.mockReset();
    createHold.mockReset();
    createHoldWithDates.mockReset();
    createTailorMadeRequest.mockReset();
  });

  it('createGuestBookingAction skips updateProfile when the resolved session is staff', async () => {
    resolveSession.mockResolvedValue(STAFF_CTX);
    createHold.mockResolvedValue({ id: 'booking-1' });
    const result = await createGuestBookingAction(
      '11111111-1111-4111-8111-111111111111',
      bookingFormData({ firstName: 'Hanna', lastName: 'Client', seats: '2' }),
    );
    expect(result).toEqual({ bookingId: 'booking-1' });
    expect(updateProfile).not.toHaveBeenCalled();
    expect(createHold).toHaveBeenCalledWith(STAFF_CTX, expect.objectContaining({ seats: 2 }));
  });

  it('createGuestBookingAction still updates a real guest profile', async () => {
    resolveSession.mockResolvedValue(GUEST_CTX);
    createHold.mockResolvedValue({ id: 'booking-2' });
    await createGuestBookingAction(
      '11111111-1111-4111-8111-111111111111',
      bookingFormData({ firstName: 'Real', lastName: 'Guest', seats: '1' }),
    );
    expect(updateProfile).toHaveBeenCalledWith(GUEST_CTX, expect.objectContaining({ name: 'Real Guest' }));
  });

  it('createGuestPackageBookingAction skips updateProfile when the resolved session is staff', async () => {
    resolveSession.mockResolvedValue(STAFF_CTX);
    createHoldWithDates.mockResolvedValue({ id: 'booking-3' });
    const result = await createGuestPackageBookingAction(
      '22222222-2222-4222-8222-222222222222',
      bookingFormData({ firstName: 'Hanna', lastName: 'Client', startDate: '2026-09-01', seats: '2' }),
    );
    expect(result).toEqual({ bookingId: 'booking-3' });
    expect(updateProfile).not.toHaveBeenCalled();
  });

  it('createPlanMyTripRequestAction skips updateProfile when the resolved session is staff', async () => {
    resolveSession.mockResolvedValue(STAFF_CTX);
    createTailorMadeRequest.mockResolvedValue({ id: 'booking-4' });
    const result = await createPlanMyTripRequestAction({
      countries: ['NA'],
      customTravelStart: '2026-09-01',
      customTravelEnd: '2026-09-10',
      seats: 2,
      preferredTags: [],
      preferredSites: [],
      countryOfResidence: 'US',
      citizenship: 'US',
      firstName: 'Hanna',
      lastName: 'Client',
      email: 'hanna@example.test',
      dialCode: '+264',
      localNumber: '811234567',
    });
    expect(result).toEqual({ bookingId: 'booking-4' });
    expect(updateProfile).not.toHaveBeenCalled();
  });

  it('createPlanMyTripRequestAction still updates a real guest profile', async () => {
    resolveSession.mockResolvedValue(GUEST_CTX);
    createTailorMadeRequest.mockResolvedValue({ id: 'booking-5' });
    await createPlanMyTripRequestAction({
      countries: ['NA'],
      customTravelStart: '2026-09-01',
      customTravelEnd: '2026-09-10',
      seats: 2,
      preferredTags: [],
      preferredSites: [],
      countryOfResidence: 'US',
      citizenship: 'US',
      firstName: 'Real',
      lastName: 'Guest',
      email: 'real@example.test',
      dialCode: '+264',
      localNumber: '811234567',
    });
    expect(updateProfile).toHaveBeenCalledWith(GUEST_CTX, expect.objectContaining({ name: 'Real Guest' }));
  });
});

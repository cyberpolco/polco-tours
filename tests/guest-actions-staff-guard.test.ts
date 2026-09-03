import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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
const { resolveSession, updateProfile, getUserByEmail, headersMock, cookiesMock, requireGuestContext } = vi.hoisted(() => ({
  resolveSession: vi.fn(),
  updateProfile: vi.fn(),
  getUserByEmail: vi.fn(),
  headersMock: vi.fn(async () => new Headers()),
  cookiesMock: vi.fn(async () => ({ get: (_key?: string) => undefined as { value: string } | undefined })),
  requireGuestContext: vi.fn(),
}));

vi.mock('@modules/auth', () => ({
  authService: { resolveSession, updateProfile, getUserByEmail },
}));

vi.mock('@lib/guest-guard', () => ({ requireGuestContext }));

vi.mock('next/headers', () => ({
  headers: headersMock,
  cookies: cookiesMock,
}));

const createHold = vi.fn();
const createHoldWithDates = vi.fn();
const createTailorMadeRequest = vi.fn();
const addTraveler = vi.fn();
const listTravelers = vi.fn();
const getById = vi.fn();

vi.mock('@modules/booking', async () => {
  const actual = await vi.importActual<typeof import('@modules/booking')>('@modules/booking');
  return {
    ...actual,
    bookingService: { createHold, createHoldWithDates, createTailorMadeRequest, addTraveler, listTravelers, getById },
  };
});

const { createGuestBookingAction } = await import('../src/app/(guest)/book/[departureId]/actions');
const { createGuestPackageBookingAction } = await import('../src/app/(guest)/book-package/[packageId]/actions');
const { createPlanMyTripRequestAction } = await import('../src/app/(guest)/plan-my-trip/actions');
const { addTravelerAction } = await import('../src/app/(guest)/booking/[bookingId]/travelers/new/actions');

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
    getUserByEmail.mockReset();
    createHold.mockReset();
    createHoldWithDates.mockReset();
    createTailorMadeRequest.mockReset();
    addTraveler.mockReset();
    listTravelers.mockReset();
    getById.mockReset();
    requireGuestContext.mockReset();
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

/**
 * DR-228 (explicit user request): a guest's browsing/booking language
 * should end up on their own User.preferredLocale, since that's the field
 * notify()/notifyEmail() (notifications module) read to pick which
 * language every automated booking/payment/visa email renders in --
 * previously nothing ever wrote it for a guest checkout, so it silently
 * stayed at the schema default (EN) regardless of what language the guest
 * actually browsed/booked in.
 */
describe('guest booking wizards snapshot the browsing locale onto preferredLocale (DR-228)', () => {
  beforeEach(() => {
    resolveSession.mockReset();
    updateProfile.mockReset();
    createHold.mockReset();
    createHoldWithDates.mockReset();
    createTailorMadeRequest.mockReset();
  });

  // cookiesMock is shared module-level state (vi.hoisted) read by every
  // other describe block's actions too via @lib/guest-locale's own
  // `cookies()` call -- mockReset() would strip its factory default with
  // nothing to put back, breaking later blocks that never touch it
  // themselves. Restore that default after this block's own overrides
  // instead of resetting it away.
  afterEach(() => {
    cookiesMock.mockResolvedValue({ get: () => undefined });
  });

  it('createGuestBookingAction persists FR when the locale cookie is fr', async () => {
    resolveSession.mockResolvedValue(GUEST_CTX);
    createHold.mockResolvedValue({ id: 'booking-fr-1' });
    cookiesMock.mockResolvedValue({ get: (key?: string) => (key === 'locale' ? { value: 'fr' } : undefined) });
    await createGuestBookingAction(
      '11111111-1111-4111-8111-111111111111',
      bookingFormData({ firstName: 'Real', lastName: 'Guest', seats: '1' }),
    );
    expect(updateProfile).toHaveBeenCalledWith(GUEST_CTX, expect.objectContaining({ preferredLocale: 'FR' }));
  });

  it('createGuestPackageBookingAction persists EN when the locale cookie is en', async () => {
    resolveSession.mockResolvedValue(GUEST_CTX);
    createHoldWithDates.mockResolvedValue({ id: 'booking-en-1' });
    cookiesMock.mockResolvedValue({ get: (key?: string) => (key === 'locale' ? { value: 'en' } : undefined) });
    await createGuestPackageBookingAction(
      '22222222-2222-4222-8222-222222222222',
      bookingFormData({ firstName: 'Real', lastName: 'Guest', startDate: '2026-09-01', seats: '1' }),
    );
    expect(updateProfile).toHaveBeenCalledWith(GUEST_CTX, expect.objectContaining({ preferredLocale: 'EN' }));
  });

  it('createPlanMyTripRequestAction persists FR when the locale cookie is fr', async () => {
    resolveSession.mockResolvedValue(GUEST_CTX);
    createTailorMadeRequest.mockResolvedValue({ id: 'booking-fr-2' });
    cookiesMock.mockResolvedValue({ get: (key?: string) => (key === 'locale' ? { value: 'fr' } : undefined) });
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
      email: 'real-fr@example.test',
      dialCode: '+264',
      localNumber: '811234567',
    });
    expect(updateProfile).toHaveBeenCalledWith(GUEST_CTX, expect.objectContaining({ preferredLocale: 'FR' }));
  });

  it('leaves preferredLocale unset when there is no recognizable locale cookie', async () => {
    resolveSession.mockResolvedValue(GUEST_CTX);
    createHold.mockResolvedValue({ id: 'booking-none-1' });
    cookiesMock.mockResolvedValue({ get: () => undefined });
    await createGuestBookingAction(
      '11111111-1111-4111-8111-111111111111',
      bookingFormData({ firstName: 'Real', lastName: 'Guest', seats: '1' }),
    );
    expect(updateProfile).toHaveBeenCalledWith(GUEST_CTX, expect.objectContaining({ preferredLocale: undefined }));
  });
});

/**
 * DR-140 (explicit user request, follow-up to DR-139): a guest shouldn't be
 * able to book/register a real staff account's email as their own contact
 * email. Checked against authService.getUserByEmail + isStaffRole -- only
 * blocks an email belonging to a real staff account (any non-TOURIST role),
 * never a returning guest re-using their own email.
 */
const STAFF_PUBLIC_USER = {
  id: 'staff-1',
  email: 'lam@polcotours.com',
  name: 'Lam',
  role: 'SUPERADMIN',
  roles: ['SUPERADMIN'],
  organizationId: 'org-1',
  emailVerified: true,
  phone: null,
  preferredLocale: 'EN',
  deletedAt: null,
  mustChangePassword: false,
  lastLoginAt: null,
  inactiveAt: null,
};

describe('guest booking wizards reject an email already belonging to a staff account (DR-140)', () => {
  beforeEach(() => {
    resolveSession.mockReset();
    getUserByEmail.mockReset();
    createTailorMadeRequest.mockReset();
    addTraveler.mockReset();
    listTravelers.mockReset();
    getById.mockReset();
    requireGuestContext.mockReset();
  });

  it('createPlanMyTripRequestAction rejects when the contact email belongs to a staff account', async () => {
    resolveSession.mockResolvedValue(GUEST_CTX);
    getUserByEmail.mockResolvedValue(STAFF_PUBLIC_USER);
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
      email: STAFF_PUBLIC_USER.email,
      dialCode: '+264',
      localNumber: '811234567',
    });
    expect(result).toEqual({ error: expect.stringContaining('already associated with an account') });
    expect(createTailorMadeRequest).not.toHaveBeenCalled();
  });

  it('createPlanMyTripRequestAction still proceeds for an email with no matching staff account', async () => {
    resolveSession.mockResolvedValue(GUEST_CTX);
    getUserByEmail.mockResolvedValue(null);
    createTailorMadeRequest.mockResolvedValue({ id: 'booking-6' });
    const result = await createPlanMyTripRequestAction({
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
      email: 'nobody@example.test',
      dialCode: '+264',
      localNumber: '811234567',
    });
    expect(result).toEqual({ bookingId: 'booking-6' });
  });

  it('addTravelerAction redirects with ?error=email_in_use when the tour lead email belongs to a staff account', async () => {
    requireGuestContext.mockResolvedValue(GUEST_CTX);
    getUserByEmail.mockResolvedValue(STAFF_PUBLIC_USER);
    const formData = bookingFormData({
      firstName: 'Hanna',
      lastName: 'Client',
      age: '30',
      sex: 'F',
      nationality: 'US',
      idOrPassportNumber: 'X123456',
      dialCode: '264',
      localNumber: '811234567',
      email: STAFF_PUBLIC_USER.email,
      countryOfResidence: 'US',
      isTourLead: 'on',
    });
    await expect(addTravelerAction('booking-7', formData)).rejects.toMatchObject({
      digest: expect.stringContaining('/booking/booking-7/travelers/new?error=email_in_use'),
    });
    expect(addTraveler).not.toHaveBeenCalled();
  });

  it('addTravelerAction still adds the traveler when the tour lead email matches no staff account', async () => {
    requireGuestContext.mockResolvedValue(GUEST_CTX);
    getUserByEmail.mockResolvedValue(null);
    addTraveler.mockResolvedValue({ id: 'traveler-1' });
    listTravelers.mockResolvedValue([{ id: 'traveler-1', isTourLead: true }]);
    getById.mockResolvedValue({ id: 'booking-8', seats: 2, requiresPassportUpload: false });
    const formData = bookingFormData({
      firstName: 'Real',
      lastName: 'Guest',
      age: '30',
      sex: 'F',
      nationality: 'US',
      idOrPassportNumber: 'X654321',
      dialCode: '264',
      localNumber: '811234567',
      email: 'nobody@example.test',
      countryOfResidence: 'US',
      isTourLead: 'on',
    });
    await expect(addTravelerAction('booking-8', formData)).rejects.toMatchObject({
      digest: expect.stringContaining('/booking/booking-8/travelers/new'),
    });
    expect(addTraveler).toHaveBeenCalledWith(GUEST_CTX, 'booking-8', expect.objectContaining({ email: 'nobody@example.test' }));
  });
});

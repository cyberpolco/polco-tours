import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Unit-level (fully mocked, no real DB) test for
 * ratingsService.runAutomaticRatingCodeIssuance (DR-261). Deliberately NOT a
 * DB-backed test like ratings-lookup.test.ts -- this function loops over
 * EVERY organization in the database and sends real notifications, so
 * running it for real against the shared seeded Lam org would risk exactly
 * the kind of unintended production side effect (a stray RatingCode issued
 * against a real booking, a real email sent) the CLAUDE.md gotcha on manual
 * verification scripts warns about.
 */
const listAllOrganizationIdsMock = vi.fn();
const findRatingCodeByBookingIdMock = vi.fn();
const createRatingCodeMock = vi.fn();
vi.mock('@modules/ratings/repository', () => ({
  ratingsRepository: {
    listAllOrganizationIds: (...args: unknown[]) => listAllOrganizationIdsMock(...args),
    findRatingCodeByBookingId: (...args: unknown[]) => findRatingCodeByBookingIdMock(...args),
    createRatingCode: (...args: unknown[]) => createRatingCodeMock(...args),
  },
}));

const listBookingsWithTourEndingOnMock = vi.fn();
const resolveGuestContactForBookingMock = vi.fn();
vi.mock('@modules/booking', () => ({
  bookingService: {
    listBookingsWithTourEndingOn: (...args: unknown[]) => listBookingsWithTourEndingOnMock(...args),
    resolveGuestContactForBooking: (...args: unknown[]) => resolveGuestContactForBookingMock(...args),
  },
}));

const notifyEmailMock = vi.fn();
const notifyMock = vi.fn();
vi.mock('@modules/notifications', () => ({
  notificationsService: {
    notifyEmail: (...args: unknown[]) => notifyEmailMock(...args),
    notify: (...args: unknown[]) => notifyMock(...args),
  },
}));

const auditMock = vi.fn();
vi.mock('@lib/audit', () => ({ audit: (...args: unknown[]) => auditMock(...args) }));

const { ratingsService } = await import('@modules/ratings');

function fixtureBooking(overrides: Record<string, unknown> = {}) {
  return {
    id: 'booking-1',
    organizationId: 'org-1',
    departureId: null,
    touristUserId: 'tourist-1',
    status: 'CONFIRMED',
    bookingReference: 'POL-2026-000001',
    customTravelEnd: new Date('2026-06-02T00:00:00Z'),
    ...overrides,
  };
}

function fixtureRatingCode(overrides: Record<string, unknown> = {}) {
  return {
    id: 'rc-1',
    organizationId: 'org-1',
    bookingId: 'booking-1',
    code: 'ABCDEFGH',
    issuedByUserId: null,
    issuedAt: new Date(),
    expiresAt: new Date(),
    usedAt: null,
    ...overrides,
  };
}

describe('ratingsService.runAutomaticRatingCodeIssuance (DR-261)', () => {
  beforeEach(() => {
    listAllOrganizationIdsMock.mockReset();
    findRatingCodeByBookingIdMock.mockReset();
    createRatingCodeMock.mockReset();
    listBookingsWithTourEndingOnMock.mockReset();
    resolveGuestContactForBookingMock.mockReset();
    notifyEmailMock.mockReset();
    notifyMock.mockReset();
    auditMock.mockReset();
  });

  it('issues a code and emails the tour lead for a due, unpaid booking -- bypasses the paid gate entirely', async () => {
    listAllOrganizationIdsMock.mockResolvedValue(['org-1']);
    listBookingsWithTourEndingOnMock.mockResolvedValue([fixtureBooking()]);
    findRatingCodeByBookingIdMock.mockResolvedValue(null);
    resolveGuestContactForBookingMock.mockResolvedValue({ email: 'lead@example.test', phone: null, locale: 'EN' });
    createRatingCodeMock.mockResolvedValue(fixtureRatingCode());

    const result = await ratingsService.runAutomaticRatingCodeIssuance();

    expect(result).toEqual({ organizationsSwept: 1, issuedCount: 1 });
    expect(createRatingCodeMock).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({ bookingId: 'booking-1', issuedByUserId: null }),
    );
    expect(notifyEmailMock).toHaveBeenCalledWith('RATING_CODE_ISSUED', 'lead@example.test', 'EN', 'org-1', {
      bookingId: 'POL-2026-000001',
      ratingCode: 'ABCDEFGH',
    });
    expect(notifyMock).not.toHaveBeenCalled();
    expect(auditMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'rating.code_issued', resourceType: 'RatingCode', metadata: { auto: true } }),
    );
    // No human actor for a system-issued code.
    expect(auditMock.mock.calls[0]?.[0].actorUserId).toBeUndefined();
  });

  it('skips a cancelled booking -- its tour is not happening', async () => {
    listAllOrganizationIdsMock.mockResolvedValue(['org-1']);
    listBookingsWithTourEndingOnMock.mockResolvedValue([fixtureBooking({ status: 'CANCELLED' })]);
    findRatingCodeByBookingIdMock.mockResolvedValue(null);

    const result = await ratingsService.runAutomaticRatingCodeIssuance();

    expect(result.issuedCount).toBe(0);
    expect(createRatingCodeMock).not.toHaveBeenCalled();
  });

  it('skips a refunded booking', async () => {
    listAllOrganizationIdsMock.mockResolvedValue(['org-1']);
    listBookingsWithTourEndingOnMock.mockResolvedValue([fixtureBooking({ status: 'REFUNDED' })]);
    findRatingCodeByBookingIdMock.mockResolvedValue(null);

    const result = await ratingsService.runAutomaticRatingCodeIssuance();

    expect(result.issuedCount).toBe(0);
    expect(createRatingCodeMock).not.toHaveBeenCalled();
  });

  it('skips a booking that already has a code issued', async () => {
    listAllOrganizationIdsMock.mockResolvedValue(['org-1']);
    listBookingsWithTourEndingOnMock.mockResolvedValue([fixtureBooking()]);
    findRatingCodeByBookingIdMock.mockResolvedValue(fixtureRatingCode({ issuedByUserId: 'staff-1' }));

    const result = await ratingsService.runAutomaticRatingCodeIssuance();

    expect(result.issuedCount).toBe(0);
    expect(createRatingCodeMock).not.toHaveBeenCalled();
  });

  it('continues past one booking throwing and still sums issuance across organizations', async () => {
    listAllOrganizationIdsMock.mockResolvedValue(['org-1', 'org-2']);
    listBookingsWithTourEndingOnMock.mockImplementation(async (organizationId: string) =>
      organizationId === 'org-1'
        ? [fixtureBooking({ id: 'booking-fail' })]
        : [fixtureBooking({ id: 'booking-2', organizationId: 'org-2' })],
    );
    findRatingCodeByBookingIdMock.mockImplementation(async (_organizationId: string, bookingId: string) => {
      if (bookingId === 'booking-fail') throw new Error('boom');
      return null;
    });
    resolveGuestContactForBookingMock.mockResolvedValue({ email: 'lead2@example.test', phone: null, locale: 'EN' });
    createRatingCodeMock.mockResolvedValue(fixtureRatingCode({ id: 'rc-2', organizationId: 'org-2', bookingId: 'booking-2', code: 'ZZZZZZZZ' }));

    const result = await ratingsService.runAutomaticRatingCodeIssuance();

    expect(result).toEqual({ organizationsSwept: 2, issuedCount: 1 });
    expect(createRatingCodeMock).toHaveBeenCalledTimes(1);
    expect(createRatingCodeMock).toHaveBeenCalledWith('org-2', expect.objectContaining({ bookingId: 'booking-2' }));
  });

  it('falls back to notify() when no contact email can be resolved', async () => {
    listAllOrganizationIdsMock.mockResolvedValue(['org-1']);
    listBookingsWithTourEndingOnMock.mockResolvedValue([fixtureBooking()]);
    findRatingCodeByBookingIdMock.mockResolvedValue(null);
    resolveGuestContactForBookingMock.mockResolvedValue({ email: null, phone: null, locale: 'EN' });
    createRatingCodeMock.mockResolvedValue(fixtureRatingCode());

    await ratingsService.runAutomaticRatingCodeIssuance();

    expect(notifyEmailMock).not.toHaveBeenCalled();
    expect(notifyMock).toHaveBeenCalledWith('RATING_CODE_ISSUED', 'tourist-1', 'org-1', {
      bookingId: 'POL-2026-000001',
      ratingCode: 'ABCDEFGH',
    });
  });
});

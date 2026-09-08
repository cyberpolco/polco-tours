import { describe, it, expect, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import type { AuthContext } from '../src/modules/auth';
import { settingsService } from '../src/modules/settings';
import { ApiError } from '../src/lib/errors';

/**
 * DR-198's LateBookingRate CRUD (settings module) had zero test coverage
 * anywhere -- settings.api.test.ts/settings.security.test.ts exercise
 * TaxRate/PlatformRate/Coupon in full but never touch late-booking-rates
 * (found by an architecture audit). Platform-wide, no organizationId/RLS,
 * same shape as TaxRate/PlatformRate -- so, unlike a tenant-scoped module,
 * this is a genuine service-layer unit test against the real DB with a
 * hand-built AuthContext, no session/route/withOrg needed.
 */
const admin = new PrismaClient();
const createdIds: string[] = [];

// Real DB writes here (createLateBookingRate audits via audit(), which
// writes AuditLog.actorUserId as a genuine @db.Uuid column) -- unlike a
// fully-mocked service test, a placeholder non-UUID string like 'staff-1'
// throws a raw Postgres UUID-parse error instead of the ApiError these
// tests are asserting on. Use real UUID-shaped fixture ids throughout.
const FAKE_STAFF_ID = '00000000-0000-4000-8000-000000000099';
const FAKE_ORG_ID = '00000000-0000-4000-8000-000000000098';
const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';

function ctxWith(roles: AuthContext['roles']): AuthContext {
  return {
    userId: FAKE_STAFF_ID,
    roles,
    permissions: new Set() as AuthContext['permissions'],
    organizationId: FAKE_ORG_ID,
    sessionId: 'session-1',
    mustChangePassword: false,
  };
}

const superadmin = ctxWith(['SUPERADMIN']);
const platformAdmin = ctxWith(['PLATFORM_ADMIN']);

afterAll(async () => {
  if (createdIds.length > 0) {
    await admin.lateBookingRate.deleteMany({ where: { id: { in: createdIds } } });
  }
  await admin.$disconnect();
});

describe('settingsService late-booking-rate CRUD (DR-198)', () => {
  it('a SUPERADMIN creates a late booking rate', async () => {
    const rate = await settingsService.createLateBookingRate(superadmin, { thresholdDays: 14, surchargeRateBp: 1500 });
    createdIds.push(rate.id);
    expect(rate.thresholdDays).toBe(14);
    expect(rate.surchargeRateBp).toBe(1500);
  });

  it('a PLATFORM_ADMIN cannot create one -- platform_settings.write is SUPERADMIN-only under DR-159', async () => {
    await expect(settingsService.createLateBookingRate(platformAdmin, { thresholdDays: 7, surchargeRateBp: 1000 })).rejects.toThrow();
  });

  it('a SUPERADMIN lists rates including the fixture', async () => {
    const rates = await settingsService.listLateBookingRates(superadmin);
    expect(rates.some((r) => createdIds.includes(r.id))).toBe(true);
  });

  it('a PLATFORM_ADMIN cannot even read the list -- platform_settings.read is also SUPERADMIN-only', async () => {
    await expect(settingsService.listLateBookingRates(platformAdmin)).rejects.toThrow();
  });

  it('a SUPERADMIN updates the rate in place (same row id, new values)', async () => {
    const id = createdIds[0]!;
    const updated = await settingsService.updateLateBookingRate(superadmin, id, { thresholdDays: 21, surchargeRateBp: 2000 });
    expect(updated.id).toBe(id);
    expect(updated.thresholdDays).toBe(21);
    expect(updated.surchargeRateBp).toBe(2000);
  });

  it('updating an unknown rate 404s (ApiError, not a raw Prisma error)', async () => {
    await expect(settingsService.updateLateBookingRate(superadmin, UNKNOWN_ID, { thresholdDays: 1, surchargeRateBp: 1 })).rejects.toThrow(
      ApiError,
    );
  });

  it('a SUPERADMIN deletes the rate, and deleting it again 404s', async () => {
    const id = createdIds.pop()!;
    await settingsService.deleteLateBookingRate(superadmin, id);
    await expect(settingsService.deleteLateBookingRate(superadmin, id)).rejects.toThrow(ApiError);
  });
});

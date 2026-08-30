import { describe, it, expect, afterAll } from 'vitest';
import { PrismaClient, type Role } from '@prisma/client';
import type { AuthContext } from '../src/modules/auth';
import { prisma } from '../src/lib/db';
import { cmsService } from '../src/modules/cms';

/**
 * CmsOperatingCountry (DR-202): the homepage "Where we operate" map's
 * staff-editable country list. Same fixture shape as
 * cms-media-item.service.test.ts -- no organizationId, so a hand-built
 * AuthContext is enough, no real login/session needed. Uses real African
 * country codes not seeded by prisma/seed.ts (KE, BW, GH) so this suite
 * never collides with the 4 production rows (NA/CD/ZM/ZW).
 */
const admin = new PrismaClient();

function fakeCtx(roles: Role[], permissions: string[] = []): AuthContext {
  return {
    userId: crypto.randomUUID(),
    roles,
    permissions: new Set(permissions) as AuthContext['permissions'],
    organizationId: null,
    sessionId: 'test-session',
    mustChangePassword: false,
  };
}

afterAll(async () => {
  await admin.cmsOperatingCountry.deleteMany({ where: { countryCode: { in: ['KE', 'BW', 'GH'] } } });
  await admin.$disconnect();
  await prisma.$disconnect();
});

describe('cmsService -- CmsOperatingCountry (RBAC-gated)', () => {
  const superadmin = fakeCtx(['SUPERADMIN']);
  const noPermission = fakeCtx(['PLATFORM_ADMIN']);
  const readOnly = fakeCtx(['PLATFORM_ADMIN'], ['cms.read']);

  it('SUPERADMIN can add a bare country, then fill in its snapshot facts', async () => {
    const created = await cmsService.createOperatingCountry(superadmin, { countryCode: 'KE', sortOrder: 0 });
    expect(created.countryCode).toBe('KE');
    expect(created.capital).toBe('');

    const updated = await cmsService.updateOperatingCountry(superadmin, created.id, { capital: 'Nairobi', currency: 'Kenyan Shilling (KES)' });
    expect(updated.capital).toBe('Nairobi');
    expect(updated.currency).toBe('Kenyan Shilling (KES)');
  });

  it('rejects adding the same country twice', async () => {
    await cmsService.createOperatingCountry(superadmin, { countryCode: 'BW', sortOrder: 1 });
    await expect(cmsService.createOperatingCountry(superadmin, { countryCode: 'BW', sortOrder: 2 })).rejects.toThrow();
  });

  it('listOperatingCountries returns rows ordered by sortOrder', async () => {
    const items = await cmsService.listOperatingCountries(superadmin);
    expect(items.length).toBeGreaterThan(0);
    for (let i = 1; i < items.length; i++) {
      expect(items[i]!.sortOrder).toBeGreaterThanOrEqual(items[i - 1]!.sortOrder);
    }
  });

  it('a context with no cms permission at all is denied on read and write', async () => {
    await expect(cmsService.listOperatingCountries(noPermission)).rejects.toThrow();
    await expect(cmsService.createOperatingCountry(noPermission, { countryCode: 'GH', sortOrder: 0 })).rejects.toThrow();
  });

  it('cms.read alone lets a non-SUPERADMIN read but not write', async () => {
    await expect(cmsService.listOperatingCountries(readOnly)).resolves.toBeDefined();
    await expect(cmsService.createOperatingCountry(readOnly, { countryCode: 'GH', sortOrder: 0 })).rejects.toThrow();
  });

  it('deletes a country', async () => {
    const created = await cmsService.createOperatingCountry(superadmin, { countryCode: 'GH', sortOrder: 2 });
    await cmsService.deleteOperatingCountry(superadmin, created.id);
    await expect(cmsService.updateOperatingCountry(superadmin, created.id, { capital: 'Accra' })).rejects.toThrow();
  });

  it('deleting a non-existent country throws not-found', async () => {
    await expect(cmsService.deleteOperatingCountry(superadmin, crypto.randomUUID())).rejects.toThrow();
  });
});

describe('cmsService -- CmsOperatingCountry public (no-ctx) read path', () => {
  it('listPublicOperatingCountries succeeds with no AuthContext argument at all', async () => {
    const result = await cmsService.listPublicOperatingCountries();
    expect(Array.isArray(result)).toBe(true);
  });
});

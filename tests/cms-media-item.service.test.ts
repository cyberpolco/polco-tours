import { describe, it, expect, afterAll } from 'vitest';
import { PrismaClient, type Role } from '@prisma/client';
import type { AuthContext } from '../src/modules/auth';
import { prisma } from '../src/lib/db';
import { cmsService } from '../src/modules/cms';

/**
 * CmsMediaItem's RBAC-gated CRUD (DR-163, first real consumer: Home hero).
 * Same fixture shape as cms.service.security.test.ts -- no organizationId,
 * so a hand-built AuthContext is enough, no real login/session needed.
 */
const admin = new PrismaClient();
const suffix = `${Date.now()}`;
const TEST_PAGE = `test-page-${suffix}`;

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
  await admin.cmsMediaItem.deleteMany({ where: { page: TEST_PAGE } });
  await admin.cmsTextBlock.deleteMany({ where: { key: { startsWith: `${TEST_PAGE}.` } } });
  await admin.$disconnect();
  await prisma.$disconnect();
});

describe('cmsService -- CmsMediaItem (RBAC-gated)', () => {
  const superadmin = fakeCtx(['SUPERADMIN']);
  const noPermission = fakeCtx(['PLATFORM_ADMIN']);
  const readOnly = fakeCtx(['PLATFORM_ADMIN'], ['cms.read']);

  it('SUPERADMIN can create a bare slide with no media chosen yet, then attach media', async () => {
    const created = await cmsService.createMediaItem(superadmin, TEST_PAGE, { sortOrder: 0 });
    expect(created.mediaType).toBeNull();
    expect(created.url).toBeNull();

    const updated = await cmsService.updateMediaItem(superadmin, TEST_PAGE, created.slotKey, {
      mediaType: 'image',
      url: 'https://example.com/a.webp',
    });
    expect(updated.mediaType).toBe('image');
    expect(updated.url).toBe('https://example.com/a.webp');
  });

  it('listMediaItems returns items ordered by sortOrder', async () => {
    const items = await cmsService.listMediaItems(superadmin, TEST_PAGE);
    expect(items.length).toBeGreaterThan(0);
    for (let i = 1; i < items.length; i++) {
      expect(items[i]!.sortOrder).toBeGreaterThanOrEqual(items[i - 1]!.sortOrder);
    }
  });

  it('a context with no cms permission at all is denied on read and write', async () => {
    await expect(cmsService.listMediaItems(noPermission, TEST_PAGE)).rejects.toThrow();
    await expect(cmsService.createMediaItem(noPermission, TEST_PAGE, { sortOrder: 0 })).rejects.toThrow();
  });

  it('cms.read alone lets a non-SUPERADMIN read but not write', async () => {
    await expect(cmsService.listMediaItems(readOnly, TEST_PAGE)).resolves.toBeDefined();
    await expect(cmsService.createMediaItem(readOnly, TEST_PAGE, { sortOrder: 0 })).rejects.toThrow();
  });

  it('deleteMediaItem also removes the paired text block across both locales', async () => {
    const created = await cmsService.createMediaItem(superadmin, TEST_PAGE, { sortOrder: 0 });
    await cmsService.updateTextBlock(superadmin, { key: `${TEST_PAGE}.${created.slotKey}`, locale: 'en', title: 'H', body: 'L' });
    await cmsService.updateTextBlock(superadmin, { key: `${TEST_PAGE}.${created.slotKey}`, locale: 'fr', title: 'H', body: 'L' });

    await cmsService.deleteMediaItem(superadmin, TEST_PAGE, created.slotKey);

    const enText = await cmsService.getTextBlock(superadmin, `${TEST_PAGE}.${created.slotKey}`, 'en');
    const frText = await cmsService.getTextBlock(superadmin, `${TEST_PAGE}.${created.slotKey}`, 'fr');
    expect(enText).toBeNull();
    expect(frText).toBeNull();
  });

  it('deleting a non-existent slide throws not-found', async () => {
    await expect(cmsService.deleteMediaItem(superadmin, TEST_PAGE, 'does-not-exist')).rejects.toThrow();
  });
});

import { describe, it, expect, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';

/**
 * CmsMediaItem (new in DR-162) has no repository/service method yet -- no
 * caller exists until a later phase wires a specific guest page (Home hero,
 * Gallery, etc.) to it. This test exercises the table directly via the raw
 * Prisma client, the same way cms.service.security.test.ts's own `afterAll`
 * cleanup does, purely to confirm the new table/constraints round-trip
 * correctly against the real shared Neon DB -- it will not pass until
 * `npm run db:push` has created `cms_media_items`.
 */
const admin = new PrismaClient();
const suffix = `${Date.now()}`;
const TEST_PAGE = `test-page-${suffix}`;

afterAll(async () => {
  await admin.cmsMediaItem.deleteMany({ where: { page: TEST_PAGE } });
  await admin.$disconnect();
});

describe('CmsMediaItem', () => {
  it('creates and reads back an image item with defaults applied', async () => {
    const created = await admin.cmsMediaItem.create({
      data: { page: TEST_PAGE, slotKey: 'slide-1', mediaType: 'image', url: 'https://example.com/a.webp' },
    });
    expect(created.sortOrder).toBe(0);
    expect(created.caption).toBeNull();

    const found = await admin.cmsMediaItem.findUnique({ where: { page_slotKey: { page: TEST_PAGE, slotKey: 'slide-1' } } });
    expect(found?.url).toBe('https://example.com/a.webp');
  });

  it('rejects a duplicate (page, slotKey) pair', async () => {
    await admin.cmsMediaItem.create({
      data: { page: TEST_PAGE, slotKey: 'slide-2', mediaType: 'video', url: 'https://example.com/b.mp4' },
    });
    await expect(
      admin.cmsMediaItem.create({
        data: { page: TEST_PAGE, slotKey: 'slide-2', mediaType: 'video', url: 'https://example.com/c.mp4' },
      }),
    ).rejects.toThrow();
  });
});

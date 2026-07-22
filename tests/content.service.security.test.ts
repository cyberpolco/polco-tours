import { describe, it, expect, afterAll } from 'vitest';
import { PrismaClient, type Role } from '@prisma/client';
import type { AuthContext } from '../src/modules/auth';
import { prisma } from '../src/lib/db';
import { contentService } from '../src/modules/content';

/**
 * Content module (DR-071) role-gate coverage, plus the one genuinely new
 * shape in this codebase: a public, no-ctx-at-all read path sitting
 * alongside an otherwise fully RBAC-gated service (every other module's
 * service methods all require an AuthContext argument).
 *
 * Neither SiteContent nor FaqEntry carries an organizationId (platform-wide,
 * same bucket as TaxRate/PlatformRate) and AuditLog.actorUserId has no FK
 * constraint (DR-032), so these fixtures need no real Organization/User rows
 * at all -- a hand-built AuthContext-shaped object is enough to drive
 * contentService directly, without a real login/session.
 */
const admin = new PrismaClient();
const suffix = `${Date.now()}`;
const TEST_KEY = `test-content-${suffix}`;
const TEST_QUESTION = `Test FAQ question ${suffix}?`;

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
  await admin.siteContent.deleteMany({ where: { key: TEST_KEY } });
  await admin.faqEntry.deleteMany({ where: { question: TEST_QUESTION } });
  await admin.$disconnect();
  await prisma.$disconnect();
});

describe('contentService -- staff (RBAC-gated) methods', () => {
  const superadmin = fakeCtx(['SUPERADMIN']);
  const noPermission = fakeCtx(['PLATFORM_ADMIN']);
  const readOnly = fakeCtx(['PLATFORM_ADMIN'], ['content.read']);
  // Simulates a SUPERADMIN having manually granted content.write via the
  // live permission-matrix editor -- same "route/permission passes, service
  // still rejects" case settings.security.test.ts covers for platform_settings.write.
  const writeGrantedButNotSuperadmin = fakeCtx(['PLATFORM_ADMIN'], ['content.read', 'content.write']);

  it('SUPERADMIN can write and read site content', async () => {
    const written = await contentService.updateSiteContent(superadmin, {
      key: TEST_KEY,
      locale: 'en',
      title: 'Test title',
      body: 'Test body',
    });
    expect(written.key).toBe(TEST_KEY);

    const read = await contentService.getSiteContent(superadmin, TEST_KEY, 'en');
    expect(read?.title).toBe('Test title');
  });

  it('SUPERADMIN can create, update, and delete a FAQ entry', async () => {
    const created = await contentService.createFaqEntry(superadmin, {
      question: TEST_QUESTION,
      answer: 'Test answer.',
      locale: 'en',
      sortOrder: 999,
    });
    expect(created.question).toBe(TEST_QUESTION);

    const updated = await contentService.updateFaqEntry(superadmin, created.id, { answer: 'Updated answer.' });
    expect(updated.answer).toBe('Updated answer.');

    await contentService.deleteFaqEntry(superadmin, created.id);
    await expect(contentService.updateFaqEntry(superadmin, created.id, { answer: 'x' })).rejects.toThrow();
  });

  it('a context with no content permission at all is denied on read and write', async () => {
    await expect(contentService.getSiteContent(noPermission, TEST_KEY, 'en')).rejects.toThrow();
    await expect(
      contentService.updateSiteContent(noPermission, { key: TEST_KEY, locale: 'en', title: 'x', body: 'y' }),
    ).rejects.toThrow();
  });

  it('content.read alone lets a non-SUPERADMIN read but not write', async () => {
    const read = await contentService.getSiteContent(readOnly, TEST_KEY, 'en');
    expect(read?.key).toBe(TEST_KEY);
    await expect(
      contentService.updateSiteContent(readOnly, { key: TEST_KEY, locale: 'en', title: 'x', body: 'y' }),
    ).rejects.toThrow();
  });

  it('holding content.write directly (bypassing the seed defaults) still does not bypass the SUPERADMIN-only role check', async () => {
    await expect(
      contentService.updateSiteContent(writeGrantedButNotSuperadmin, { key: TEST_KEY, locale: 'en', title: 'x', body: 'y' }),
    ).rejects.toThrow();
  });
});

describe('contentService -- public (no-ctx) read path', () => {
  it('getPublicSiteContent succeeds with no AuthContext argument at all', async () => {
    const result = await contentService.getPublicSiteContent(TEST_KEY, 'en');
    expect(result?.key).toBe(TEST_KEY);
  });

  it('listPublicFaqEntries succeeds with no AuthContext argument at all', async () => {
    await contentService.createFaqEntry(fakeCtx(['SUPERADMIN']), {
      question: TEST_QUESTION,
      answer: 'Public read test answer.',
      locale: 'en',
      sortOrder: 998,
    });
    const result = await contentService.listPublicFaqEntries('en');
    expect(result.some((f) => f.question === TEST_QUESTION)).toBe(true);
  });
});

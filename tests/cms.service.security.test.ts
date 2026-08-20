import { describe, it, expect, afterAll } from 'vitest';
import { PrismaClient, type Role } from '@prisma/client';
import type { AuthContext } from '../src/modules/auth';
import { prisma } from '../src/lib/db';
import { cmsService } from '../src/modules/cms';

/**
 * cms module (DR-071, module+permission renamed from `content` in DR-162)
 * role-gate coverage, plus the one genuinely new shape in this codebase: a
 * public, no-ctx-at-all read path sitting alongside an otherwise fully
 * RBAC-gated service (every other module's service methods all require an
 * AuthContext argument).
 *
 * Neither CmsTextBlock nor CmsFaqEntry carries an organizationId
 * (platform-wide, same bucket as TaxRate/PlatformRate) and
 * AuditLog.actorUserId has no FK constraint (DR-032), so these fixtures
 * need no real Organization/User rows at all -- a hand-built
 * AuthContext-shaped object is enough to drive cmsService directly, without
 * a real login/session.
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
  await admin.cmsTextBlock.deleteMany({ where: { key: TEST_KEY } });
  await admin.cmsFaqEntry.deleteMany({ where: { question: TEST_QUESTION } });
  await admin.$disconnect();
  await prisma.$disconnect();
});

describe('cmsService -- staff (RBAC-gated) methods', () => {
  const superadmin = fakeCtx(['SUPERADMIN']);
  const noPermission = fakeCtx(['PLATFORM_ADMIN']);
  const readOnly = fakeCtx(['PLATFORM_ADMIN'], ['cms.read']);
  // Simulates a SUPERADMIN having manually granted cms.write via the
  // live permission-matrix editor -- same "route/permission passes, service
  // still rejects" case settings.security.test.ts covers for platform_settings.write.
  const writeGrantedButNotSuperadmin = fakeCtx(['PLATFORM_ADMIN'], ['cms.read', 'cms.write']);

  it('SUPERADMIN can write and read a text block', async () => {
    const written = await cmsService.updateTextBlock(superadmin, {
      key: TEST_KEY,
      locale: 'en',
      title: 'Test title',
      body: 'Test body',
    });
    expect(written.key).toBe(TEST_KEY);

    const read = await cmsService.getTextBlock(superadmin, TEST_KEY, 'en');
    expect(read?.title).toBe('Test title');
  });

  it('SUPERADMIN can create, update, and delete a FAQ entry', async () => {
    const created = await cmsService.createFaqEntry(superadmin, {
      question: TEST_QUESTION,
      answer: 'Test answer.',
      locale: 'en',
      sortOrder: 999,
    });
    expect(created.question).toBe(TEST_QUESTION);

    const updated = await cmsService.updateFaqEntry(superadmin, created.id, { answer: 'Updated answer.' });
    expect(updated.answer).toBe('Updated answer.');

    await cmsService.deleteFaqEntry(superadmin, created.id);
    await expect(cmsService.updateFaqEntry(superadmin, created.id, { answer: 'x' })).rejects.toThrow();
  });

  it('a context with no cms permission at all is denied on read and write', async () => {
    await expect(cmsService.getTextBlock(noPermission, TEST_KEY, 'en')).rejects.toThrow();
    await expect(
      cmsService.updateTextBlock(noPermission, { key: TEST_KEY, locale: 'en', title: 'x', body: 'y' }),
    ).rejects.toThrow();
  });

  it('cms.read alone lets a non-SUPERADMIN read but not write', async () => {
    const read = await cmsService.getTextBlock(readOnly, TEST_KEY, 'en');
    expect(read?.key).toBe(TEST_KEY);
    await expect(
      cmsService.updateTextBlock(readOnly, { key: TEST_KEY, locale: 'en', title: 'x', body: 'y' }),
    ).rejects.toThrow();
  });

  it('holding cms.write directly (bypassing the seed defaults) still does not bypass the SUPERADMIN-only role check', async () => {
    await expect(
      cmsService.updateTextBlock(writeGrantedButNotSuperadmin, { key: TEST_KEY, locale: 'en', title: 'x', body: 'y' }),
    ).rejects.toThrow();
  });
});

describe('cmsService -- public (no-ctx) read path', () => {
  it('getPublicTextBlock succeeds with no AuthContext argument at all', async () => {
    const result = await cmsService.getPublicTextBlock(TEST_KEY, 'en');
    expect(result?.key).toBe(TEST_KEY);
  });

  it('listPublicFaqEntries succeeds with no AuthContext argument at all', async () => {
    await cmsService.createFaqEntry(fakeCtx(['SUPERADMIN']), {
      question: TEST_QUESTION,
      answer: 'Public read test answer.',
      locale: 'en',
      sortOrder: 998,
    });
    const result = await cmsService.listPublicFaqEntries('en');
    expect(result.some((f) => f.question === TEST_QUESTION)).toBe(true);
  });
});

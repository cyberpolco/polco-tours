import { describe, it, expect, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { hashPassword } from 'better-auth/crypto';
import { auth } from '../src/lib/auth';
import { prisma } from '../src/lib/db';
import { authRepository } from '../src/modules/auth/repository';

/**
 * DR-084: databaseHooks.session.create.before blocks sign-in for a dormant
 * (inactiveAt set) account. Same "exercise the real better-auth API, not a
 * raw Prisma write / loginAs()" precedent as
 * tests/auth-last-login-hook.test.ts -- the test-utils loginAs() helper
 * mints a Session directly and never touches this hook, so only a real
 * signInEmail call actually proves the block works.
 */
const admin = new PrismaClient();
const userIds: string[] = [];

afterAll(async () => {
  for (const id of userIds) await admin.user.delete({ where: { id } }).catch(() => {});
  await admin.$disconnect();
  await prisma.$disconnect();
});

// Email must be all-lowercase: better-auth's own signInEmail does a
// case-sensitive findUserByEmail lookup, and this helper writes the row
// directly via a plain Prisma client (bypassing any normalization
// better-auth's own signup path would otherwise apply) -- an uppercase
// role folded into the local part (e.g. "DRIVER") silently makes every
// sign-in attempt fail with "User not found" / INVALID_EMAIL_OR_PASSWORD,
// unrelated to (and masking) whatever the test actually means to check.
async function createSignInReadyUser(role: 'DRIVER' | 'SUPERADMIN', password: string) {
  const email = `dormancy-check-${role.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;
  const user = await admin.user.create({ data: { email, role, emailVerified: true } });
  userIds.push(user.id);
  await admin.account.create({
    data: { userId: user.id, providerId: 'credential', accountId: user.id, password: await hashPassword(password) },
  });
  return { id: user.id, email };
}

describe('databaseHooks.session.create.before (dormancy block)', () => {
  it('rejects sign-in for a dormant account with FORBIDDEN/ACCOUNT_INACTIVE, not just any rejection', async () => {
    const password = 'Dormancy-Check-Password-1!';
    const { id, email } = await createSignInReadyUser('DRIVER', password);
    await admin.user.update({ where: { id }, data: { inactiveAt: new Date() } });

    // Asserting the specific status/code (not just .rejects.toThrow()) is
    // deliberate -- a bare toThrow() would just as happily "pass" for an
    // unrelated failure (e.g. a credential-lookup bug), which is exactly
    // the false-positive this test previously had.
    await expect(auth.api.signInEmail({ body: { email, password } })).rejects.toMatchObject({
      status: 'FORBIDDEN',
      body: { code: 'ACCOUNT_INACTIVE' },
    });
  });

  it('allows sign-in for a non-dormant account, and reactivating clears the block', async () => {
    const password = 'Dormancy-Check-Password-2!';
    const { id, email } = await createSignInReadyUser('DRIVER', password);

    // Not dormant yet -- succeeds.
    await expect(auth.api.signInEmail({ body: { email, password } })).resolves.toBeDefined();

    // Mark dormant -- now blocked.
    await admin.user.update({ where: { id }, data: { inactiveAt: new Date() } });
    await expect(auth.api.signInEmail({ body: { email, password } })).rejects.toMatchObject({
      status: 'FORBIDDEN',
      body: { code: 'ACCOUNT_INACTIVE' },
    });

    // Reactivate -- unblocked again.
    await authRepository.reactivateUser(id);
    await expect(auth.api.signInEmail({ body: { email, password } })).resolves.toBeDefined();
  });
});

// authRepository.markDormantUsers is deliberately NOT integration-tested
// here: like fleetRepository.sweepInactivityAllOrganizations, it's a global
// updateMany with no org/user-id scoping parameter at all (by design, same
// "list orgs, sweep everything" shape) -- running it for real against the
// shared Neon DB would risk marking a genuinely-stale real staff account
// dormant as a side effect of this test suite. Its logic is fully covered
// by the pure isDormant unit test in tests/auth.domain.test.ts instead.

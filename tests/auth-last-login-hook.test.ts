import { describe, it, expect, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { hashPassword } from 'better-auth/crypto';
import { auth } from '../src/lib/auth';
import { prisma } from '../src/lib/db';

/**
 * "Under Users, let's also add last login" -- databaseHooks.session.create
 * .after (src/lib/auth.ts) writes User.lastLoginAt on every real sign-in.
 * Mirrors tests/auth-signup-hook.test.ts's precedent: exercise the real
 * better-auth API, not a raw Prisma write, since the hook only fires as
 * part of better-auth's own session-creation path -- the loginAs() test
 * helper other suites use mints a Session directly and never touches this
 * hook. signUpEmail alone doesn't reach it either (requireEmailVerification
 * is true, so auto-sign-in-on-signup is skipped) -- a real signInEmail call
 * against an already-verified, password-holding user is what actually
 * triggers session.create.after, same as scripts/set-staff-password.ts's
 * account-creation shape.
 */
const admin = new PrismaClient();
let userId: string | undefined;

afterAll(async () => {
  if (userId) await admin.user.delete({ where: { id: userId } }).catch(() => {});
  await admin.$disconnect();
  await prisma.$disconnect();
});

describe('databaseHooks.session.create.after (lastLoginAt tracking)', () => {
  it('sets User.lastLoginAt on a real signInEmail call', async () => {
    const email = `last-login-check-${Date.now()}@example.test`;
    const password = 'Last-Login-Check-Password-1!';

    const user = await admin.user.create({
      data: { email, role: 'DRIVER', emailVerified: true },
    });
    userId = user.id;
    expect(user.lastLoginAt).toBeNull();

    await admin.account.create({
      data: { userId: user.id, providerId: 'credential', accountId: user.id, password: await hashPassword(password) },
    });

    const before = new Date();
    await auth.api.signInEmail({ body: { email, password } });

    const updated = await admin.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updated.lastLoginAt).not.toBeNull();
    expect(updated.lastLoginAt!.getTime()).toBeGreaterThanOrEqual(before.getTime() - 5000);
  });
});

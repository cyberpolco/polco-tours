import { describe, it, expect, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { auth } from '../src/lib/auth';
import { prisma } from '../src/lib/db';

/**
 * DR-011: "New tourists auto-join the primary org (Lam) at signup via a
 * better-auth hook" (src/lib/auth.ts's databaseHooks.user.create.before).
 * Nothing had ever exercised a REAL auth.api.signUpEmail call before
 * e2e/staff-dashboard.spec.ts (DR-014, 2026-07-09) -- every other test
 * creates users directly via a raw PrismaClient, bypassing better-auth (and
 * this hook) entirely. That e2e test found the new user's organizationId
 * was null afterward; this test isolates and directly verifies the hook's
 * actual behavior against real Postgres.
 */
const admin = new PrismaClient();
let createdUserId: string | undefined;

afterAll(async () => {
  if (createdUserId) await admin.user.delete({ where: { id: createdUserId } }).catch(() => {});
  await admin.$disconnect();
  await prisma.$disconnect();
});

describe('databaseHooks.user.create.before (DR-011 auto-join primary org)', () => {
  it('sets organizationId to the primary org on a real signUpEmail call', async () => {
    const primary = await admin.organization.findFirstOrThrow({ where: { isPrimary: true } });
    const email = `hook-check-${Date.now()}@example.test`;

    const result = await auth.api.signUpEmail({
      body: { name: 'Hook Check', email, password: 'Hook-Check-Password-1!' },
    });
    createdUserId = result.user.id;

    const user = await admin.user.findUniqueOrThrow({ where: { id: result.user.id } });
    expect(user.organizationId).toBe(primary.id);
  });
});

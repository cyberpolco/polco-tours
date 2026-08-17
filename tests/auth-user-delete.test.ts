import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { authService, type AuthContext } from '@modules/auth';
import { prisma } from '../src/lib/db';

/**
 * DR-141 (explicit user request): a staff user can now be either
 * Deactivated (reversible via reactivateUser) or Deleted (permanent,
 * SUPERADMIN-only, reactivateUser refuses forever after). Exercises
 * authService.deleteUser/reactivateUser/deactivateUser directly, same
 * "real DB, hand-built AuthContext" shape as
 * tests/auth-find-or-create-tourist.test.ts -- the `users` table has no
 * RLS, so no withOrg is needed for these plain Prisma reads/writes.
 */
const admin = new PrismaClient();

let orgId: string;
const userIds: string[] = [];

function ctxFor(userId: string, roles: AuthContext['roles'], organizationId: string | null): AuthContext {
  return {
    userId,
    roles,
    permissions: new Set(roles.includes('SUPERADMIN') ? [] : ['admin.all']),
    organizationId,
    sessionId: 'session-fixture',
    mustChangePassword: false,
  };
}

async function createUser(role: 'DRIVER' | 'PLATFORM_ADMIN' | 'SUPERADMIN'): Promise<string> {
  const user = await admin.user.create({
    data: { email: `dr141-${role.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`, role, organizationId: orgId },
  });
  userIds.push(user.id);
  return user.id;
}

beforeAll(async () => {
  const org = await admin.organization.create({
    data: { name: `AUTH-USER-DELETE-TEST-${Date.now()}`, countries: ['NA'], status: 'VERIFIED' },
  });
  orgId = org.id;
});

afterAll(async () => {
  if (!orgId) {
    await admin.$disconnect();
    await prisma.$disconnect();
    return;
  }
  await admin.user.deleteMany({ where: { organizationId: orgId } });
  await admin.organization.delete({ where: { id: orgId } });
  await admin.$disconnect();
  await prisma.$disconnect();
});

describe('authService.deleteUser (DR-141)', () => {
  it('a SUPERADMIN permanently deletes a user -- deletedAt and deletedPermanently both set', async () => {
    const superadminId = await createUser('SUPERADMIN');
    const targetId = await createUser('DRIVER');
    await authService.deleteUser(ctxFor(superadminId, ['SUPERADMIN'], orgId), targetId);

    const row = await admin.user.findUniqueOrThrow({ where: { id: targetId } });
    expect(row.deletedAt).not.toBeNull();
    expect(row.deletedPermanently).toBe(true);
  });

  it('a PLATFORM_ADMIN (admin.all, but not SUPERADMIN) cannot delete a user', async () => {
    const platformAdminId = await createUser('PLATFORM_ADMIN');
    const targetId = await createUser('DRIVER');
    await expect(authService.deleteUser(ctxFor(platformAdminId, ['PLATFORM_ADMIN'], orgId), targetId)).rejects.toThrow();

    const row = await admin.user.findUniqueOrThrow({ where: { id: targetId } });
    expect(row.deletedAt).toBeNull();
  });

  it('a SUPERADMIN cannot delete their own account', async () => {
    const superadminId = await createUser('SUPERADMIN');
    await expect(authService.deleteUser(ctxFor(superadminId, ['SUPERADMIN'], orgId), superadminId)).rejects.toThrow();
  });

  it('deleting an unknown user throws', async () => {
    const superadminId = await createUser('SUPERADMIN');
    await expect(
      authService.deleteUser(ctxFor(superadminId, ['SUPERADMIN'], orgId), '00000000-0000-0000-0000-000000000000'),
    ).rejects.toThrow();
  });

  it('deleting an already-deleted user throws rather than re-running', async () => {
    const superadminId = await createUser('SUPERADMIN');
    const targetId = await createUser('DRIVER');
    await authService.deleteUser(ctxFor(superadminId, ['SUPERADMIN'], orgId), targetId);
    await expect(authService.deleteUser(ctxFor(superadminId, ['SUPERADMIN'], orgId), targetId)).rejects.toThrow();
  });
});

describe('authService.reactivateUser now also undoes a plain Deactivate (DR-141)', () => {
  it('reactivates a Deactivated (not Deleted) user -- clears deletedAt', async () => {
    const superadminId = await createUser('SUPERADMIN');
    const targetId = await createUser('DRIVER');
    await authService.deactivateUser(ctxFor(superadminId, ['SUPERADMIN'], orgId), targetId);
    let row = await admin.user.findUniqueOrThrow({ where: { id: targetId } });
    expect(row.deletedAt).not.toBeNull();

    await authService.reactivateUser(ctxFor(superadminId, ['SUPERADMIN'], orgId), targetId);
    row = await admin.user.findUniqueOrThrow({ where: { id: targetId } });
    expect(row.deletedAt).toBeNull();
  });

  it('refuses to reactivate a permanently Deleted user', async () => {
    const superadminId = await createUser('SUPERADMIN');
    const targetId = await createUser('DRIVER');
    await authService.deleteUser(ctxFor(superadminId, ['SUPERADMIN'], orgId), targetId);

    await expect(authService.reactivateUser(ctxFor(superadminId, ['SUPERADMIN'], orgId), targetId)).rejects.toThrow();

    const row = await admin.user.findUniqueOrThrow({ where: { id: targetId } });
    expect(row.deletedAt).not.toBeNull();
    expect(row.deletedPermanently).toBe(true);
  });
});

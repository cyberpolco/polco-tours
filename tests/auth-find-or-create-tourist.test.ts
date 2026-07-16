import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { authService, type AuthContext } from '@modules/auth';
import { prisma } from '../src/lib/db';

/**
 * DR-036: staff creating a booking for a client no longer requires that
 * client to already have an account -- clients never sign up (DR-016), so
 * that constraint was inconsistent with the rest of the app. Verifies
 * authService.findOrCreateTouristByEmail's two real behaviors: creating a
 * login-less TOURIST row on first use, and reusing the same row for a
 * repeat client instead of erroring on the unique email constraint.
 */
const admin = new PrismaClient();

let orgId: string;

const ctxFor = (organizationId: string | null): AuthContext => ({
  userId: 'staff-fixture',
  roles: ['TOUR_OPERATOR'],
  permissions: new Set(),
  organizationId,
  sessionId: 'session-fixture',
  mustChangePassword: false,
});

beforeAll(async () => {
  const org = await admin.organization.create({
    data: { name: `FIND-OR-CREATE-TOURIST-TEST-${Date.now()}`, countries: ['NA'], status: 'VERIFIED' },
  });
  orgId = org.id;
});

afterAll(async () => {
  if (orgId) {
    await admin.user.deleteMany({ where: { organizationId: orgId } });
    await admin.organization.delete({ where: { id: orgId } });
  }
  await admin.$disconnect();
  await prisma.$disconnect();
});

describe('authService.findOrCreateTouristByEmail', () => {
  it('creates a login-less TOURIST user when no account exists for that email', async () => {
    const email = `client-${Date.now()}@example.test`;
    const user = await authService.findOrCreateTouristByEmail(ctxFor(orgId), email);

    expect(user.email).toBe(email);
    expect(user.role).toBe('TOURIST');
    expect(user.organizationId).toBe(orgId);

    const account = await admin.account.findFirst({ where: { userId: user.id } });
    expect(account).toBeNull();
  });

  it('reuses the same user on a second booking for the same client email', async () => {
    const email = `repeat-client-${Date.now()}@example.test`;
    const first = await authService.findOrCreateTouristByEmail(ctxFor(orgId), email);
    const second = await authService.findOrCreateTouristByEmail(ctxFor(orgId), email);

    expect(second.id).toBe(first.id);
  });

  it('throws forbidden when the caller has no organization membership', async () => {
    const email = `no-org-${Date.now()}@example.test`;
    await expect(authService.findOrCreateTouristByEmail(ctxFor(null), email)).rejects.toThrow();
  });
});

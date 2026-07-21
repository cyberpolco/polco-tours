import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { authService, type AuthContext } from '@modules/auth';
import { prisma } from '../src/lib/db';

/**
 * Follow-up to DR-036: staff-created client contact records (bare TOURIST
 * users, never login-capable) get their own "Clients" directory
 * (SUPERADMIN/TOUR_OPERATOR-only), separate from the "Users" staff
 * management page -- neither should show the other's rows.
 */
const admin = new PrismaClient();

let orgId: string;
let touristId: string;
let operatorId: string;

function ctxFor(roles: AuthContext['roles']): AuthContext {
  return {
    userId: 'staff-fixture',
    roles,
    permissions: new Set(['admin.all', 'booking.create']),
    organizationId: orgId,
    sessionId: 'session-fixture',
    mustChangePassword: false,
  };
}

beforeAll(async () => {
  const org = await admin.organization.create({
    data: { name: `CLIENTS-DIRECTORY-TEST-${Date.now()}`, countries: ['NA'], status: 'VERIFIED' },
  });
  orgId = org.id;

  const [tourist, operator] = await Promise.all([
    admin.user.create({ data: { email: `client-${Date.now()}@example.test`, role: 'TOURIST', organizationId: orgId } }),
    admin.user.create({ data: { email: `op-${Date.now()}@example.test`, role: 'TOUR_OPERATOR', organizationId: orgId } }),
  ]);
  touristId = tourist.id;
  operatorId = operator.id;
});

afterAll(async () => {
  if (orgId) {
    await admin.user.deleteMany({ where: { organizationId: orgId } });
    await admin.organization.delete({ where: { id: orgId } });
  }
  await admin.$disconnect();
  await prisma.$disconnect();
});

describe('authService.listClients / listUsers split', () => {
  it('listClients returns only TOURIST records, not staff', async () => {
    const clients = await authService.listClients(ctxFor(['TOUR_OPERATOR']));
    const ids = clients.map((c) => c.id);
    expect(ids).toContain(touristId);
    expect(ids).not.toContain(operatorId);
  });

  it('listUsers returns only staff records, not TOURIST clients', async () => {
    const users = await authService.listUsers(ctxFor(['SUPERADMIN']));
    const ids = users.map((u) => u.id);
    expect(ids).toContain(operatorId);
    expect(ids).not.toContain(touristId);
  });

  it('listClients rejects a role that is neither SUPERADMIN nor TOUR_OPERATOR (PLATFORM_ADMIN included)', async () => {
    await expect(authService.listClients(ctxFor(['PLATFORM_ADMIN']))).rejects.toThrow();
  });
});

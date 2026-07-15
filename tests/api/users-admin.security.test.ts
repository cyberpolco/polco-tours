import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { prisma, withOrg } from '../../src/lib/db';
import { loginAs } from '../helpers/test-auth';

const { GET: listUsers, POST: createUser } = await import('../../src/app/api/v1/users/route');
const { DELETE: deactivateUser } = await import('../../src/app/api/v1/users/[userId]/route');

/**
 * DR-026: only SUPERADMIN/PLATFORM_ADMIN (admin.all, via '*') may reach any
 * of the three /users* admin routes -- every other role must 403, same
 * convention as tests/api/visa.security.test.ts's permission-boundary check.
 */
const admin = new PrismaClient();

let orgId: string;
let touristId: string;
let operatorId: string;
let targetId: string;

function jsonRequest(url: string, headers: Headers, method: string, body?: unknown): NextRequest {
  const h = new Headers(headers);
  if (body !== undefined) h.set('Content-Type', 'application/json');
  return new NextRequest(url, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
}

beforeAll(async () => {
  const org = await admin.organization.create({
    data: { name: `USERS-ADMIN-SEC-TEST-${Date.now()}`, countries: ['NA'], status: 'VERIFIED' },
  });
  orgId = org.id;

  const [tourist, operator, target] = await Promise.all([
    admin.user.create({ data: { email: `t-${Date.now()}@example.test`, role: 'TOURIST', organizationId: orgId } }),
    admin.user.create({ data: { email: `op-${Date.now()}@example.test`, role: 'TOUR_OPERATOR', organizationId: orgId } }),
    admin.user.create({ data: { email: `target-${Date.now()}@example.test`, role: 'DRIVER', organizationId: orgId } }),
  ]);
  touristId = tourist.id;
  operatorId = operator.id;
  targetId = target.id;
});

afterAll(async () => {
  await withOrg(orgId, (tx) => tx.auditLog.deleteMany({ where: { organizationId: orgId } }));
  await admin.user.deleteMany({ where: { organizationId: orgId } });
  await admin.organization.delete({ where: { id: orgId } });
  await admin.$disconnect();
  await prisma.$disconnect();
});

describe('anti-BOLA: only admin.all may reach /users* (DR-026)', () => {
  it('a TOURIST gets 403 on list/create/deactivate', async () => {
    const headers = await loginAs(touristId);
    const listRes = await listUsers(new NextRequest('http://localhost/api/v1/users', { headers }), {
      params: Promise.resolve({}),
    });
    expect(listRes.status).toBe(403);

    const createRes = await createUser(
      jsonRequest('http://localhost/api/v1/users', headers, 'POST', { name: 'X', email: 'x@example.test', roles: ['DRIVER'] }),
      { params: Promise.resolve({}) },
    );
    expect(createRes.status).toBe(403);

    const deactivateRes = await deactivateUser(
      new NextRequest(`http://localhost/api/v1/users/${targetId}`, { method: 'DELETE', headers }),
      { params: Promise.resolve({ userId: targetId }) },
    );
    expect(deactivateRes.status).toBe(403);
  });

  it('a TOUR_OPERATOR (no admin.all) also gets 403 on all three routes', async () => {
    const headers = await loginAs(operatorId);
    const listRes = await listUsers(new NextRequest('http://localhost/api/v1/users', { headers }), {
      params: Promise.resolve({}),
    });
    expect(listRes.status).toBe(403);

    const createRes = await createUser(
      jsonRequest('http://localhost/api/v1/users', headers, 'POST', { name: 'X', email: 'x2@example.test', roles: ['DRIVER'] }),
      { params: Promise.resolve({}) },
    );
    expect(createRes.status).toBe(403);

    const deactivateRes = await deactivateUser(
      new NextRequest(`http://localhost/api/v1/users/${targetId}`, { method: 'DELETE', headers }),
      { params: Promise.resolve({ userId: targetId }) },
    );
    expect(deactivateRes.status).toBe(403);
  });
});

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { prisma, withOrg } from '../../src/lib/db';
import { loginAs } from '../helpers/test-auth';

const { GET: listUsers, POST: createUser } = await import('../../src/app/api/v1/users/route');
const { DELETE: deactivateUser } = await import('../../src/app/api/v1/users/[userId]/route');
const { PATCH: updateProfile } = await import('../../src/app/api/v1/users/me/route');

/** DR-026: admin user-management routes -- distinct from tests/api/users.api.test.ts, which covers the self-service /users/me route. */
const admin = new PrismaClient();

let orgId: string;
let superadminId: string;
let createdUserId: string;

function jsonRequest(url: string, headers: Headers, method: string, body?: unknown): NextRequest {
  const h = new Headers(headers);
  if (body !== undefined) h.set('Content-Type', 'application/json');
  return new NextRequest(url, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
}

beforeAll(async () => {
  const org = await admin.organization.create({
    data: { name: `USERS-ADMIN-API-TEST-${Date.now()}`, countries: ['NA', 'CD'], status: 'VERIFIED' },
  });
  orgId = org.id;

  const superadmin = await admin.user.create({
    data: { email: `sa-${Date.now()}@example.test`, role: 'SUPERADMIN', organizationId: orgId },
  });
  superadminId = superadmin.id;
});

afterAll(async () => {
  // Guard: if beforeAll failed before orgId was assigned, Prisma silently
  // drops the undefined where-clause value, turning these into unscoped
  // deleteMany calls that wipe the whole table -- this has hit real
  // production data twice. Skip cleanup entirely rather than risk it.
  if (!orgId) {
    await admin.$disconnect();
    await prisma.$disconnect();
    return;
  }
  await withOrg(orgId, (tx) => tx.membership.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.auditLog.deleteMany({ where: { organizationId: orgId } }));
  await admin.user.deleteMany({ where: { organizationId: orgId } });
  await admin.organization.delete({ where: { id: orgId } });
  await admin.$disconnect();
  await prisma.$disconnect();
});

describe('POST /api/v1/users', () => {
  it('a SUPERADMIN creates a user with multiple roles, returning a one-time password (201)', async () => {
    const headers = await loginAs(superadminId);
    const email = `multi-${Date.now()}@example.test`;
    const req = jsonRequest('http://localhost/api/v1/users', headers, 'POST', {
      name: 'Multi Role',
      email,
      phone: '+264812345678',
      roles: ['DRIVER', 'TOUR_GUIDE'],
    });
    const res = await createUser(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.user.email).toBe(email);
    expect(body.user.roles.sort()).toEqual(['DRIVER', 'TOUR_GUIDE']);
    expect(body.user.mustChangePassword).toBe(true);
    expect(typeof body.temporaryPassword).toBe('string');
    expect(body.temporaryPassword.length).toBeGreaterThanOrEqual(16);
    createdUserId = body.user.id;

    const memberships = await withOrg(orgId, (tx) => tx.membership.findMany({ where: { userId: createdUserId } }));
    expect(memberships.map((m) => m.role).sort()).toEqual(['DRIVER', 'TOUR_GUIDE']);
  }, 60_000); // createUser is several sequential DB round-trips (signUpEmail, finalize, memberships, audit, re-fetch); this sandbox's Neon latency can exceed the 20s default

  it('rejects creating a user with an already-used email (409)', async () => {
    const headers = await loginAs(superadminId);
    const existing = await admin.user.findUniqueOrThrow({ where: { id: createdUserId } });
    const req = jsonRequest('http://localhost/api/v1/users', headers, 'POST', {
      name: 'Dup',
      email: existing.email,
      roles: ['DRIVER'],
    });
    const res = await createUser(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(409);
  });

  it('rejects an empty roles array (422)', async () => {
    const headers = await loginAs(superadminId);
    const req = jsonRequest('http://localhost/api/v1/users', headers, 'POST', {
      name: 'No Roles',
      email: `noroles-${Date.now()}@example.test`,
      roles: [],
    });
    const res = await createUser(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(422);
  });

  it('a non-admin cannot create a user (403)', async () => {
    const driver = await admin.user.create({
      data: { email: `driver-${Date.now()}@example.test`, role: 'DRIVER', organizationId: orgId },
    });
    const headers = await loginAs(driver.id);
    const req = jsonRequest('http://localhost/api/v1/users', headers, 'POST', {
      name: 'X',
      email: `x-${Date.now()}@example.test`,
      roles: ['DRIVER'],
    });
    const res = await createUser(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(403);
  });
});

describe('GET /api/v1/users', () => {
  it('a SUPERADMIN lists every user in the org (200)', async () => {
    const headers = await loginAs(superadminId);
    const req = new NextRequest('http://localhost/api/v1/users', { headers });
    const res = await listUsers(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.users.map((u: { id: string }) => u.id)).toContain(createdUserId);
  });
});

describe('DELETE /api/v1/users/:userId', () => {
  it('a SUPERADMIN cannot deactivate their own account (409)', async () => {
    const headers = await loginAs(superadminId);
    const req = new NextRequest(`http://localhost/api/v1/users/${superadminId}`, { method: 'DELETE', headers });
    const res = await deactivateUser(req, { params: Promise.resolve({ userId: superadminId }) });
    expect(res.status).toBe(409);
  });

  it('a SUPERADMIN deactivates another user (204)', async () => {
    const headers = await loginAs(superadminId);
    const req = new NextRequest(`http://localhost/api/v1/users/${createdUserId}`, { method: 'DELETE', headers });
    const res = await deactivateUser(req, { params: Promise.resolve({ userId: createdUserId }) });
    expect(res.status).toBe(204);

    const updated = await admin.user.findUniqueOrThrow({ where: { id: createdUserId } });
    expect(updated.deletedAt).not.toBeNull();
  });

  it('a deactivated user is immediately treated as unauthenticated (401)', async () => {
    const headers = await loginAs(createdUserId);
    const req = jsonRequest('http://localhost/api/v1/users/me', headers, 'PATCH', { name: 'Still trying' });
    const res = await updateProfile(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(401);
  });

  it('deactivating an unknown user 404s', async () => {
    const headers = await loginAs(superadminId);
    const req = new NextRequest('http://localhost/api/v1/users/00000000-0000-0000-0000-000000000000', {
      method: 'DELETE',
      headers,
    });
    const res = await deactivateUser(req, { params: Promise.resolve({ userId: '00000000-0000-0000-0000-000000000000' }) });
    expect(res.status).toBe(404);
  });
});

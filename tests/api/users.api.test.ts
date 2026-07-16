import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { prisma } from '../../src/lib/db';
import { loginAs } from '../helpers/test-auth';
import { PATCH as updateProfile } from '../../src/app/api/v1/users/me/route';

/**
 * First "no target id" route in the repo (DR-013) -- ctx.userId is always
 * the subject. Same route-handler-level pattern as tests/api/bookings.api.test.ts.
 */
const admin = new PrismaClient();

let orgId: string;
let touristId: string;

function jsonRequest(headers: Headers, body: unknown): NextRequest {
  const h = new Headers(headers);
  h.set('Content-Type', 'application/json');
  return new NextRequest('http://localhost/api/v1/users/me', { method: 'PATCH', headers: h, body: JSON.stringify(body) });
}

beforeAll(async () => {
  const org = await admin.organization.create({
    data: { name: `USERS-API-TEST-${Date.now()}`, countries: ['NA'], status: 'VERIFIED' },
  });
  orgId = org.id;

  const tourist = await admin.user.create({
    data: { email: `profile-a-${Date.now()}@example.test`, role: 'TOURIST', organizationId: orgId },
  });
  touristId = tourist.id;
});

afterAll(async () => {
  // Guard: if beforeAll failed before orgId was assigned, Prisma silently
  // drops the undefined where-clause value, turning this into an unscoped
  // deleteMany that wipes the whole table -- this has hit real production
  // data twice. Skip cleanup entirely rather than risk it.
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

describe('PATCH /api/v1/users/me', () => {
  it('lets a tourist set their own phone + preferredLocale (200)', async () => {
    const headers = await loginAs(touristId);
    const req = jsonRequest(headers, { phone: '+15551234567', preferredLocale: 'FR' });
    const res = await updateProfile(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.phone).toBe('+15551234567');
    expect(body.user.preferredLocale).toBe('FR');
  });

  it('rejects a non-E.164 phone (422)', async () => {
    const headers = await loginAs(touristId);
    const req = jsonRequest(headers, { phone: 'not-a-phone-number' });
    const res = await updateProfile(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(422);
  });
});

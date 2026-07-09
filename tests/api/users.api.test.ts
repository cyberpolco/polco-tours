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
let officerId: string;

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

  const [tourist, officer] = await Promise.all([
    admin.user.create({ data: { email: `profile-a-${Date.now()}@example.test`, role: 'TOURIST', organizationId: orgId } }),
    admin.user.create({ data: { email: `profile-b-${Date.now()}@example.test`, role: 'IMMIGRATION_OFFICER', organizationId: orgId } }),
  ]);
  touristId = tourist.id;
  officerId = officer.id;
});

afterAll(async () => {
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

  it('denies IMMIGRATION_OFFICER (403 -- strictly read-only, BR-10)', async () => {
    const headers = await loginAs(officerId);
    const req = jsonRequest(headers, { phone: '+15559876543' });
    const res = await updateProfile(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(403);
  });
});

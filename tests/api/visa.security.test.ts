import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { prisma, withOrg } from '../../src/lib/db';
import { loginAs } from '../helpers/test-auth';
import { generateConfirmationCode } from '../../src/modules/booking';
import { GET as listForCountry } from '../../src/app/api/v1/immigration/visa-applications/route';

/**
 * BR-10 country-scoping is the actual security boundary this increment adds
 * beyond RLS (which only isolates by organizationId) -- an officer assigned
 * to one country must never see a different country's applicants, even
 * though both live in the same organization/tenant.
 */
const admin = new PrismaClient();

let orgId: string;
let officerNAId: string;
let officerCDId: string;
let naPassportNumber: string;
let cdPassportNumber: string;

async function seedApplication(country: string, passportNumber: string, orgIdArg: string, touristId: string) {
  return withOrg(orgIdArg, async (tx) => {
    const pkg = await tx.tourPackage.create({
      data: {
        organizationId: orgIdArg,
        title: `Visa Security Fixture ${country}`,
        description: 'Fixture for visa anti-BOLA tests.',
        country,
        priceMinor: 10000,
        currency: 'USD',
        status: 'PUBLISHED',
      },
    });
    const departure = await tx.departure.create({
      data: { organizationId: orgIdArg, tourPackageId: pkg.id, startDate: new Date('2026-09-01'), capacity: 1, status: 'SCHEDULED' },
    });
    const booking = await tx.booking.create({
      data: {
        organizationId: orgIdArg,
        departureId: departure.id,
        touristUserId: touristId,
        confirmationCode: generateConfirmationCode(),
        seats: 1,
        priceMinor: 10000,
        currency: 'USD',
      },
    });
    const traveler = await tx.traveler.create({
      data: {
        organizationId: orgIdArg,
        bookingId: booking.id,
        firstName: 'Sec',
        lastName: country,
        age: 30,
        sex: 'F',
        nationality: 'ZA',
        idOrPassportNumber: passportNumber,
        isTourLead: true,
      },
    });
    await tx.visaApplication.create({
      data: {
        organizationId: orgIdArg,
        travelerId: traveler.id,
        country,
        travelerFirstName: traveler.firstName,
        travelerLastName: traveler.lastName,
        travelerNationality: traveler.nationality,
        travelerIdOrPassportNumber: passportNumber,
      },
    });
  });
}

beforeAll(async () => {
  const org = await admin.organization.create({
    data: { name: `VISA-SEC-TEST-${Date.now()}`, countries: ['NA', 'CD'], status: 'VERIFIED' },
  });
  orgId = org.id;

  const [tourist, officerNA, officerCD] = await Promise.all([
    admin.user.create({ data: { email: `t-${Date.now()}@example.test`, role: 'TOURIST', organizationId: orgId } }),
    admin.user.create({
      data: { email: `io-na-${Date.now()}@example.test`, role: 'IMMIGRATION_OFFICER', organizationId: orgId, assignedCountry: 'NA' },
    }),
    admin.user.create({
      data: { email: `io-cd-${Date.now()}@example.test`, role: 'IMMIGRATION_OFFICER', organizationId: orgId, assignedCountry: 'CD' },
    }),
  ]);
  officerNAId = officerNA.id;
  officerCDId = officerCD.id;

  naPassportNumber = `NA-PASS-${Date.now()}`;
  cdPassportNumber = `CD-PASS-${Date.now()}`;
  await seedApplication('NA', naPassportNumber, orgId, tourist.id);
  await seedApplication('CD', cdPassportNumber, orgId, tourist.id);
});

afterAll(async () => {
  await withOrg(orgId, (tx) => tx.visaApplication.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.traveler.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.booking.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.departure.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.tourPackage.deleteMany({ where: { organizationId: orgId } }));
  await admin.user.deleteMany({ where: { organizationId: orgId } });
  await admin.organization.delete({ where: { id: orgId } });
  await admin.$disconnect();
  await prisma.$disconnect();
});

describe('anti-BOLA: BR-10 country-scoping for IMMIGRATION_OFFICER', () => {
  it('an officer assigned to NA sees only the NA-bound application', async () => {
    const headers = await loginAs(officerNAId);
    const req = new NextRequest('http://localhost/api/v1/immigration/visa-applications', { headers });
    const res = await listForCountry(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(200);
    const body = await res.json();
    const numbers = body.applications.map((a: { travelerIdOrPassportNumber: string }) => a.travelerIdOrPassportNumber);
    expect(numbers).toContain(naPassportNumber);
    expect(numbers).not.toContain(cdPassportNumber);
  });

  it('an officer assigned to CD sees only the CD-bound application', async () => {
    const headers = await loginAs(officerCDId);
    const req = new NextRequest('http://localhost/api/v1/immigration/visa-applications', { headers });
    const res = await listForCountry(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(200);
    const body = await res.json();
    const numbers = body.applications.map((a: { travelerIdOrPassportNumber: string }) => a.travelerIdOrPassportNumber);
    expect(numbers).toContain(cdPassportNumber);
    expect(numbers).not.toContain(naPassportNumber);
  });

  it("an officer's own ?country= query param is ignored -- they cannot widen their scope", async () => {
    const headers = await loginAs(officerNAId);
    const req = new NextRequest('http://localhost/api/v1/immigration/visa-applications?country=CD', { headers });
    const res = await listForCountry(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(200);
    const body = await res.json();
    const numbers = body.applications.map((a: { travelerIdOrPassportNumber: string }) => a.travelerIdOrPassportNumber);
    expect(numbers).not.toContain(cdPassportNumber);
    expect(numbers).toContain(naPassportNumber);
  });
});

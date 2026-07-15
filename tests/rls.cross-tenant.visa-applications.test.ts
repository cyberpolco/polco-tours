import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { withOrg, prisma } from '../src/lib/db';
import { generateConfirmationCode } from '../src/modules/booking';

/** Extends the RLS proof to the `visa_applications` table added in DR-019. */
const admin = new PrismaClient();

let orgA: string;
let orgB: string;

async function seedOrgWithVisaApplication(name: string): Promise<string> {
  const org = await admin.organization.create({ data: { name, countries: ['NA'], status: 'VERIFIED' } });
  const tourist = await admin.user.create({ data: { email: `${name.toLowerCase()}@example.test`, role: 'TOURIST', organizationId: org.id } });

  await withOrg(org.id, async (tx) => {
    const pkg = await tx.tourPackage.create({
      data: {
        organizationId: org.id,
        title: 'RLS Visa Fixture Safari',
        description: 'Fixture for visa RLS tests.',
        country: 'NA',
        priceMinor: 10000,
        currency: 'USD',
        status: 'PUBLISHED',
      },
    });
    const departure = await tx.departure.create({
      data: { organizationId: org.id, tourPackageId: pkg.id, startDate: new Date('2026-09-01'), capacity: 1, status: 'SCHEDULED' },
    });
    const booking = await tx.booking.create({
      data: {
        organizationId: org.id,
        departureId: departure.id,
        touristUserId: tourist.id,
        confirmationCode: generateConfirmationCode(),
        bookingReference: generateConfirmationCode(),
        seats: 1,
        priceMinor: 10000,
        currency: 'USD',
      },
    });
    const traveler = await tx.traveler.create({
      data: {
        organizationId: org.id,
        bookingId: booking.id,
        firstName: 'RLS',
        lastName: 'Fixture',
        age: 30,
        sex: 'M',
        nationality: 'ZA',
        idOrPassportNumber: 'RLS-FIXTURE',
        isTourLead: true,
      },
    });
    await tx.visaApplication.create({
      data: {
        organizationId: org.id,
        travelerId: traveler.id,
        country: 'NA',
        travelerFirstName: traveler.firstName,
        travelerLastName: traveler.lastName,
        travelerNationality: traveler.nationality,
        travelerIdOrPassportNumber: traveler.idOrPassportNumber,
      },
    });
  });

  return org.id;
}

beforeAll(async () => {
  orgA = await seedOrgWithVisaApplication(`RLS-VISA-A-${Date.now()}`);
  orgB = await seedOrgWithVisaApplication(`RLS-VISA-B-${Date.now()}`);
});

afterAll(async () => {
  for (const id of [orgA, orgB]) {
    await withOrg(id, (tx) => tx.visaApplication.deleteMany({ where: { organizationId: id } }));
    await withOrg(id, (tx) => tx.traveler.deleteMany({ where: { organizationId: id } }));
    await withOrg(id, (tx) => tx.booking.deleteMany({ where: { organizationId: id } }));
    await withOrg(id, (tx) => tx.departure.deleteMany({ where: { organizationId: id } }));
    await withOrg(id, (tx) => tx.tourPackage.deleteMany({ where: { organizationId: id } }));
  }
  await admin.user.deleteMany({ where: { organizationId: { in: [orgA, orgB] } } });
  await admin.organization.deleteMany({ where: { id: { in: [orgA, orgB] } } });
  await admin.$disconnect();
  await prisma.$disconnect();
});

describe('Row-Level Security: visa_applications tenant isolation', () => {
  it('org A sees only its own visa applications', async () => {
    const rows = await withOrg(orgA, (tx) => tx.visaApplication.findMany());
    expect(rows.length).toBe(1);
    expect(rows.every((r) => r.organizationId === orgA)).toBe(true);
  });

  it('org B cannot see org A visa applications', async () => {
    const rows = await withOrg(orgB, (tx) => tx.visaApplication.findMany({ where: { organizationId: orgA } }));
    expect(rows.length).toBe(0);
  });

  it('deny-by-default: no org scope returns zero rows', async () => {
    const rows = await prisma.visaApplication.findMany();
    expect(rows.length).toBe(0);
  });

  it('cannot write a visa application into another tenant (WITH CHECK)', async () => {
    const orgATraveler = await withOrg(orgA, (tx) => tx.traveler.findFirstOrThrow());

    await expect(
      withOrg(orgB, (tx) =>
        tx.visaApplication.create({
          data: {
            organizationId: orgA,
            travelerId: orgATraveler.id,
            country: 'NA',
            travelerFirstName: 'Hostile',
            travelerLastName: 'Write',
            travelerNationality: 'ZA',
            travelerIdOrPassportNumber: 'HOSTILE',
          },
        }),
      ),
    ).rejects.toThrow();
  });
});

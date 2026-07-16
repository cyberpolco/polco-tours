import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { formatPackageReference } from '@modules/catalog';
import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { prisma, withOrg } from '../../src/lib/db';
import { loginAs } from '../helpers/test-auth';
import { generateConfirmationCode } from '../../src/modules/booking';

const { GET: getFacilitatorQueue } = await import('../../src/app/api/v1/visa/queue/route');

/**
 * My Schedule (DR-031): VISA_FACILITATOR's own whole-org visa queue --
 * covers both the PREDEFINED_PACKAGE (via Departure.startDate) and
 * TAILOR_MADE (via Booking.customTravelStart) travel-date derivation paths,
 * plus the "missing document" flag (any status with no document, per
 * explicit user choice).
 */
const admin = new PrismaClient();

let orgId: string;
let facilitatorId: string;
let operatorId: string;
let touristId: string;
let travelerA2Id: string;

beforeAll(async () => {
  const org = await admin.organization.create({
    data: { name: `VISA-QUEUE-TEST-${Date.now()}`, countries: ['NA'], status: 'VERIFIED' },
  });
  orgId = org.id;

  const [facilitator, operator, tourist] = await Promise.all([
    admin.user.create({ data: { email: `vf-queue-${Date.now()}@example.test`, role: 'VISA_FACILITATOR', organizationId: orgId } }),
    admin.user.create({ data: { email: `op-queue-${Date.now()}@example.test`, role: 'TOUR_OPERATOR', organizationId: orgId } }),
    admin.user.create({ data: { email: `t-queue-${Date.now()}@example.test`, role: 'TOURIST', organizationId: orgId } }),
  ]);
  facilitatorId = facilitator.id;
  operatorId = operator.id;
  touristId = tourist.id;

  await withOrg(orgId, async (tx) => {
    const pkg = await tx.tourPackage.create({
      data: {
        organizationId: orgId,
        packageReference: formatPackageReference(Date.now()),
        title: 'Visa Queue Fixture Safari',
        description: 'Fixture for the facilitator queue test.',
        country: 'NA',
        priceMinor: 10000,
        currency: 'USD',
        status: 'PUBLISHED',
      },
    });
    const departure = await tx.departure.create({
      data: { organizationId: orgId, tourPackageId: pkg.id, startDate: new Date('2026-12-01'), capacity: 5, status: 'SCHEDULED' },
    });

    const bookingA = await tx.booking.create({
      data: {
        organizationId: orgId,
        origin: 'PREDEFINED_PACKAGE',
        departureId: departure.id,
        touristUserId: touristId,
        confirmationCode: generateConfirmationCode(),
        bookingReference: generateConfirmationCode(),
        seats: 2,
        priceMinor: 20000,
        currency: 'USD',
        status: 'DEPOSIT_PAID',
      },
    });

    const [travelerA1, travelerA2] = await Promise.all([
      tx.traveler.create({
        data: { organizationId: orgId, bookingId: bookingA.id, firstName: 'Pending', lastName: 'Doc', age: 30, sex: 'M', nationality: 'ZA', idOrPassportNumber: 'A1', isTourLead: true },
      }),
      tx.traveler.create({
        data: { organizationId: orgId, bookingId: bookingA.id, firstName: 'Has', lastName: 'Doc', age: 28, sex: 'F', nationality: 'ZA', idOrPassportNumber: 'A2', isTourLead: false },
      }),
    ]);

    await tx.visaApplication.create({
      data: {
        organizationId: orgId,
        travelerId: travelerA1.id,
        country: 'NA',
        travelerFirstName: 'Pending',
        travelerLastName: 'Doc',
        travelerNationality: 'ZA',
        travelerIdOrPassportNumber: 'A1',
        status: 'SUBMITTED',
      },
    });

    travelerA2Id = travelerA2.id;
  });

  // Split into further withOrg calls -- Prisma's 5000ms interactive-
  // transaction timeout is measurably too short for this sandbox's real
  // network path to Neon once a beforeAll does this much sequential work in
  // one transaction (documented gotcha, CLAUDE.md).
  await withOrg(orgId, async (tx) => {
    const doc = await tx.document.create({
      data: {
        organizationId: orgId,
        kind: 'VISA',
        blobPathname: `fixture/${Date.now()}.pdf`,
        contentType: 'application/pdf',
        sizeBytes: 100,
        uploadedByUserId: facilitatorId,
      },
    });
    await tx.visaApplication.create({
      data: {
        organizationId: orgId,
        travelerId: travelerA2Id,
        country: 'NA',
        travelerFirstName: 'Has',
        travelerLastName: 'Doc',
        travelerNationality: 'ZA',
        travelerIdOrPassportNumber: 'A2',
        status: 'APPROVED',
        decidedAt: new Date(),
        documentId: doc.id,
      },
    });
  });

  // Split into a second withOrg call -- Prisma's 5000ms interactive-
  // transaction timeout is measurably too short for this sandbox's real
  // network path to Neon once a beforeAll does this much sequential work in
  // one transaction (documented gotcha, CLAUDE.md).
  await withOrg(orgId, async (tx) => {
    // TAILOR_MADE booking -- no departureId, travel date comes from customTravelStart instead.
    const bookingB = await tx.booking.create({
      data: {
        organizationId: orgId,
        origin: 'TAILOR_MADE',
        touristUserId: touristId,
        confirmationCode: generateConfirmationCode(),
        bookingReference: generateConfirmationCode(),
        seats: 1,
        customCountry: 'CD',
        customTravelStart: new Date('2026-11-01'),
        customTravelEnd: new Date('2026-11-10'),
        customDescription: 'Bespoke fixture trip',
        status: 'AWAITING_QUOTATION',
      },
    });
    const travelerB1 = await tx.traveler.create({
      data: { organizationId: orgId, bookingId: bookingB.id, firstName: 'Bespoke', lastName: 'Traveler', age: 40, sex: 'X', nationality: 'CD', idOrPassportNumber: 'B1', isTourLead: true },
    });
    await tx.visaApplication.create({
      data: {
        organizationId: orgId,
        travelerId: travelerB1.id,
        country: 'CD',
        travelerFirstName: 'Bespoke',
        travelerLastName: 'Traveler',
        travelerNationality: 'CD',
        travelerIdOrPassportNumber: 'B1',
        status: 'SUBMITTED',
      },
    });
  });
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
  await withOrg(orgId, (tx) => tx.visaApplication.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.traveler.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.document.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.booking.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.departure.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.tourPackage.deleteMany({ where: { organizationId: orgId } }));
  await admin.user.deleteMany({ where: { organizationId: orgId } });
  await admin.organization.delete({ where: { id: orgId } });
  await admin.$disconnect();
  await prisma.$disconnect();
});

describe('GET /api/v1/visa/queue', () => {
  it('a VISA_FACILITATOR sees the whole org queue, sorted soonest-travel-first, with resolved dates and missing-document flags (200)', async () => {
    const headers = await loginAs(facilitatorId);
    const req = new NextRequest('http://localhost/api/v1/visa/queue', { headers });
    const res = await getFacilitatorQueue(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.applications.length).toBe(3);

    // Sorted soonest travel date first: TAILOR_MADE (Nov 1) before
    // PREDEFINED_PACKAGE (Dec 1) -- A1/A2 share the exact same Dec 1
    // departure, so their relative order versus each other isn't asserted,
    // only that both sort after B1's earlier date.
    const byPassport = new Map<string, number>(
      body.applications.map((a: { travelerIdOrPassportNumber: string }, i: number) => [a.travelerIdOrPassportNumber, i]),
    );
    expect(byPassport.get('B1')).toBe(0);

    const a1 = body.applications.find((a: { travelerIdOrPassportNumber: string }) => a.travelerIdOrPassportNumber === 'A1');
    expect(a1.hasDocument).toBe(false);
    expect(a1.status).toBe('SUBMITTED');
    expect(new Date(a1.travelStartDate).toISOString().slice(0, 10)).toBe('2026-12-01');

    const a2 = body.applications.find((a: { travelerIdOrPassportNumber: string }) => a.travelerIdOrPassportNumber === 'A2');
    expect(a2.hasDocument).toBe(true);
    expect(a2.status).toBe('APPROVED');

    const b1 = body.applications.find((a: { travelerIdOrPassportNumber: string }) => a.travelerIdOrPassportNumber === 'B1');
    expect(b1.hasDocument).toBe(false);
    expect(new Date(b1.travelStartDate).toISOString().slice(0, 10)).toBe('2026-11-01');

    // Data shape: no raw documentId exposed, just the boolean.
    expect(a1).not.toHaveProperty('documentId');
  }, 30_000);

  it('a TOUR_OPERATOR (no visa.process) cannot use this route (403)', async () => {
    const headers = await loginAs(operatorId);
    const req = new NextRequest('http://localhost/api/v1/visa/queue', { headers });
    const res = await getFacilitatorQueue(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(403);
  });

  it('a TOURIST cannot use this route (403)', async () => {
    const headers = await loginAs(touristId);
    const req = new NextRequest('http://localhost/api/v1/visa/queue', { headers });
    const res = await getFacilitatorQueue(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(403);
  });
});

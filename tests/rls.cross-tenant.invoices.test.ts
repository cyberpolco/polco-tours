import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { formatPackageReference } from '@modules/catalog';
import { PrismaClient } from '@prisma/client';
import { withOrg, prisma } from '../src/lib/db';
import { generateConfirmationCode } from '../src/modules/booking';

/**
 * Extends the Phase 0/1 RLS proof to the `invoices` table added in Phase 1
 * Increment 2 (DR-012). Same contract as bookings: a query scoped to one org
 * can never see another org's rows, and deny-by-default holds with no scope
 * set. This does NOT cover tourist-vs-tourist ownership within the same org
 * -- that anti-BOLA check lives in invoicing/service.ts and is covered by
 * tests/api/invoices.security.test.ts.
 */
const admin = new PrismaClient();

let orgA: string;
let orgB: string;

async function seedOrgWithInvoice(name: string): Promise<string> {
  const org = await admin.organization.create({
    data: { name, countries: ['NA'], status: 'VERIFIED' },
  });
  const tourist = await admin.user.create({
    data: { email: `${name.toLowerCase()}@example.test`, role: 'TOURIST', organizationId: org.id },
  });
  await withOrg(org.id, async (tx) => {
    const pkg = await tx.tourPackage.create({
      data: {
        organizationId: org.id,
        packageReference: formatPackageReference(Date.now()),
        title: `${name} Safari`,
        description: 'Cross-tenant RLS fixture package.',
        country: 'NA',
        priceMinor: 10000,
        currency: 'USD',
      },
    });
    const departure = await tx.departure.create({
      data: { organizationId: org.id, tourPackageId: pkg.id, startDate: new Date('2026-08-01'), capacity: 10 },
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
    await tx.invoice.create({
      data: {
        organizationId: org.id,
        bookingId: booking.id,
        currency: 'USD',
        subtotalMinor: 10000,
        taxRateBp: 1500,
        taxMinor: 1500,
        totalMinor: 11500,
        depositMinor: 4600,
        balanceMinor: 6900,
        status: 'ISSUED',
      },
    });
  });
  return org.id;
}

beforeAll(async () => {
  orgA = await seedOrgWithInvoice(`RLS-INV-A-${Date.now()}`);
  orgB = await seedOrgWithInvoice(`RLS-INV-B-${Date.now()}`);
});

afterAll(async () => {
  // Guard: if beforeAll failed before orgA/orgB were assigned, Prisma silently
  // drops the undefined where-clause value, turning cleanup into an unscoped
  // deleteMany that wipes the whole table -- this has hit real production
  // data twice. Skip cleanup entirely rather than risk it.
  if (!orgA || !orgB) {
    await admin.$disconnect();
    await prisma.$disconnect();
    return;
  }
  for (const id of [orgA, orgB]) {
    await withOrg(id, (tx) => tx.invoice.deleteMany({ where: { organizationId: id } }));
    await withOrg(id, (tx) => tx.booking.deleteMany({ where: { organizationId: id } }));
    await withOrg(id, (tx) => tx.departure.deleteMany({ where: { organizationId: id } }));
    await withOrg(id, (tx) => tx.tourPackage.deleteMany({ where: { organizationId: id } }));
  }
  await admin.user.deleteMany({ where: { organizationId: { in: [orgA, orgB] } } });
  await admin.organization.deleteMany({ where: { id: { in: [orgA, orgB] } } });
  await admin.$disconnect();
  await prisma.$disconnect();
});

describe('Row-Level Security: invoices tenant isolation', () => {
  it('org A sees only its own invoices', async () => {
    const rows = await withOrg(orgA, (tx) => tx.invoice.findMany());
    expect(rows.length).toBe(1);
    expect(rows.every((r) => r.organizationId === orgA)).toBe(true);
  });

  it('org B cannot see org A invoices', async () => {
    const rows = await withOrg(orgB, (tx) => tx.invoice.findMany({ where: { organizationId: orgA } }));
    expect(rows.length).toBe(0);
  });

  it('deny-by-default: no org scope returns zero rows', async () => {
    const rows = await prisma.invoice.findMany();
    expect(rows.length).toBe(0);
  });

  it('cannot write an invoice into another tenant (WITH CHECK)', async () => {
    // A second, invoice-less booking in org A -- isolates this assertion from
    // Invoice.bookingId's unique constraint (org A's seeded booking already
    // has an invoice, which would throw for an unrelated reason).
    const orgASecondBooking = await withOrg(orgA, async (tx) => {
      const departure = await tx.departure.findFirstOrThrow();
      const tourist = await tx.booking.findFirstOrThrow();
      return tx.booking.create({
        data: {
          organizationId: orgA,
          departureId: departure.id,
          touristUserId: tourist.touristUserId,
          confirmationCode: generateConfirmationCode(),
          bookingReference: generateConfirmationCode(),
          seats: 1,
          priceMinor: 10000,
          currency: 'USD',
        },
      });
    });
    await expect(
      withOrg(orgB, (tx) =>
        tx.invoice.create({
          data: {
            organizationId: orgA,
            bookingId: orgASecondBooking.id,
            currency: 'USD',
            subtotalMinor: 100,
            taxRateBp: 1500,
            taxMinor: 15,
            totalMinor: 115,
            depositMinor: 46,
            balanceMinor: 69,
            status: 'ISSUED',
          },
        }),
      ),
    ).rejects.toThrow();
  });
});

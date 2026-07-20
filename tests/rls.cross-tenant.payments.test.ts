import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { formatPackageReference } from '@modules/catalog';
import { PrismaClient } from '@prisma/client';
import { withOrg, prisma } from '../src/lib/db';
import { generateBookingReference } from '../src/modules/booking';

/**
 * Extends the Phase 0/1 RLS proof to the `payments` table added in Phase 1
 * Increment 2 (DR-012). Same contract as bookings/invoices: a query scoped
 * to one org can never see another org's rows, and deny-by-default holds
 * with no scope set.
 */
const admin = new PrismaClient();

let orgA: string;
let orgB: string;
let orgAInvoiceId: string;

async function seedOrgWithPayment(name: string): Promise<{ orgId: string; invoiceId: string }> {
  const org = await admin.organization.create({
    data: { name, countries: ['NA'], status: 'VERIFIED' },
  });
  const tourist = await admin.user.create({
    data: { email: `${name.toLowerCase()}@example.test`, role: 'TOURIST', organizationId: org.id },
  });
  const invoiceId = await withOrg(org.id, async (tx) => {
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
        bookingReference: generateBookingReference(),
        seats: 1,
        priceMinor: 10000,
        currency: 'USD',
      },
    });
    const invoice = await tx.invoice.create({
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
    await tx.payment.create({
      data: {
        organizationId: org.id,
        invoiceId: invoice.id,
        kind: 'DEPOSIT',
        amountMinor: 4600,
        currency: 'USD',
        providerRef: 'stub_fixture',
        status: 'PENDING',
      },
    });
    return invoice.id;
  });
  return { orgId: org.id, invoiceId };
}

beforeAll(async () => {
  const a = await seedOrgWithPayment(`RLS-PAY-A-${Date.now()}`);
  orgA = a.orgId;
  orgAInvoiceId = a.invoiceId;
  const b = await seedOrgWithPayment(`RLS-PAY-B-${Date.now()}`);
  orgB = b.orgId;
});

afterAll(async () => {
  // Guard: if beforeAll failed before orgA/orgB were assigned, Prisma silently
  // drops the undefined where-clause value, turning this into an unscoped
  // deleteMany that wipes the whole table -- this has hit real production
  // data twice. Skip cleanup entirely rather than risk it.
  if (!orgA || !orgB) {
    await admin.$disconnect();
    await prisma.$disconnect();
    return;
  }
  for (const id of [orgA, orgB]) {
    await withOrg(id, (tx) => tx.payment.deleteMany({ where: { organizationId: id } }));
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

describe('Row-Level Security: payments tenant isolation', () => {
  it('org A sees only its own payments', async () => {
    const rows = await withOrg(orgA, (tx) => tx.payment.findMany());
    expect(rows.length).toBe(1);
    expect(rows.every((r) => r.organizationId === orgA)).toBe(true);
  });

  it('org B cannot see org A payments', async () => {
    const rows = await withOrg(orgB, (tx) => tx.payment.findMany({ where: { organizationId: orgA } }));
    expect(rows.length).toBe(0);
  });

  it('deny-by-default: no org scope returns zero rows', async () => {
    const rows = await prisma.payment.findMany();
    expect(rows.length).toBe(0);
  });

  it('cannot write a payment into another tenant (WITH CHECK)', async () => {
    await expect(
      withOrg(orgB, (tx) =>
        tx.payment.create({
          data: {
            organizationId: orgA,
            invoiceId: orgAInvoiceId,
            kind: 'BALANCE',
            amountMinor: 6900,
            currency: 'USD',
            providerRef: 'stub_cross_tenant_attempt',
            status: 'PENDING',
          },
        }),
      ),
    ).rejects.toThrow();
  });
});

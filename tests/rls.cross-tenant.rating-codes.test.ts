import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { generateConfirmationCode } from '@modules/booking';
import { withOrg, prisma } from '../src/lib/db';

/** Extends the RLS proof to the `rating_codes` table added in DR-037. */
const admin = new PrismaClient();

let orgA: string;
let orgB: string;
let touristAId: string;
let touristBId: string;

async function seedOrgWithRatingCode(name: string): Promise<{ orgId: string; touristId: string }> {
  const org = await admin.organization.create({ data: { name, countries: ['NA'], status: 'VERIFIED' } });
  const tourist = await admin.user.create({
    data: { email: `rls-ratingcode-${name}@example.test`, role: 'TOURIST', organizationId: org.id },
  });
  await withOrg(org.id, async (tx) => {
    const booking = await tx.booking.create({
      data: {
        organizationId: org.id,
        touristUserId: tourist.id,
        seats: 1,
        confirmationCode: generateConfirmationCode(),
        bookingReference: generateConfirmationCode(),
      },
    });
    await tx.ratingCode.create({
      data: {
        organizationId: org.id,
        bookingId: booking.id,
        issuedByUserId: tourist.id,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        code: `RLS${name}`,
      },
    });
  });
  return { orgId: org.id, touristId: tourist.id };
}

beforeAll(async () => {
  const [a, b] = await Promise.all([
    seedOrgWithRatingCode(`RLS-RC-A-${Date.now()}`),
    seedOrgWithRatingCode(`RLS-RC-B-${Date.now()}`),
  ]);
  orgA = a.orgId;
  orgB = b.orgId;
  touristAId = a.touristId;
  touristBId = b.touristId;
});

afterAll(async () => {
  // Guard: if beforeAll failed before orgA/orgB were assigned, Prisma
  // silently drops the undefined where-clause value, turning cleanup into
  // an unscoped deleteMany that wipes the whole table -- this has hit real
  // production data twice. Skip cleanup entirely rather than risk it.
  if (!orgA || !orgB) {
    await admin.$disconnect();
    await prisma.$disconnect();
    return;
  }
  for (const id of [orgA, orgB]) {
    await withOrg(id, (tx) => tx.ratingCode.deleteMany({ where: { organizationId: id } }));
    await withOrg(id, (tx) => tx.booking.deleteMany({ where: { organizationId: id } }));
  }
  await admin.user.deleteMany({ where: { id: { in: [touristAId, touristBId] } } });
  await admin.organization.deleteMany({ where: { id: { in: [orgA, orgB] } } });
  await admin.$disconnect();
  await prisma.$disconnect();
});

describe('Row-Level Security: rating_codes tenant isolation', () => {
  it('org A sees only its own rating codes', async () => {
    const rows = await withOrg(orgA, (tx) => tx.ratingCode.findMany());
    expect(rows.length).toBe(1);
    expect(rows.every((r) => r.organizationId === orgA)).toBe(true);
  });

  it('org B cannot see org A rating codes', async () => {
    const rows = await withOrg(orgB, (tx) => tx.ratingCode.findMany({ where: { organizationId: orgA } }));
    expect(rows.length).toBe(0);
  });

  it('deny-by-default: no org scope returns zero rows', async () => {
    const rows = await prisma.ratingCode.findMany();
    expect(rows.length).toBe(0);
  });

  it('cannot write a rating code into another tenant (WITH CHECK)', async () => {
    const bookingInOrgA = await withOrg(orgA, (tx) => tx.booking.findFirstOrThrow());
    await expect(
      withOrg(orgA, (tx) =>
        tx.ratingCode.create({
          data: {
            organizationId: orgB,
            bookingId: bookingInOrgA.id,
            issuedByUserId: touristAId,
            expiresAt: new Date(Date.now() + 1000),
            code: `HOSTILE-${Date.now()}`,
          },
        }),
      ),
    ).rejects.toThrow();
  });
});

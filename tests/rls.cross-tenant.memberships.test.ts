import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { withOrg, prisma } from '../src/lib/db';

/**
 * Extends the RLS proof to the `organization_members` (Membership) table --
 * unused since it was first scaffolded, so it never got a policy either
 * (DR-026 makes it the real multi-role source of truth for staff accounts).
 */
const admin = new PrismaClient();

let orgA: string;
let orgB: string;

async function seedOrgWithMembership(name: string): Promise<string> {
  const org = await admin.organization.create({ data: { name, countries: ['NA'], status: 'VERIFIED' } });
  const user = await admin.user.create({
    data: { email: `${name.toLowerCase()}-user@example.test`, role: 'DRIVER', organizationId: org.id },
  });

  await withOrg(org.id, (tx) => tx.membership.create({ data: { userId: user.id, organizationId: org.id, role: 'DRIVER' } }));

  return org.id;
}

beforeAll(async () => {
  orgA = await seedOrgWithMembership(`RLS-MEMBER-A-${Date.now()}`);
  orgB = await seedOrgWithMembership(`RLS-MEMBER-B-${Date.now()}`);
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
    await withOrg(id, (tx) => tx.membership.deleteMany({ where: { organizationId: id } }));
  }
  await admin.user.deleteMany({ where: { organizationId: { in: [orgA, orgB] } } });
  await admin.organization.deleteMany({ where: { id: { in: [orgA, orgB] } } });
  await admin.$disconnect();
  await prisma.$disconnect();
});

describe('Row-Level Security: organization_members (Membership) tenant isolation', () => {
  it('org A sees only its own memberships', async () => {
    const rows = await withOrg(orgA, (tx) => tx.membership.findMany());
    expect(rows.length).toBe(1);
    expect(rows.every((r) => r.organizationId === orgA)).toBe(true);
  });

  it('org B cannot see org A memberships', async () => {
    const rows = await withOrg(orgB, (tx) => tx.membership.findMany({ where: { organizationId: orgA } }));
    expect(rows.length).toBe(0);
  });

  it('deny-by-default: no org scope returns zero rows', async () => {
    const rows = await prisma.membership.findMany();
    expect(rows.length).toBe(0);
  });

  it('cannot write a membership into another tenant (WITH CHECK)', async () => {
    const orgAUser = await withOrg(orgA, (tx) => tx.user.findFirstOrThrow({ where: { organizationId: orgA } }));

    await expect(
      withOrg(orgB, (tx) =>
        tx.membership.create({ data: { userId: orgAUser.id, organizationId: orgA, role: 'DRIVER' } }),
      ),
    ).rejects.toThrow();
  });
});

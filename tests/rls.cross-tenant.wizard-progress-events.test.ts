import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { withOrg, prisma } from '../src/lib/db';

/** Extends the RLS proof to the `wizard_progress_events` table added in
 * DR-155 -- the plan-my-trip wizard-step-abandonment tracker. */
const admin = new PrismaClient();
const suffix = `${Date.now()}`;

let orgA: string;
let orgB: string;

async function seedOrgWithWizardProgress(name: string, sessionToken: string): Promise<string> {
  const org = await admin.organization.create({ data: { name, countries: ['NA'], status: 'VERIFIED' } });
  await withOrg(org.id, (tx) =>
    tx.wizardProgressEvent.create({ data: { organizationId: org.id, sessionToken, highestStep: 3 } }),
  );
  return org.id;
}

beforeAll(async () => {
  orgA = await seedOrgWithWizardProgress(`RLS-WIZARD-A-${suffix}`, `session-a-${suffix}`);
  orgB = await seedOrgWithWizardProgress(`RLS-WIZARD-B-${suffix}`, `session-b-${suffix}`);
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
    await withOrg(id, (tx) => tx.wizardProgressEvent.deleteMany({ where: { organizationId: id } }));
  }
  await admin.organization.deleteMany({ where: { id: { in: [orgA, orgB] } } });
  await admin.$disconnect();
  await prisma.$disconnect();
});

describe('Row-Level Security: wizard_progress_events tenant isolation', () => {
  it('org A sees only its own wizard-progress rows', async () => {
    const rows = await withOrg(orgA, (tx) => tx.wizardProgressEvent.findMany());
    expect(rows.length).toBe(1);
    expect(rows.every((r) => r.organizationId === orgA)).toBe(true);
  });

  it('org B cannot see org A wizard-progress rows', async () => {
    const rows = await withOrg(orgB, (tx) => tx.wizardProgressEvent.findMany({ where: { organizationId: orgA } }));
    expect(rows.length).toBe(0);
  });

  it('deny-by-default: no org scope returns zero rows', async () => {
    const rows = await prisma.wizardProgressEvent.findMany();
    expect(rows.length).toBe(0);
  });

  it('cannot write a wizard-progress row into another tenant (WITH CHECK)', async () => {
    await expect(
      withOrg(orgB, (tx) =>
        tx.wizardProgressEvent.create({
          data: { organizationId: orgA, sessionToken: `hostile-${suffix}`, highestStep: 0 },
        }),
      ),
    ).rejects.toThrow();
  });
});

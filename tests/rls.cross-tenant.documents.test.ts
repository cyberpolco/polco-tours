import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { withOrg, prisma } from '../src/lib/db';

/** Extends the RLS proof to the `documents` table added in DR-015 (passport
 * metadata; never a public Blob URL -- see src/modules/documents). */
const admin = new PrismaClient();

let orgA: string;
let orgB: string;
let userB: string;

async function seedOrgWithDocument(name: string): Promise<{ orgId: string; userId: string }> {
  const org = await admin.organization.create({ data: { name, countries: ['NA'], status: 'VERIFIED' } });
  const staff = await admin.user.create({
    data: { email: `${name.toLowerCase()}@example.test`, role: 'TOUR_OPERATOR', organizationId: org.id },
  });
  await withOrg(org.id, (tx) =>
    tx.document.create({
      data: {
        organizationId: org.id,
        kind: 'PASSPORT',
        blobPathname: `fixtures/${name}.pdf`,
        contentType: 'application/pdf',
        sizeBytes: 1,
        uploadedByUserId: staff.id,
      },
    }),
  );
  return { orgId: org.id, userId: staff.id };
}

beforeAll(async () => {
  ({ orgId: orgA } = await seedOrgWithDocument(`RLS-DOC-A-${Date.now()}`));
  ({ orgId: orgB, userId: userB } = await seedOrgWithDocument(`RLS-DOC-B-${Date.now()}`));
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
    await withOrg(id, (tx) => tx.document.deleteMany({ where: { organizationId: id } }));
  }
  await admin.user.deleteMany({ where: { organizationId: { in: [orgA, orgB] } } });
  await admin.organization.deleteMany({ where: { id: { in: [orgA, orgB] } } });
  await admin.$disconnect();
  await prisma.$disconnect();
});

describe('Row-Level Security: documents tenant isolation', () => {
  it('org A sees only its own documents', async () => {
    const rows = await withOrg(orgA, (tx) => tx.document.findMany());
    expect(rows.length).toBe(1);
    expect(rows.every((r) => r.organizationId === orgA)).toBe(true);
  });

  it('org B cannot see org A documents', async () => {
    const rows = await withOrg(orgB, (tx) => tx.document.findMany({ where: { organizationId: orgA } }));
    expect(rows.length).toBe(0);
  });

  it('deny-by-default: no org scope returns zero rows', async () => {
    const rows = await prisma.document.findMany();
    expect(rows.length).toBe(0);
  });

  it('cannot write a document into another tenant (WITH CHECK)', async () => {
    await expect(
      withOrg(orgB, (tx) =>
        tx.document.create({
          data: {
            organizationId: orgA,
            kind: 'PASSPORT',
            blobPathname: 'fixtures/hostile.pdf',
            contentType: 'application/pdf',
            sizeBytes: 1,
            uploadedByUserId: userB,
          },
        }),
      ),
    ).rejects.toThrow();
  });
});

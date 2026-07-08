// POLCO TOURS — database seed (Phase 0)
// Real launch records: single operator "Lam" (Namibia + DRC) with SUPERADMIN,
// and per-country effective-dated tax (DRC 16% / Namibia 15%). DR-005 / DR-006.
import { PrismaClient, Role, OrgStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // --- Operator tenant: Lam ---
  const lam = await prisma.organization.upsert({
    where: { id: '00000000-0000-4000-8000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-4000-8000-000000000001',
      name: 'Lam',
      countries: ['NA', 'CD'],
      status: OrgStatus.VERIFIED,
      isPrimary: true,
    },
  });

  // --- Superadmin principal (owns the platform + the sole operator) ---
  const admin = await prisma.user.upsert({
    where: { email: 'lam@polcotours.com' },
    update: { role: Role.SUPERADMIN, organizationId: lam.id, emailVerified: true },
    create: {
      email: 'lam@polcotours.com',
      name: 'Lam',
      role: Role.SUPERADMIN,
      organizationId: lam.id,
      emailVerified: true,
    },
  });

  await prisma.membership.upsert({
    where: { userId_organizationId: { userId: admin.id, organizationId: lam.id } },
    update: { role: Role.SUPERADMIN },
    create: { userId: admin.id, organizationId: lam.id, role: Role.SUPERADMIN },
  });

  // --- Per-country tax (basis points) ---
  const taxes = [
    { country: 'CD', rateBp: 1600 }, // DRC VAT 16%
    { country: 'NA', rateBp: 1500 }, // Namibia VAT 15%
  ];
  for (const t of taxes) {
    const existing = await prisma.taxRate.findFirst({
      where: { country: t.country, taxType: 'VAT', validTo: null },
    });
    if (!existing) {
      await prisma.taxRate.create({ data: { country: t.country, taxType: 'VAT', rateBp: t.rateBp } });
    }
  }

  console.log('Seeded:', { operator: lam.name, superadmin: admin.email, taxRates: taxes.length });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

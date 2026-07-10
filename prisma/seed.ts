// POLCO TOURS — database seed (Phase 0)
// Real launch records: single operator "Lam" (Namibia + DRC) with SUPERADMIN,
// and per-country effective-dated tax (DRC 16% / Namibia 15%). DR-005 / DR-006.
import { PrismaClient, Role, OrgStatus, AddonCode, Currency, PackageTag, PackageStatus } from '@prisma/client';
import { withOrg } from '@lib/db';

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

  // --- Add-on services (DR-015) -- staff-managed catalog, seeded for now ---
  const addons: Array<{ code: AddonCode; name: string; description: string; priceMinor: number }> = [
    { code: AddonCode.PHOTOGRAPHY, name: 'Photography', description: 'A dedicated photographer for the trip', priceMinor: 15000 },
    { code: AddonCode.VIDEOGRAPHY, name: 'Videography', description: 'A dedicated videographer for the trip', priceMinor: 25000 },
    { code: AddonCode.TRANSLATOR, name: 'Translator', description: 'An on-tour translator/interpreter', priceMinor: 10000 },
    { code: AddonCode.VISA_ASSISTANCE, name: 'Visa assistance', description: 'Help preparing and lodging visa paperwork', priceMinor: 5000 },
  ];
  await withOrg(lam.id, async (tx) => {
    for (const a of addons) {
      const existing = await tx.addonService.findFirst({ where: { code: a.code } });
      if (!existing) {
        await tx.addonService.create({
          data: { organizationId: lam.id, currency: Currency.USD, active: true, ...a },
        });
      }
    }
  });

  // --- Demo catalog (DR-016) -- the public browse/quiz pages need real data
  // day one; there is no staff-facing package-management UI yet, so this is
  // the only way packages/departures exist outside a direct API call. ---
  const packages: Array<{
    title: string;
    description: string;
    country: string;
    priceMinor: number;
    currency: Currency;
    durationDays: number;
    tags: PackageTag[];
    departureStarts: string[];
  }> = [
    {
      title: 'Etosha Wildlife Safari',
      description: 'Four days tracking elephant, lion, and rhino across Etosha National Park.',
      country: 'NA',
      priceMinor: 850000,
      currency: Currency.NAD,
      durationDays: 4,
      tags: [PackageTag.WILDLIFE, PackageTag.ADVENTURE],
      departureStarts: ['2026-09-15', '2026-10-13'],
    },
    {
      title: 'Namib Desert Dunes Retreat',
      description: 'Three days among the red dunes of Sossusvlei, with a private lodge stay.',
      country: 'NA',
      priceMinor: 1200000,
      currency: Currency.NAD,
      durationDays: 3,
      tags: [PackageTag.RELAXATION, PackageTag.LUXURY],
      departureStarts: ['2026-09-22'],
    },
    {
      title: 'Windhoek Culture & Craft Trail',
      description: "Two days in Windhoek's markets, museums, and township food halls.",
      country: 'NA',
      priceMinor: 350000,
      currency: Currency.NAD,
      durationDays: 2,
      tags: [PackageTag.CULTURE, PackageTag.FAMILY, PackageTag.BUDGET],
      departureStarts: ['2026-09-05', '2026-11-03'],
    },
    {
      title: 'Virunga Gorilla Trek',
      description: 'Five days trekking to habituated mountain gorilla families in Virunga National Park.',
      country: 'CD',
      priceMinor: 95000,
      currency: Currency.USD,
      durationDays: 5,
      tags: [PackageTag.WILDLIFE, PackageTag.ADVENTURE],
      departureStarts: ['2026-10-01'],
    },
    {
      title: 'Kinshasa & Congo River Culture Tour',
      description: 'Three days of music, markets, and a Congo River boat trip in Kinshasa.',
      country: 'CD',
      priceMinor: 40000,
      currency: Currency.USD,
      durationDays: 3,
      tags: [PackageTag.CULTURE, PackageTag.FAMILY],
      departureStarts: ['2026-09-28', '2026-10-26'],
    },
  ];

  await withOrg(lam.id, async (tx) => {
    for (const p of packages) {
      let pkg = await tx.tourPackage.findFirst({ where: { title: p.title } });
      if (!pkg) {
        pkg = await tx.tourPackage.create({
          data: {
            organizationId: lam.id,
            title: p.title,
            description: p.description,
            country: p.country,
            priceMinor: p.priceMinor,
            currency: p.currency,
            durationDays: p.durationDays,
            tags: p.tags,
            status: PackageStatus.PUBLISHED,
          },
        });
      }
      for (const startDate of p.departureStarts) {
        const existing = await tx.departure.findFirst({ where: { tourPackageId: pkg.id, startDate: new Date(startDate) } });
        if (!existing) {
          await tx.departure.create({
            data: { organizationId: lam.id, tourPackageId: pkg.id, startDate: new Date(startDate), capacity: 10 },
          });
        }
      }
    }
  });

  console.log('Seeded:', {
    operator: lam.name,
    superadmin: admin.email,
    taxRates: taxes.length,
    addonServices: addons.length,
    packages: packages.length,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

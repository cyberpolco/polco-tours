// POLCO TOURS — database seed (Phase 0)
// Real launch records: single operator "Lam" (Namibia + DRC) with SUPERADMIN,
// and per-country effective-dated tax (DRC 16% / Namibia 15%). DR-005 / DR-006.
import { PrismaClient, Role, OrgStatus, AddonCode, Currency, PackageTag, PackageStatus } from '@prisma/client';
import { formatPackageReference } from '@modules/catalog';
import { withOrg } from '@lib/db';
import { EDITABLE_ROLES, DEFAULT_PERMISSIONS } from '@lib/rbac';

const prisma = new PrismaClient();

async function main() {
  // --- Operator tenant: Lam ---
  // Zambia (ZM) + Zimbabwe (ZW) added alongside Namibia/DRC (DR-034, full
  // platform expansion, explicit user choice) -- `update` here (not `{}`)
  // so re-running this seed against the already-provisioned Lam org
  // actually adds the new countries, not just on first create.
  const lam = await prisma.organization.upsert({
    where: { id: '00000000-0000-4000-8000-000000000001' },
    update: { countries: ['NA', 'CD', 'ZM', 'ZW'] },
    create: {
      id: '00000000-0000-4000-8000-000000000001',
      name: 'Lam',
      countries: ['NA', 'CD', 'ZM', 'ZW'],
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

  await withOrg(lam.id, (tx) =>
    tx.membership.upsert({
      where: { userId_organizationId_role: { userId: admin.id, organizationId: lam.id, role: Role.SUPERADMIN } },
      update: {},
      create: { userId: admin.id, organizationId: lam.id, role: Role.SUPERADMIN },
    }),
  );

  // --- Per-country tax (basis points) ---
  // Zambia/Zimbabwe rates below are reasonable estimates, not verified
  // figures -- same "effective-dated, verify against the real revenue
  // authority" caveat CLAUDE.md already applies to Namibia/DRC (DR-034).
  const taxes = [
    { country: 'CD', rateBp: 1600 }, // DRC VAT 16%
    { country: 'NA', rateBp: 1500 }, // Namibia VAT 15%
    { country: 'ZM', rateBp: 1600 }, // Zambia VAT 16% (estimate, verify against ZRA)
    { country: 'ZW', rateBp: 1500 }, // Zimbabwe VAT 15% (estimate, verify against ZIMRA)
  ];
  for (const t of taxes) {
    const existing = await prisma.taxRate.findFirst({
      where: { country: t.country, taxType: 'VAT', validTo: null },
    });
    if (!existing) {
      await prisma.taxRate.create({ data: { country: t.country, taxType: 'VAT', rateBp: t.rateBp } });
    }
  }

  // --- Platform rate (Settings module, DR-042) -- the platform's own
  // commission on every online payment, 5% by default ("the cost to
  // maintain the platform," explicit user figure). A single global rate,
  // not per-country.
  const existingPlatformRate = await prisma.platformRate.findFirst({ where: { validTo: null } });
  if (!existingPlatformRate) {
    await prisma.platformRate.create({ data: { rateBp: 500 } });
  }

  // --- Country regulations (Immigration Module, DR-034) -- initially
  // supported countries per the spec. Content below is general,
  // reasonably-current-as-of-writing knowledge, NOT verified against each
  // country's immigration authority/embassy -- SUPERADMIN should review and
  // correct via /staff/country-regulations before this is treated as
  // authoritative (same "effective-dated, verify against real sources"
  // posture this project already takes on visa/tax/security-zone facts). ---
  const countryRegulations: Array<{
    country: string;
    visaRequirements: string;
    requiredDocuments: string;
    processingTimeDays?: number;
    entryConditions: string;
    immigrationFeeMinor?: number;
    feeCurrency?: Currency;
    embassyName?: string;
    healthRequirements: string;
    travelAdvisories?: string;
    specialRestrictions?: string;
  }> = [
    {
      country: 'CD',
      visaRequirements:
        "Most nationalities need a visa before arrival (embassy/consulate or an approved e-visa portal); some regional SADC/CEEAC nationals are exempt or eligible for visa-on-arrival at Kinshasa. Requirements shift by nationality -- verify with DGM (Direction Générale de Migration) or the nearest DRC embassy before travel.",
      requiredDocuments:
        'Passport valid 6+ months beyond travel with 2+ blank pages, a completed visa application, proof of yellow fever vaccination, a return/onward ticket, and (for most visa types) an invitation letter or hotel booking confirmation.',
      processingTimeDays: 10,
      entryConditions:
        'A valid international Yellow Fever vaccination certificate is mandatory for entry, with health screening on arrival. Foreign tour operators generally must work through a licensed local DMC.',
      immigrationFeeMinor: 10000,
      feeCurrency: Currency.USD,
      embassyName: "DRC embassy/consulate nearest the traveler's country of residence",
      healthRequirements:
        'Yellow fever vaccination certificate required for entry. Malaria prophylaxis strongly recommended nationwide.',
      travelAdvisories:
        'Eastern DRC is under active conflict (BR-07): North Kivu (incl. Virunga) is high-risk/specialist-only, Ituri should not be operated in, South Kivu and Kasai carry elevated risk. Kinshasa and western DRC are generally accessible. Check current guidance before booking into any flagged province.',
      specialRestrictions:
        'Gorilla trekking in Virunga National Park requires an accredited local guide, groups capped around 8, a minimum 7m distance from gorillas, no flash photography; visibly unwell visitors may be barred from trekking.',
    },
    {
      country: 'NA',
      visaRequirements:
        "Since 2025 Namibia's visa-exemption list has narrowed -- 33 previously visa-exempt nationalities (incl. US/UK/EU/Canada/Australia) now need an e-visa or visa-on-arrival; rules changed twice in 2025. Verify current requirements against the Ministry of Home Affairs, Immigration, Safety and Security (MHAISS) or the nearest embassy before travel.",
      requiredDocuments:
        'Passport valid 6+ months beyond travel with 2+ blank pages, a completed e-visa application (where applicable), proof of accommodation, a return/onward ticket, and proof of sufficient funds.',
      processingTimeDays: 5,
      entryConditions:
        'No yellow fever certificate required unless arriving from a country with yellow-fever transmission risk. Standard immigration/customs screening on arrival.',
      immigrationFeeMinor: 8000,
      feeCurrency: Currency.USD,
      embassyName: 'Namibian Ministry of Home Affairs, Immigration, Safety and Security (MHAISS)',
      healthRequirements:
        'Malaria risk in northern Namibia (Etosha, Caprivi, Kavango) -- prophylaxis recommended for travel to these regions. Yellow fever certificate required only if arriving from an endemic country.',
    },
    {
      country: 'ZM',
      visaRequirements:
        "Most visitors can get a visa on arrival or an e-visa before travel; some nationalities are visa-exempt for short stays. A KAZA UniVisa (where available) also covers Zimbabwe and cross-border day trips to Botswana via Kazungula. Verify current requirements with Zambia's Department of Immigration before travel.",
      requiredDocuments:
        'Passport valid 6+ months beyond travel with 2+ blank pages, a completed visa application (online or on arrival), proof of onward travel, and proof of accommodation.',
      processingTimeDays: 3,
      entryConditions:
        'Yellow fever vaccination certificate required if arriving from a country with yellow-fever transmission risk. Standard immigration/customs screening on arrival.',
      immigrationFeeMinor: 5000,
      feeCurrency: Currency.USD,
      embassyName: 'Zambia Department of Immigration',
      healthRequirements:
        'Malaria risk nationwide, particularly the Zambezi and Luangwa valleys -- prophylaxis recommended. Yellow fever certificate required if arriving from an endemic country.',
      specialRestrictions: 'Victoria Falls/Livingstone-area activities (whitewater rafting, gorge activities) carry their own operator-specific safety waivers.',
    },
    {
      country: 'ZW',
      visaRequirements:
        'Most visitors can get a visa on arrival or an e-visa before travel; some nationalities are visa-exempt for short stays. A KAZA UniVisa (where available) covers both Zimbabwe and Zambia plus cross-border day trips to Botswana via Kazungula. Verify current requirements with the Zimbabwe Department of Immigration before travel.',
      requiredDocuments:
        'Passport valid 6+ months beyond travel with 2+ blank pages, a completed visa application (online or on arrival), proof of onward travel, and proof of accommodation.',
      processingTimeDays: 3,
      entryConditions:
        'Yellow fever vaccination certificate required if arriving from a country with yellow-fever transmission risk. Standard immigration/customs screening on arrival.',
      immigrationFeeMinor: 3000,
      feeCurrency: Currency.USD,
      embassyName: 'Zimbabwe Department of Immigration',
      healthRequirements:
        'Malaria risk in the Zambezi Valley and lower-lying regions (incl. around Victoria Falls and Hwange) -- prophylaxis recommended. Yellow fever certificate required if arriving from an endemic country.',
    },
  ];
  for (const r of countryRegulations) {
    await prisma.countryRegulation.upsert({
      where: { country: r.country },
      update: {},
      create: r,
    });
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

  for (const p of packages) {
    await withOrg(lam.id, async (tx) => {
      let pkg = await tx.tourPackage.findFirst({ where: { title: p.title } });
      if (!pkg) {
        pkg = await tx.tourPackage.create({
          data: {
            organizationId: lam.id,
            packageReference: formatPackageReference(Date.now()),
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
    });
  }

  // --- Fleet demo data (DR-059) -- 10 vehicles, 10 drivers, 10 guides, so
  // there's real fleet data to browse (and demo the new SUPERADMIN-only
  // delete option against) in the staff dashboard day one, same rationale
  // as the demo catalog above. One withOrg(...) per item (not one
  // transaction wrapping the whole loop) -- matches the packages loop's own
  // convention just above, since this sandbox's Neon connection can time out
  // an interactive transaction that does too many sequential round trips
  // (see CLAUDE.md's Insights/DR-038 connection-pool finding). ---
  const vehicles: Array<{
    plateNumber: string;
    make: string;
    model: string;
    year: number;
    vehicleType: string;
    seatCapacity: number;
  }> = [
    { plateNumber: 'N12345W', make: 'Toyota', model: 'Land Cruiser', year: 2022, vehicleType: '4x4', seatCapacity: 7 },
    { plateNumber: 'N12346W', make: 'Toyota', model: 'Hilux', year: 2021, vehicleType: '4x4', seatCapacity: 5 },
    { plateNumber: 'N12347W', make: 'Toyota', model: 'Quantum', year: 2023, vehicleType: 'Minibus', seatCapacity: 14 },
    { plateNumber: 'N12348W', make: 'Mercedes-Benz', model: 'Sprinter', year: 2022, vehicleType: 'Minibus', seatCapacity: 16 },
    { plateNumber: 'N12349W', make: 'Toyota', model: 'Corolla', year: 2020, vehicleType: 'Sedan', seatCapacity: 4 },
    { plateNumber: 'N12350W', make: 'Volkswagen', model: 'Polo', year: 2021, vehicleType: 'Sedan', seatCapacity: 4 },
    { plateNumber: 'N12351W', make: 'Land Rover', model: 'Defender', year: 2023, vehicleType: '4x4', seatCapacity: 6 },
    { plateNumber: 'N12352W', make: 'Isuzu', model: 'NPR', year: 2019, vehicleType: 'Truck', seatCapacity: 3 },
    { plateNumber: 'N12353W', make: 'MAN', model: "Lion's Coach", year: 2020, vehicleType: 'Bus', seatCapacity: 45 },
    { plateNumber: 'CDBOAT01', make: 'Yamaha', model: 'River Cruiser', year: 2022, vehicleType: 'Boat', seatCapacity: 10 },
  ];
  for (const v of vehicles) {
    await withOrg(lam.id, async (tx) => {
      const existing = await tx.vehicle.findFirst({ where: { organizationId: lam.id, plateNumber: v.plateNumber } });
      if (!existing) {
        await tx.vehicle.create({ data: { organizationId: lam.id, ...v } });
      }
    });
  }

  const drivers: Array<{ email: string; name: string; licenseNumber: string; languages: string[] }> = [
    { email: 'driver1@polcotours.com', name: 'Petrus Amutenya', licenseNumber: 'NA-DL-00001', languages: ['en'] },
    { email: 'driver2@polcotours.com', name: 'Frans Nangolo', licenseNumber: 'NA-DL-00002', languages: ['en'] },
    { email: 'driver3@polcotours.com', name: 'Simon Kandjimi', licenseNumber: 'NA-DL-00003', languages: ['en', 'af'] },
    { email: 'driver4@polcotours.com', name: 'David Haufiku', licenseNumber: 'NA-DL-00004', languages: ['en'] },
    { email: 'driver5@polcotours.com', name: 'Andreas Shilongo', licenseNumber: 'NA-DL-00005', languages: ['en'] },
    { email: 'driver6@polcotours.com', name: 'Jean-Pierre Kalonji', licenseNumber: 'CD-DL-00006', languages: ['fr'] },
    { email: 'driver7@polcotours.com', name: 'Patrice Mukendi', licenseNumber: 'CD-DL-00007', languages: ['fr'] },
    { email: 'driver8@polcotours.com', name: 'Joseph Kabongo', licenseNumber: 'CD-DL-00008', languages: ['fr', 'en'] },
    { email: 'driver9@polcotours.com', name: 'Emmanuel Tshisekedi', licenseNumber: 'CD-DL-00009', languages: ['fr'] },
    { email: 'driver10@polcotours.com', name: 'Moise Ilunga', licenseNumber: 'CD-DL-00010', languages: ['fr'] },
  ];
  for (const d of drivers) {
    const user = await prisma.user.upsert({
      where: { email: d.email },
      update: { role: Role.DRIVER, organizationId: lam.id },
      create: { email: d.email, name: d.name, role: Role.DRIVER, organizationId: lam.id, emailVerified: true },
    });
    await withOrg(lam.id, async (tx) => {
      const existing = await tx.driverProfile.findFirst({ where: { userId: user.id } });
      if (!existing) {
        await tx.driverProfile.create({
          data: { organizationId: lam.id, userId: user.id, licenseNumber: d.licenseNumber, languages: d.languages },
        });
      }
    });
  }

  const guides: Array<{ email: string; name: string; languages: string[]; specialties: string[] }> = [
    { email: 'guide1@polcotours.com', name: 'Maria Nghifikwa', languages: ['en'], specialties: ['Wildlife', 'Photography'] },
    { email: 'guide2@polcotours.com', name: 'Helena Iipinge', languages: ['en'], specialties: ['Cultural Tours'] },
    { email: 'guide3@polcotours.com', name: 'Ndeshi Amupolo', languages: ['en', 'af'], specialties: ['Desert Trekking'] },
    { email: 'guide4@polcotours.com', name: 'Selma Uugwanga', languages: ['en'], specialties: ['Wildlife'] },
    { email: 'guide5@polcotours.com', name: 'Tuyeni Nakale', languages: ['en'], specialties: ['Family Tours'] },
    { email: 'guide6@polcotours.com', name: 'Chantal Mbuyi', languages: ['fr'], specialties: ['Gorilla Trekking'] },
    { email: 'guide7@polcotours.com', name: 'Grace Kabeya', languages: ['fr'], specialties: ['Cultural Tours'] },
    { email: 'guide8@polcotours.com', name: 'Aline Mwamba', languages: ['fr', 'en'], specialties: ['River Tours'] },
    { email: 'guide9@polcotours.com', name: 'Bijoux Kasongo', languages: ['fr'], specialties: ['Wildlife'] },
    { email: 'guide10@polcotours.com', name: 'Divine Ngoy', languages: ['fr'], specialties: ['Adventure'] },
  ];
  for (const g of guides) {
    const user = await prisma.user.upsert({
      where: { email: g.email },
      update: { role: Role.TOUR_GUIDE, organizationId: lam.id },
      create: { email: g.email, name: g.name, role: Role.TOUR_GUIDE, organizationId: lam.id, emailVerified: true },
    });
    await withOrg(lam.id, async (tx) => {
      const existing = await tx.guideProfile.findFirst({ where: { userId: user.id } });
      if (!existing) {
        await tx.guideProfile.create({
          data: { organizationId: lam.id, userId: user.id, languages: g.languages, specialties: g.specialties },
        });
      }
    });
  }

  // --- Role permissions (User Management / permission-matrix editor,
  // DR-035) -- one-time seed of the historical DEFAULT_PERMISSIONS map into
  // the DB-backed RolePermission table. SUPERADMIN deliberately excluded:
  // it never gets rows, staying a hardcoded wildcard in rbac.ts's can().
  // `update: {}` makes this create-if-missing, not a resync -- re-running
  // this seed must never clobber a SUPERADMIN's live edit made via
  // /staff/admin/permissions after the initial seed. ---
  let rolePermissionCount = 0;
  for (const role of EDITABLE_ROLES) {
    for (const permission of DEFAULT_PERMISSIONS[role]) {
      await prisma.rolePermission.upsert({
        where: { role_permission: { role: role as Role, permission } },
        update: {},
        create: { role: role as Role, permission },
      });
      rolePermissionCount++;
    }
  }

  console.log('Seeded:', {
    operator: lam.name,
    superadmin: admin.email,
    taxRates: taxes.length,
    platformRate: existingPlatformRate ? 'already configured' : '5% seeded',
    countryRegulations: countryRegulations.length,
    addonServices: addons.length,
    packages: packages.length,
    vehicles: vehicles.length,
    drivers: drivers.length,
    guides: guides.length,
    rolePermissions: rolePermissionCount,
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

// POLCO TOURS — database seed (Phase 0)
// Real launch records: single operator "Lam" (Namibia + DRC) with SUPERADMIN,
// and per-country effective-dated tax (DRC 16% / Namibia 15%). DR-005 / DR-006.
import { PrismaClient, Role, OrgStatus, AddonCode, Currency, PackageTag, PackageStatus } from '@prisma/client';
import { formatPackageReference } from '@modules/catalog';
import { withOrg } from '@lib/db';

const prisma = new PrismaClient();

async function main() {
  // --- Operator tenant: Lam ---
  // Zambia (ZM) + Zimbabwe (ZW) added alongside Namibia/DRC (DR-034, full
  // platform expansion, explicit user choice); Botswana (BW) added DR-218 --
  // `update` here (not `{}`) so re-running this seed against the
  // already-provisioned Lam org actually adds the new countries, not just
  // on first create.
  const lam = await prisma.organization.upsert({
    where: { id: '00000000-0000-4000-8000-000000000001' },
    update: { countries: ['NA', 'CD', 'ZM', 'ZW', 'BW'] },
    create: {
      id: '00000000-0000-4000-8000-000000000001',
      name: 'Lam',
      countries: ['NA', 'CD', 'ZM', 'ZW', 'BW'],
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
  // Zambia/Zimbabwe/Botswana rates below are reasonable estimates, not
  // verified figures -- same "effective-dated, verify against the real
  // revenue authority" caveat CLAUDE.md already applies to Namibia/DRC
  // (DR-034).
  const taxes = [
    { country: 'CD', rateBp: 1600 }, // DRC VAT 16%
    { country: 'NA', rateBp: 1500 }, // Namibia VAT 15%
    { country: 'ZM', rateBp: 1600 }, // Zambia VAT 16% (estimate, verify against ZRA)
    { country: 'ZW', rateBp: 1500 }, // Zimbabwe VAT 15% (estimate, verify against ZIMRA)
    { country: 'BW', rateBp: 1400 }, // Botswana VAT 14% (DR-218, estimate, verify against BURS)
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

  // --- Late booking rate (Settings module, DR-198) -- a guest whose travel
  // date is under 21 days away pays in full only, with a 5% surcharge on
  // top (explicit user figures). A single global rate, not per-country.
  const existingLateBookingRate = await prisma.lateBookingRate.findFirst({ where: { validTo: null } });
  if (!existingLateBookingRate) {
    await prisma.lateBookingRate.create({ data: { thresholdDays: 21, surchargeRateBp: 500 } });
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
    {
      // DR-218 -- researched from general public sources (Botswana e-Visa
      // portal, Botswana Tourism Organisation, Wikipedia's visa-policy
      // summary), NOT verified against Botswana's Department of Immigration
      // and Citizenship (DIC) directly. Same "draft, flag, verify before
      // treating as authoritative" posture as every other row here --
      // SUPERADMIN should confirm via /staff/country-regulations before
      // relying on this for a real booking.
      country: 'BW',
      visaRequirements:
        'Visa-exempt for tourist/business stays of up to 90 days for most Commonwealth, EU, US, and SADC-region nationalities; a smaller list of nationalities need a visa. Botswana runs an e-Visa system (launched 2021) for every nationality that does need one -- apply online or via Form 1 at an embassy/consulate/immigration office, typically decided in 7-14 working days. A KAZA UniVisa (where available, issued by Zambia or Zimbabwe) covers cross-border day trips into Botswana via the Kazungula crossing. Verify current requirements against the Department of Immigration and Citizenship (DIC) or the nearest Botswana embassy before travel -- NEEDS VERIFICATION.',
      requiredDocuments:
        'Passport valid 6+ months beyond both arrival and departure dates with 3+ blank pages, a completed visa application (online e-Visa or Form 1) where a visa is required, proof of onward/return travel, and proof of accommodation.',
      processingTimeDays: 10,
      entryConditions:
        'Yellow fever vaccination certificate required only if arriving from a country with yellow-fever transmission risk. Standard immigration/customs screening on arrival.',
      embassyName: 'Botswana Department of Immigration and Citizenship (DIC)',
      healthRequirements:
        'Malaria risk in the north (Okavango Delta, Chobe, Linyanti) -- prophylaxis recommended for travel to these regions; lower risk in Gaborone and the south. Yellow fever certificate required only if arriving from an endemic country.',
      travelAdvisories:
        'Generally stable and low-risk for tourism. The Okavango Delta and Chobe river-front areas are remote wilderness with free-roaming wildlife (elephant, hippo, big cats) -- follow lodge/guide safety briefings closely, especially after dark.',
      specialRestrictions:
        'Self-driving into remote areas of the Okavango Delta/Central Kalahari requires a 4x4, sufficient fuel/water reserves, and (in national parks) a valid park permit -- most visitors go with a licensed operator/guide instead.',
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
    // DR-238: FLIGHT_TICKET/ESIM's real price comes from FlightFareRate/
    // EsimDataPlanRate (a guest-picked variant), resolved live in
    // bookingService.setAddons (see that method's own DR-222 comment) --
    // priceMinor here is a required-but-unused placeholder, never read for
    // pricing these two codes.
    { code: AddonCode.FLIGHT_TICKET, name: 'Flight ticket', description: 'A booked flight ticket for the trip', priceMinor: 0 },
    { code: AddonCode.ESIM, name: 'eSIM data plan', description: 'A prepaid eSIM data plan for the trip', priceMinor: 0 },
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
            status: PackageStatus.PUBLISHED_AVAILABLE,
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

  // DR-245: specialties now draws from the PackageTag enum (same vocabulary
  // as TourPackage.tags) instead of freeform descriptive strings -- each
  // guide's old freeform value is mapped to its closest tag below (e.g.
  // "Gorilla Trekking"/"Desert Trekking" -> the closest matching tag; a
  // second freeform value with no tag equivalent, like guide1's
  // "Photography", is simply dropped rather than forced into a tag it isn't).
  const guides: Array<{ email: string; name: string; languages: string[]; specialties: PackageTag[] }> = [
    { email: 'guide1@polcotours.com', name: 'Maria Nghifikwa', languages: ['en'], specialties: ['WILDLIFE'] },
    { email: 'guide2@polcotours.com', name: 'Helena Iipinge', languages: ['en'], specialties: ['CULTURE'] },
    { email: 'guide3@polcotours.com', name: 'Ndeshi Amupolo', languages: ['en', 'af'], specialties: ['ADVENTURE'] },
    { email: 'guide4@polcotours.com', name: 'Selma Uugwanga', languages: ['en'], specialties: ['WILDLIFE'] },
    { email: 'guide5@polcotours.com', name: 'Tuyeni Nakale', languages: ['en'], specialties: ['FAMILY'] },
    { email: 'guide6@polcotours.com', name: 'Chantal Mbuyi', languages: ['fr'], specialties: ['WILDLIFE'] },
    { email: 'guide7@polcotours.com', name: 'Grace Kabeya', languages: ['fr'], specialties: ['CULTURE'] },
    { email: 'guide8@polcotours.com', name: 'Aline Mwamba', languages: ['fr', 'en'], specialties: ['ADVENTURE'] },
    { email: 'guide9@polcotours.com', name: 'Bijoux Kasongo', languages: ['fr'], specialties: ['WILDLIFE'] },
    { email: 'guide10@polcotours.com', name: 'Divine Ngoy', languages: ['fr'], specialties: ['ADVENTURE'] },
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

  // --- Starlink kits (DR-059) -- 10 real kits, deliberately all unassigned
  // (vehicleId left null) per explicit user request, so there's real data to
  // browse/delete on the fleet dashboard without implying any of the 10
  // seeded vehicles above already has one fitted. ---
  const starlinkKitIds = Array.from({ length: 10 }, (_, i) => `SL-${String(i + 1).padStart(4, '0')}`);
  for (const kitId of starlinkKitIds) {
    await withOrg(lam.id, async (tx) => {
      const existing = await tx.starlinkKit.findFirst({ where: { organizationId: lam.id, kitId } });
      if (!existing) {
        await tx.starlinkKit.create({ data: { organizationId: lam.id, kitId } });
      }
    });
  }

  // --- Hotels + Restaurants (Itinerary Management, DR-033) -- 10 of each,
  // spread across all 4 platform countries, so the itinerary hotel/
  // restaurant-assignment UI has real reference data to pick from instead of
  // an empty list. Names are illustrative, not verified real-world listings
  // -- same "demo data, not verified fact" posture as the country
  // regulations content above. ---
  const hotels: Array<{ name: string; country: string }> = [
    { name: 'Windhoek Country Club Resort', country: 'NA' },
    { name: 'Etosha Safari Lodge', country: 'NA' },
    { name: 'Sossusvlei Desert Lodge', country: 'NA' },
    { name: 'Pullman Kinshasa Grand Hotel', country: 'CD' },
    { name: 'Mikeno Lodge', country: 'CD' },
    { name: 'Lubumbashi Grand Karavia Hotel', country: 'CD' },
    { name: 'Royal Livingstone Victoria Falls Zambia Hotel', country: 'ZM' },
    { name: 'Protea Hotel Lusaka', country: 'ZM' },
    { name: 'Victoria Falls Hotel', country: 'ZW' },
    { name: 'Elephant Hills Resort', country: 'ZW' },
  ];
  for (const h of hotels) {
    await withOrg(lam.id, async (tx) => {
      const existing = await tx.hotel.findFirst({ where: { organizationId: lam.id, name: h.name, country: h.country } });
      if (!existing) {
        await tx.hotel.create({ data: { organizationId: lam.id, ...h } });
      }
    });
  }

  const restaurants: Array<{ name: string; country: string }> = [
    { name: "Joe's Beerhouse", country: 'NA' },
    { name: 'The Stellenbosch Wine Bar & Bistro', country: 'NA' },
    { name: 'Onguma Bush Camp Restaurant', country: 'NA' },
    { name: 'Chez Ntemba', country: 'CD' },
    { name: 'Restaurant Le Firenze', country: 'CD' },
    { name: 'Le Massaï Grill', country: 'CD' },
    { name: 'The Bridge Restaurant', country: 'ZM' },
    { name: 'Marlin Restaurant', country: 'ZM' },
    { name: 'The Kingdom at Victoria Falls Restaurant', country: 'ZW' },
    { name: 'Mama Africa Eating House', country: 'ZW' },
  ];
  for (const r of restaurants) {
    await withOrg(lam.id, async (tx) => {
      const existing = await tx.restaurant.findFirst({ where: { organizationId: lam.id, name: r.name, country: r.country } });
      if (!existing) {
        await tx.restaurant.create({ data: { organizationId: lam.id, ...r } });
      }
    });
  }

  // --- CMS module (DR-071, renamed from `content` in DR-162): About page +
  // FAQ list, EN + FR, seeded so the guest /about and /faq pages have real
  // content the moment the module ships instead of rendering empty until a
  // SUPERADMIN fills them in by hand. French is a genuine, independently-
  // worded translation (not a literal port of the English) -- same bar the
  // pre-existing Nav/Footer/HomePage French already meets. ---
  const siteContent: Array<{ key: string; locale: string; title: string; body: string; eyebrow?: string }> = [
    {
      key: 'about',
      locale: 'en',
      title: 'Built for real trips across four countries',
      body: [
        "Polco Tours runs the booking and operations side of Visit Kasai & Mufasa Safaris and Tours -- a platform Cyber PolCo built to eventually work in every African country, starting right here in Namibia, the Democratic Republic of Congo, Zambia, and Zimbabwe.",
        "One system handles both sides of a trip: the packages you browse, and everything behind them -- guides, drivers, vehicles, hotels, visa paperwork. As a traveler, that means you can browse real departures or answer a few quick questions to get matched to one, then book as a guest, no account and no password required. Add your fellow travelers, upload a passport, and you're done in one sitting -- with a reference code to check on things whenever you like.",
        "We're still early days. The platform keeps growing week by week, and we'd rather tell you that plainly than oversell where things stand.",
      ].join('\n\n'),
    },
    {
      key: 'about',
      locale: 'fr',
      title: 'Pensé pour de vrais voyages, dans quatre pays',
      body: [
        "Polco Tours gère la réservation et les opérations de Visit Kasai & Mufasa Safaris and Tours -- une plateforme conçue par Cyber PolCo avec l'ambition de couvrir, un jour, tout le continent africain. On commence ici : la Namibie, la République démocratique du Congo, la Zambie et le Zimbabwe.",
        "Un seul système pour les deux faces du voyage : les circuits que vous parcourez, et tout ce qui les fait fonctionner -- guides, chauffeurs, véhicules, hôtels, démarches de visa. Côté voyageur, cela veut dire parcourir de vrais départs ou répondre à quelques questions pour qu'on vous propose le bon circuit, puis réserver en tant qu'invité, sans compte ni mot de passe. Ajoutez vos compagnons de voyage, téléversez un passeport, et c'est réglé en une seule fois -- avec un code de référence pour suivre votre dossier quand vous le souhaitez.",
        "On est encore au tout début. La plateforme grandit de semaine en semaine, et on préfère vous le dire franchement plutôt que d'en faire trop.",
      ].join('\n\n'),
    },
    // DR-181 (explicit user request): every other guest page wired to CMS
    // (DR-164) but never yet edited by staff shows up BLANK in /staff/cms --
    // the guest site itself looks fine (it falls back to these exact
    // next-intl strings), but there's nothing for staff to actually tweak,
    // only an empty box to write from scratch. Seeding the *current*
    // fallback text as each page's starting CmsTextBlock row (via the same
    // upsert-with-update:{} below, so this can never clobber a real staff
    // edit already in place) turns every one of these into a real edit
    // instead of a blank-page rewrite. `packages` never had a body fallback
    // at all (schema requires one) -- newly authored here, same voice as
    // the rest. `contact.office.{namibia,drc}` never had a single fallback
    // *string* either (the page renders 3 separate translated dt/dd lines
    // when body is null) -- seeded as the closest single-body equivalent of
    // that exact pending display, still just a placeholder for staff to
    // replace with the real address once available (OI-02/03).
    { key: 'rate', locale: 'en', eyebrow: 'Rate your trip', title: 'Share your feedback', body: 'Enter your booking reference and the Rating Code you were sent — available once your tour is complete.' },
    { key: 'rate', locale: 'fr', eyebrow: 'Évaluer mon voyage', title: 'Partagez votre avis', body: "Saisissez votre référence de réservation et le code d'évaluation qui vous a été envoyé — disponible une fois votre voyage terminé." },
    { key: 'terms', locale: 'en', eyebrow: 'Terms & Policies', title: 'Terms of service & policies', body: "We're still putting the finishing touches on our terms of service and our privacy, cancellation, and refund policies — check back soon." },
    { key: 'terms', locale: 'fr', eyebrow: 'Conditions et politiques', title: "Conditions d'utilisation et politiques", body: "Nous mettons encore la dernière main à nos conditions d'utilisation ainsi qu'à nos politiques de confidentialité, d'annulation et de remboursement — repassez bientôt." },
    { key: 'plan-my-trip', locale: 'en', eyebrow: 'Plan my trip', title: 'Tell us what you have in mind', body: 'Answer a few questions about the trip you want and our team will send you a quotation.' },
    // "envoyra" (not "enverra") preserved verbatim -- the exact live typo
    // staff will now be able to fix themselves via the editor.
    { key: 'plan-my-trip', locale: 'fr', eyebrow: 'Planifier mon voyage', title: 'Dites-nous ce que vous avez en tête', body: 'Répondez à quelques questions sur le voyage que vous souhaitez et notre équipe vous envoyra un devis.' },
    { key: 'find-booking', locale: 'en', eyebrow: 'Find my booking', title: 'Look up a booking', body: "Enter your booking reference, plus the tour lead's last name." },
    { key: 'find-booking', locale: 'fr', eyebrow: 'Retrouver ma réservation', title: 'Rechercher une réservation', body: "Saisissez votre référence de réservation, ainsi que le nom de famille du chef de groupe." },
    { key: 'weather', locale: 'en', eyebrow: 'Weather', title: 'Weather where we operate', body: 'Current conditions for our main towns, grouped by country — tap a town for a forecast and seasonal travel notes.' },
    { key: 'weather', locale: 'fr', eyebrow: 'Météo', title: 'La météo là où nous opérons', body: 'Conditions actuelles pour nos principales villes, regroupées par pays — cliquez sur une ville pour ses prévisions et des notes saisonnières.' },
    { key: 'gallery', locale: 'en', eyebrow: 'Gallery', title: 'Where you could be headed', body: "Real destination photography is still on our to-do list, so what you're seeing here are illustrated stand-ins, not photos — tap a picture for a closer look, or a destination's name to start planning a trip there." },
    { key: 'gallery', locale: 'fr', eyebrow: 'Galerie', title: 'Vos prochaines destinations', body: "De vraies photos de nos destinations arrivent bientôt — en attendant, ce sont des illustrations, pas des clichés. Cliquez sur une image pour l'agrandir, ou sur le nom d'une destination pour commencer à planifier votre voyage." },
    { key: 'packages', locale: 'en', eyebrow: 'Browse', title: 'Tour packages', body: 'Browse every package we currently offer — filter by country or search by name.' },
    { key: 'packages', locale: 'fr', eyebrow: 'Découvrir', title: 'Circuits touristiques', body: 'Parcourez tous les circuits que nous proposons actuellement — filtrez par pays ou recherchez par nom.' },
    { key: 'contact', locale: 'en', eyebrow: 'Contact', title: 'Get in touch', body: "Both our offices are listed below — we're still filling in the details, so bear with us." },
    { key: 'contact', locale: 'fr', eyebrow: 'Contact', title: 'Contactez-nous', body: 'Nos deux bureaux sont indiqués ci-dessous — les coordonnées complètes arrivent bientôt, merci de votre patience.' },
    { key: 'contact.office.namibia', locale: 'en', title: 'Namibia office', body: 'Address — on its way\nEmail — on its way\nPhone — on its way' },
    { key: 'contact.office.namibia', locale: 'fr', title: 'Bureau de Namibie', body: 'Adresse — à venir\nE-mail — à venir\nTéléphone — à venir' },
    { key: 'contact.office.drc', locale: 'en', title: 'DR Congo office', body: 'Address — on its way\nEmail — on its way\nPhone — on its way' },
    { key: 'contact.office.drc', locale: 'fr', title: 'Bureau de RDC', body: 'Adresse — à venir\nE-mail — à venir\nTéléphone — à venir' },
    // DR-202: homepage "Where we operate" map -- same fallback text
    // (src/messages/{en,fr}.json's HomePage.map*) seeded as the starting
    // CmsTextBlock row, same "current fallback becomes the first real edit"
    // convention as the rows above.
    { key: 'home-map', locale: 'en', eyebrow: 'Where we operate', title: 'Namibia & the DRC, on the map', body: "Hover Namibia or DR Congo once you've zoomed in for a quick snapshot of each country." },
    { key: 'home-map', locale: 'fr', eyebrow: 'Où nous opérons', title: 'La Namibie et la RDC, sur la carte', body: 'Survolez la Namibie ou la RD Congo après avoir zoomé pour un aperçu rapide de chaque pays.' },
  ];
  for (const c of siteContent) {
    await prisma.cmsTextBlock.upsert({
      where: { key_locale: { key: c.key, locale: c.locale } },
      update: {},
      create: { key: c.key, locale: c.locale, title: c.title, body: c.body, eyebrow: c.eyebrow ?? null },
    });
  }

  // CmsOperatingCountry (DR-202) -- the 4 countries the homepage map already
  // highlighted (hardcoded, DR-034) become the starting staff-editable rows,
  // same facts that used to live in the now-removed src/lib/country-facts.ts,
  // so production keeps showing the exact same map the moment this ships.
  // `update: {}` -- never clobbers a real staff edit already in place.
  const operatingCountries: Array<{
    countryCode: string;
    capital: string;
    languages: string;
    currency: string;
    population: string;
    areaKm2: string;
    sortOrder: number;
  }> = [
    {
      countryCode: 'NA',
      capital: 'Windhoek',
      languages: 'English (official); Afrikaans, German, Oshiwambo widely spoken',
      currency: 'Namibian Dollar (NAD)',
      population: '~2.6 million (est.)',
      areaKm2: '~825,615 km²',
      sortOrder: 0,
    },
    {
      countryCode: 'CD',
      capital: 'Kinshasa',
      languages: 'French (official); Lingala, Kikongo, Swahili, Tshiluba',
      currency: 'Congolese Franc (CDF)',
      population: '~102 million (est.)',
      areaKm2: '~2,345,410 km²',
      sortOrder: 1,
    },
    {
      countryCode: 'ZM',
      capital: 'Lusaka',
      languages: 'English (official); Bemba, Nyanja, Tonga, and other Bantu languages',
      currency: 'Zambian Kwacha (ZMW)',
      population: '~20 million (est.)',
      areaKm2: '~752,618 km²',
      sortOrder: 2,
    },
    {
      countryCode: 'ZW',
      capital: 'Harare',
      languages: 'English, Shona, Ndebele (official, among 16 recognized languages)',
      currency: 'US Dollar (widely used); Zimbabwe Gold (ZWG)',
      population: '~16 million (est.)',
      areaKm2: '~390,757 km²',
      sortOrder: 3,
    },
  ];
  for (const c of operatingCountries) {
    await prisma.cmsOperatingCountry.upsert({
      where: { countryCode: c.countryCode },
      update: {},
      create: c,
    });
  }

  // Same 10 questions as the pre-migration hardcoded FAQS array, tone-
  // polished, plus a creative (not literal) French translation. The
  // visa/safety/health answers (6-9) keep every hedge/disclaimer from the
  // original wording -- see CLAUDE.md's repeated caution that this content
  // is orientation, not verified legal fact.
  const faqEntries: Array<{ locale: string; sortOrder: number; question: string; answer: string }> = [
    { locale: 'en', sortOrder: 0, question: 'Do I need to create an account?', answer: 'Nope -- you book as a guest. Pick a departure, add your travelers, pay a deposit, no password involved. Afterward you\'ll get a reference code so you can check on your booking whenever you want.' },
    { locale: 'en', sortOrder: 1, question: 'How do I pay?', answer: 'Your booking page shows a deposit (30%) and a balance (70%). Click "Pay deposit" or "Pay balance" when you\'re ready. Right now our team confirms each payment by hand, so give it a little time to show as complete.' },
    { locale: 'en', sortOrder: 2, question: "I lost my booking's page -- how do I find it again?", answer: 'Head to "Find my booking" and enter your reference code plus the tour lead\'s last name.' },
    { locale: 'en', sortOrder: 3, question: 'What do I need to have ready to book?', answer: "Each traveler's name, age, sex, and nationality, plus the tour lead's passport. You'll pick any add-on services in the same flow." },
    { locale: 'en', sortOrder: 4, question: 'What currency will I pay in?', answer: "Whatever currency the package is listed in -- USD, EUR, NAD, or CDF. We don't convert between currencies, so double-check the listing before you book." },
    { locale: 'en', sortOrder: 5, question: 'Do I need a visa to enter Namibia?', answer: "It depends on your nationality -- and the rules shifted twice in 2025, so a number of nationalities that used to be visa-exempt now need an e-visa or visa-on-arrival. Always confirm your specific requirement with the Namibian Ministry of Home Affairs/Immigration or your nearest Namibian embassy before you travel. We'll flag anything we can confirm on your booking, but this isn't legal guidance." },
    { locale: 'en', sortOrder: 6, question: 'Do I need a visa to enter the DRC?', answer: "Most visitors do, arranged in advance -- typically through a licensed local operator (a DMC) working with DRC immigration (DGM). Requirements vary by nationality and purpose of visit, so confirm directly with your nearest DRC embassy or your booking's operator well ahead of travel." },
    { locale: 'en', sortOrder: 7, question: 'Is it safe to travel in the DRC?', answer: "It really depends on the region. Kinshasa and western DRC are generally accessible to visitors; some areas further east carry an elevated risk or call for specialist arrangements, and a few provinces aren't currently recommended for tourism at all. We only sell packages into areas our operators consider appropriate, and advisory details can change -- always check your own government's official travel advisory too." },
    { locale: 'en', sortOrder: 8, question: 'Do I need proof of yellow fever vaccination?', answer: "If you're arriving from -- or recently passed through -- a country with yellow fever risk, Namibia, the DRC, Zambia, and Zimbabwe may all ask for proof of vaccination at the border. Malaria risk is also present in parts of each country. Check current requirements with your travel clinic or the relevant embassy before you go." },
    { locale: 'en', sortOrder: 9, question: 'Do I need a visa to enter Zambia or Zimbabwe?', answer: "Most visitors can get a visa on arrival or apply for an e-visa beforehand, and some nationalities are visa-exempt for short stays. Where available, the joint KAZA UniVisa covers both countries plus day trips across the border into Botswana. Requirements vary by nationality, so confirm directly with Zambia's or Zimbabwe's Department of Immigration, or your nearest embassy, before you travel." },
    // Explicit user request (client-perspective expansion), reviewed and
    // approved question-by-question before being added here.
    { locale: "en", sortOrder: 10, question: "What happens if I book very close to my travel date?", answer: "Only full payment is available (no deposit option), plus a small surcharge -- you'll see the exact numbers on the date-picker before you commit to anything." },
    { locale: "en", sortOrder: 11, question: "Can I cancel my booking?", answer: "Yes, as long as it hasn't already been completed, cancelled, or refunded. The option's right there on your booking page; reach out to us directly with questions about refunds." },
    { locale: "en", sortOrder: 12, question: "Can you help me apply for my visa?", answer: "Yes -- pick Visa Assistance as an add-on, and we'll guide you through uploading your passport and track the application's status on your booking page." },
    { locale: "en", sortOrder: 13, question: "Is the destination country's visa fee included in what I pay you?", answer: "No, that's a separate government fee, not charged today -- we'll let you know when it's due. Visa Assistance doesn't guarantee a visa gets granted." },
    { locale: "en", sortOrder: 14, question: "Can I request a custom trip instead of picking a package?", answer: "Yes, via \"Plan my trip\" -- tell us your destinations, dates, and preferences, and our team sends you a quotation to accept before anything's booked." },
    { locale: "en", sortOrder: 15, question: "What add-on services can I book?", answer: "Photography, videography, a translator, and visa assistance." },
    { locale: "en", sortOrder: 16, question: "How will you contact me about my booking?", answer: "We'll reach out by email first; if that doesn't go through, WhatsApp, then SMS." },
    { locale: "en", sortOrder: 17, question: "Do all travelers in my group need to submit a passport, or just me?", answer: "Only if you've chosen Visa Assistance -- and then it's every traveler, not just the trip leader." },
    { locale: "en", sortOrder: 18, question: "Can I leave a rating for my guide or driver after the trip?", answer: "Yes -- you'll get a one-time rating code afterward." },
    { locale: "en", sortOrder: 19, question: "Can one trip cover more than one country?", answer: "Yes, some packages are combination trips -- the listing shows every country it covers." },
    { locale: "en", sortOrder: 20, question: "Can I book for my whole family or group in one go?", answer: "Yes -- set your seat count, then add each traveler's details before paying." },
    { locale: "en", sortOrder: 21, question: "Do you offer discount codes?", answer: "Yes -- enter a coupon code on your booking page before paying and we'll apply the discount." },
    { locale: "en", sortOrder: 22, question: "Can I get a receipt or invoice for my payment?", answer: "Yes -- downloadable as a PDF, in English or French, from your booking page once a payment succeeds." },
    { locale: "en", sortOrder: 23, question: "Can I check the weather for my trip dates?", answer: "Yes -- our Weather page has current conditions, short forecasts, and seasonal notes for towns across our destinations." },
    { locale: 'fr', sortOrder: 0, question: 'Faut-il créer un compte ?', answer: "Non -- vous réservez en tant qu'invité. Choisissez un départ, ajoutez vos voyageurs, réglez un acompte, sans mot de passe. Vous recevrez ensuite un code de référence pour suivre votre réservation à tout moment." },
    { locale: 'fr', sortOrder: 1, question: 'Comment puis-je payer ?', answer: 'Votre page de réservation indique un acompte (40 %) et un solde (60 %). Cliquez sur « Payer l\'acompte » ou « Payer le solde » quand vous êtes prêt. Pour l\'instant, notre équipe valide chaque paiement manuellement, donc laissez-lui un peu de temps avant qu\'il n\'apparaisse comme réglé.' },
    { locale: 'fr', sortOrder: 2, question: 'J\'ai perdu la page de ma réservation, comment la retrouver ?', answer: "Utilisez « Retrouver ma réservation » avec votre code de référence et le nom de famille du responsable du groupe." },
    { locale: 'fr', sortOrder: 3, question: 'De quoi ai-je besoin pour réserver ?', answer: "Le nom, l'âge, le sexe et la nationalité de chaque voyageur, ainsi que le passeport du responsable du groupe. Les services complémentaires se choisissent dans la même démarche." },
    { locale: 'fr', sortOrder: 4, question: 'Dans quelle devise vais-je payer ?', answer: "Dans la devise indiquée sur le circuit -- USD, EUR, NAD ou CDF. Nous ne convertissons pas les devises entre elles, alors vérifiez bien l'annonce avant de réserver." },
    { locale: 'fr', sortOrder: 5, question: 'Ai-je besoin d\'un visa pour entrer en Namibie ?', answer: "Cela dépend de votre nationalité -- et les règles ont changé deux fois en 2025 : plusieurs nationalités auparavant exemptées doivent désormais obtenir un e-visa ou un visa à l'arrivée. Vérifiez toujours votre situation exacte auprès du ministère namibien de l'Intérieur/de l'Immigration ou de l'ambassade de Namibie la plus proche avant de partir. Nous signalons ce que nous pouvons confirmer sur votre réservation, mais ceci ne constitue pas un avis juridique." },
    { locale: 'fr', sortOrder: 6, question: 'Ai-je besoin d\'un visa pour entrer en RDC ?', answer: "La plupart des visiteurs en ont besoin, à organiser à l'avance -- généralement via un opérateur local agréé (un DMC) en lien avec l'immigration congolaise (DGM). Les conditions varient selon la nationalité et le motif du séjour ; confirmez directement auprès de l'ambassade de RDC la plus proche ou de l'opérateur de votre réservation, bien avant le départ." },
    { locale: 'fr', sortOrder: 7, question: 'Est-il sûr de voyager en RDC ?', answer: "Cela dépend vraiment de la région. Kinshasa et l'ouest du pays restent globalement accessibles aux visiteurs ; certaines zones plus à l'est présentent un risque élevé ou nécessitent des dispositions particulières, et quelques provinces ne sont actuellement pas recommandées pour le tourisme. Nous ne vendons des circuits que dans les zones jugées appropriées par nos opérateurs, et les recommandations peuvent évoluer -- vérifiez toujours aussi les avis officiels de votre propre gouvernement." },
    { locale: 'fr', sortOrder: 8, question: 'Faut-il un certificat de vaccination contre la fièvre jaune ?', answer: "Si vous arrivez d'un pays à risque de fièvre jaune -- ou que vous y avez récemment transité -- la Namibie, la RDC, la Zambie et le Zimbabwe peuvent tous exiger un certificat de vaccination à la frontière. Le risque de paludisme est également présent dans certaines régions de chacun de ces pays. Vérifiez les exigences en vigueur auprès de votre centre de vaccination ou de l'ambassade concernée avant de partir." },
    { locale: 'fr', sortOrder: 9, question: 'Ai-je besoin d\'un visa pour la Zambie ou le Zimbabwe ?', answer: "La plupart des visiteurs peuvent obtenir un visa à l'arrivée ou demander un e-visa au préalable, et certaines nationalités sont exemptées pour les courts séjours. Là où il est proposé, le visa conjoint KAZA UniVisa couvre les deux pays ainsi que les excursions d'une journée vers le Botswana. Les conditions varient selon la nationalité ; confirmez directement auprès du service de l'Immigration zambien ou zimbabwéen, ou de l'ambassade la plus proche, avant de voyager." },
    { locale: "fr", sortOrder: 10, question: "Que se passe-t-il si je réserve très près de ma date de voyage ?", answer: "Seul le paiement intégral est disponible (pas d'acompte), avec une petite majoration -- les montants exacts s'affichent sur le sélecteur de date avant que vous ne vous engagiez." },
    { locale: "fr", sortOrder: 11, question: "Puis-je annuler ma réservation ?", answer: "Oui, tant qu'elle n'est pas déjà terminée, annulée ou remboursée. L'option se trouve directement sur votre page de réservation ; contactez-nous directement pour toute question sur les remboursements." },
    { locale: "fr", sortOrder: 12, question: "Pouvez-vous m'aider à faire ma demande de visa ?", answer: "Oui -- choisissez l'option Assistance visa parmi les services complémentaires, et nous vous guiderons pour téléverser votre passeport et suivre l'état de votre demande sur votre page de réservation." },
    { locale: "fr", sortOrder: 13, question: "Les frais de visa du pays de destination sont-ils inclus dans ce que je vous paie ?", answer: "Non, il s'agit de frais gouvernementaux distincts, non facturés aujourd'hui -- nous vous préviendrons quand ils seront dus. L'assistance visa ne garantit pas l'obtention du visa." },
    { locale: "fr", sortOrder: 14, question: "Puis-je demander un voyage sur mesure plutôt que de choisir un circuit ?", answer: "Oui, via « Organiser mon voyage » -- indiquez-nous vos destinations, dates et préférences, et notre équipe vous enverra un devis à accepter avant toute réservation." },
    { locale: "fr", sortOrder: 15, question: "Quels services complémentaires puis-je réserver ?", answer: "Photographie, vidéographie, traducteur et assistance visa." },
    { locale: "fr", sortOrder: 16, question: "Comment allez-vous me contacter au sujet de ma réservation ?", answer: "Nous vous contacterons d'abord par e-mail ; si cela ne fonctionne pas, par WhatsApp, puis par SMS." },
    { locale: "fr", sortOrder: 17, question: "Tous les voyageurs de mon groupe doivent-ils fournir un passeport, ou seulement moi ?", answer: "Seulement si vous avez choisi l'assistance visa -- et dans ce cas, chaque voyageur doit en fournir un, pas seulement le responsable du groupe." },
    { locale: "fr", sortOrder: 18, question: "Puis-je laisser un avis sur mon guide ou mon chauffeur après le voyage ?", answer: "Oui -- vous recevrez un code d'évaluation à usage unique après votre voyage." },
    { locale: "fr", sortOrder: 19, question: "Un même voyage peut-il couvrir plusieurs pays ?", answer: "Oui, certains circuits combinent plusieurs pays -- l'annonce indique tous les pays concernés." },
    { locale: "fr", sortOrder: 20, question: "Puis-je réserver pour toute ma famille ou mon groupe en une seule fois ?", answer: "Oui -- indiquez le nombre de places, puis ajoutez les informations de chaque voyageur avant de payer." },
    { locale: "fr", sortOrder: 21, question: "Proposez-vous des codes de réduction ?", answer: "Oui -- saisissez un code promo sur votre page de réservation avant de payer, et la réduction sera appliquée." },
    { locale: "fr", sortOrder: 22, question: "Puis-je obtenir un reçu ou une facture pour mon paiement ?", answer: "Oui -- téléchargeable en PDF, en anglais ou en français, depuis votre page de réservation dès qu'un paiement est validé." },
    { locale: "fr", sortOrder: 23, question: "Puis-je consulter la météo pour les dates de mon voyage ?", answer: "Oui -- notre page Météo propose les conditions actuelles, de courtes prévisions et des notes saisonnières pour des villes dans nos destinations." },
  ];
  for (const f of faqEntries) {
    const existing = await prisma.cmsFaqEntry.findFirst({ where: { locale: f.locale, question: f.question } });
    if (!existing) {
      await prisma.cmsFaqEntry.create({ data: f });
    }
  }

  // DR-159 (reverses DR-035): role permissions are no longer DB-seeded --
  // rbac.ts's ROLE_PERMISSIONS is a hardcoded in-code map now, consulted
  // directly, so there is no RolePermission table left to seed.

  // --- Home hero slides (DR-163) -- one-time seed of the 3 original
  // hardcoded slides under fixed slotKeys, so /staff/cms's Home Hero
  // section has something real to show/edit from the moment this ships,
  // matching exactly what the homepage already renders today (the
  // fallback in (guest)/page.tsx if this is skipped/re-run is identical
  // text/image/gradient, so nothing visually changes either way). ---
  const heroSlides: Array<{
    slotKey: string;
    image: string;
    gradient: string;
    sortOrder: number;
    en: { eyebrow: string; headline: string; lede: string };
    fr: { eyebrow: string; headline: string; lede: string };
  }> = [
    {
      slotKey: 'sossusvlei',
      image: '/images/hero/sossusvlei.png',
      gradient: 'linear-gradient(100deg, rgba(59,31,58,0.92) 0%, rgba(59,31,58,0.6) 32%, rgba(214,91,46,0.28) 56%, rgba(214,91,46,0) 80%)',
      sortOrder: 0,
      en: {
        eyebrow: 'Namibia · Sossusvlei',
        headline: "Chase some of the world's tallest dunes at first light.",
        lede: 'Book a real trip in minutes — no account, no hold music. A person on our end plans it with you.',
      },
      fr: {
        eyebrow: 'Namibie · Sossusvlei',
        headline: 'Défiez certaines des plus hautes dunes du monde au lever du jour.',
        lede: "Réservez un vrai voyage en quelques minutes -- sans compte, sans attente au téléphone. Une vraie personne planifie votre voyage avec vous.",
      },
    },
    {
      slotKey: 'virunga',
      image: '/images/hero/virunga.png',
      gradient: 'linear-gradient(100deg, rgba(15,25,20,0.94) 0%, rgba(15,25,20,0.75) 40%, rgba(18,43,44,0.4) 62%, rgba(47,110,79,0) 85%)',
      sortOrder: 1,
      en: {
        eyebrow: 'DR Congo · Virunga',
        headline: "Sit with mountain gorillas in Africa's oldest park.",
        lede: 'Licensed local guides, permits arranged for you, and a briefing on exactly what to expect.',
      },
      fr: {
        eyebrow: 'RD Congo · Virunga',
        headline: "Approchez les gorilles des montagnes dans le plus ancien parc d'Afrique.",
        lede: 'Guides locaux agréés, permis obtenus pour vous, et un briefing complet avant le départ.',
      },
    },
    {
      slotKey: 'victoria-falls',
      image: '/images/hero/victoria-falls.png',
      gradient: 'linear-gradient(100deg, rgba(18,34,47,0.92) 0%, rgba(18,34,47,0.6) 32%, rgba(42,107,120,0.28) 56%, rgba(42,107,120,0) 80%)',
      sortOrder: 2,
      en: {
        eyebrow: 'Zambia & Zimbabwe · Victoria Falls',
        headline: 'Stand where the Zambezi turns to smoke and thunder.',
        lede: 'Mosi-oa-Tunya up close — plus everything else the Falls region has on either bank.',
      },
      fr: {
        eyebrow: 'Zambie et Zimbabwe · Chutes Victoria',
        headline: 'Tenez-vous là où le Zambèze se change en fumée et en tonnerre.',
        lede: 'Mosi-oa-Tunya de près -- et tout ce que la région des chutes offre sur les deux rives.',
      },
    },
  ];
  for (const slide of heroSlides) {
    await prisma.cmsMediaItem.upsert({
      where: { page_slotKey: { page: 'home-hero', slotKey: slide.slotKey } },
      update: {},
      create: {
        page: 'home-hero',
        slotKey: slide.slotKey,
        mediaType: 'image',
        url: slide.image,
        overlayGradient: slide.gradient,
        sortOrder: slide.sortOrder,
      },
    });
    for (const locale of ['en', 'fr'] as const) {
      const text = slide[locale];
      await prisma.cmsTextBlock.upsert({
        where: { key_locale: { key: `home-hero.${slide.slotKey}`, locale } },
        update: {},
        create: { key: `home-hero.${slide.slotKey}`, locale, title: text.headline, body: text.lede, eyebrow: text.eyebrow },
      });
    }
  }

  // --- Gallery sites (DR-167) -- one-time seed of the 20 originally-
  // hardcoded DESTINATION_SITES entries as real CmsMediaItem rows (that
  // static file is now retired), so /gallery and the plan-my-trip wizard's
  // "sites to visit" step render identically to before this shipped, and
  // staff has real rows to edit rather than a blank list. `slotKey` is a
  // stable slug of each site's ORIGINAL name, chosen once here -- staff
  // can freely rename `name` afterward without it ever changing (a rename
  // must never orphan a site's photo/video). sortOrder preserves the
  // original array's NA -> CD -> ZM -> ZW grouping. No media/description
  // seeded -- no real photos exist for any of these today either. ---
  const gallerySites: Array<{ slotKey: string; name: string; country: string; sortOrder: number }> = [
    { slotKey: 'etosha-national-park', name: 'Etosha National Park', country: 'NA', sortOrder: 0 },
    { slotKey: 'sossusvlei', name: 'Sossusvlei', country: 'NA', sortOrder: 1 },
    { slotKey: 'fish-river-canyon', name: 'Fish River Canyon', country: 'NA', sortOrder: 2 },
    { slotKey: 'skeleton-coast', name: 'Skeleton Coast', country: 'NA', sortOrder: 3 },
    { slotKey: 'swakopmund', name: 'Swakopmund', country: 'NA', sortOrder: 4 },
    { slotKey: 'caprivi-strip', name: 'Caprivi Strip', country: 'NA', sortOrder: 5 },
    { slotKey: 'windhoek', name: 'Windhoek', country: 'NA', sortOrder: 6 },
    { slotKey: 'virunga-national-park', name: 'Virunga National Park', country: 'CD', sortOrder: 7 },
    { slotKey: 'kahuzi-biega-national-park', name: 'Kahuzi-Biéga National Park', country: 'CD', sortOrder: 8 },
    { slotKey: 'congo-river', name: 'Congo River', country: 'CD', sortOrder: 9 },
    { slotKey: 'kinshasa', name: 'Kinshasa', country: 'CD', sortOrder: 10 },
    { slotKey: 'salonga-national-park', name: 'Salonga National Park', country: 'CD', sortOrder: 11 },
    { slotKey: 'victoria-falls-zambia-side', name: 'Victoria Falls (Zambia side)', country: 'ZM', sortOrder: 12 },
    { slotKey: 'south-luangwa-national-park', name: 'South Luangwa National Park', country: 'ZM', sortOrder: 13 },
    { slotKey: 'lower-zambezi-national-park', name: 'Lower Zambezi National Park', country: 'ZM', sortOrder: 14 },
    { slotKey: 'livingstone', name: 'Livingstone', country: 'ZM', sortOrder: 15 },
    { slotKey: 'victoria-falls-zimbabwe-side', name: 'Victoria Falls (Zimbabwe side)', country: 'ZW', sortOrder: 16 },
    { slotKey: 'hwange-national-park', name: 'Hwange National Park', country: 'ZW', sortOrder: 17 },
    { slotKey: 'mana-pools-national-park', name: 'Mana Pools National Park', country: 'ZW', sortOrder: 18 },
    { slotKey: 'great-zimbabwe-ruins', name: 'Great Zimbabwe Ruins', country: 'ZW', sortOrder: 19 },
  ];
  for (const site of gallerySites) {
    await prisma.cmsMediaItem.upsert({
      where: { page_slotKey: { page: 'gallery', slotKey: site.slotKey } },
      update: {},
      create: { page: 'gallery', slotKey: site.slotKey, name: site.name, country: site.country, sortOrder: site.sortOrder },
    });
  }

  console.log('Seeded:', {
    operator: lam.name,
    superadmin: admin.email,
    taxRates: taxes.length,
    platformRate: existingPlatformRate ? 'already configured' : '5% seeded',
    lateBookingRate: existingLateBookingRate ? 'already configured' : '21 days / 5% seeded',
    countryRegulations: countryRegulations.length,
    addonServices: addons.length,
    packages: packages.length,
    vehicles: vehicles.length,
    drivers: drivers.length,
    guides: guides.length,
    starlinkKits: starlinkKitIds.length,
    hotels: hotels.length,
    restaurants: restaurants.length,
    siteContent: siteContent.length,
    faqEntries: faqEntries.length,
    heroSlides: heroSlides.length,
    gallerySites: gallerySites.length,
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

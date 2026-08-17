// One-off CLI, corrected: recomputes every stale PackageCostBreakdown by
// calling the REAL, full financeService.saveCostBreakdown -- not just
// patching in the DR-134 tax/platform-fee layer on top of whatever
// computedSellingPriceMinor already happened to be on file. An earlier
// version of this script did exactly that narrower patch and was wrong: a
// breakdown saved before DR-131/132 shipped (Day-Template-driven
// accommodation/restaurant/activities) has computedAccommodationMinor/
// computedRestaurantMinor/computedActivitiesMinor sitting at null with NO
// contribution to computedBaseCostMinor at all, even though the package's
// own Day Template has real hotels/activities assigned with real
// HotelRate/ActivityFee rows configured for them -- so the previously
// "recomputed" total was still missing an entire cost bucket. Re-running
// the actual saveCostBreakdown (same inputs already on file, nothing
// staff-typed changes) re-resolves accommodation/restaurant/activities from
// the Day Template via Operational Rates AND folds in tax + the platform
// fee (DR-134) in one correct pass -- exactly what re-opening the cost
// breakdown page and clicking Save does.
//
// Unlike the sibling backfill scripts in this directory, this one CANNOT
// bypass the service layer -- resolveRatesForCost's rate resolution (Hotel/
// Restaurant/Activity rates, staff/transport/admin rates, currency
// consistency checks) is real business logic already implemented once in
// financeService.saveCostBreakdown; reimplementing it here by hand would
// duplicate it and risk silently drifting from the real computation this
// script exists to re-run correctly. A plain AuthContext is constructed for
// the seeded bootstrap SUPERADMIN (cyberpolco@gmail.com) instead --
// SUPERADMIN's assertCan/can wildcard bypasses the DB-backed permission set
// entirely (see rbac.ts), so an empty `permissions` set is fine.
//
// Only ever recomputes a breakdown with an active tourPackageId in the
// primary org (DR-005) whose computedAccommodationMinor/
// computedRestaurantMinor/computedActivitiesMinor are ALL still null (the
// unambiguous "never resaved since DR-131/132" signal -- computeCostBuckets
// can produce 0 for one of these, never null, so null can only mean the row
// predates that computation existing at all). Skips (logs, doesn't throw) a
// breakdown with an active override -- same reasoning as the original
// version of this script.
//
// Usage: npx tsx scripts/backfill-price-tax-fee.ts
import { prisma, withOrg } from '@lib/db';
import { getPrimaryOrgId } from '@lib/primary-org';
import type { AuthContext } from '@modules/auth';
import { financeService, type SaveCostBreakdownInput } from '@modules/finance';

const SUPERADMIN_EMAIL = 'cyberpolco@gmail.com';

async function main() {
  const organizationId = await getPrimaryOrgId();

  const admin = await prisma.user.findUnique({ where: { email: SUPERADMIN_EMAIL } });
  if (!admin) throw new Error(`Seeded SUPERADMIN ${SUPERADMIN_EMAIL} not found`);
  const ctx: AuthContext = {
    userId: admin.id,
    roles: ['SUPERADMIN'],
    permissions: new Set(),
    organizationId,
    sessionId: 'backfill-script',
    mustChangePassword: false,
  };

  const stale = await withOrg(organizationId, (tx) =>
    tx.packageCostBreakdown.findMany({
      where: { computedAccommodationMinor: null, computedRestaurantMinor: null, computedActivitiesMinor: null },
      include: { tourPackage: true, lineItems: true },
    }),
  );

  console.log(`Found ${stale.length} pre-DR-131/132 cost breakdown(s) to fully recompute.`);

  let updated = 0;
  let skippedOverridden = 0;
  let failed = 0;

  for (const breakdown of stale) {
    const pkg = breakdown.tourPackage;
    if (breakdown.overridePriceMinor != null) {
      console.log(`Skipping ${pkg.title} (${pkg.packageReference}) -- has an active override, re-save by hand via the staff UI.`);
      skippedOverridden++;
      continue;
    }

    const input: SaveCostBreakdownInput = {
      currency: breakdown.currency,
      referenceGroupSize: breakdown.referenceGroupSize,
      nights: breakdown.nights,
      driverDays: breakdown.driverDays,
      guideDays: breakdown.guideDays,
      photographerDays: breakdown.photographerDays,
      videographerDays: breakdown.videographerDays,
      transportRateId: breakdown.transportRateId ?? undefined,
      transportDays: breakdown.transportDays,
      requiresVisa: breakdown.requiresVisa,
      immigrationCostRateId: breakdown.immigrationCostRateId ?? undefined,
      adminDays: breakdown.adminDays,
      adminCostBasis: breakdown.adminCostBasis,
      agencyMarginBp: breakdown.agencyMarginBp,
      drinkLineItems: breakdown.lineItems.map((li) => ({ foodBeverageRateId: li.foodBeverageRateId, quantityPerPerson: li.quantityPerPerson })),
    };

    try {
      const before = pkg.priceMinor;
      const result = await financeService.saveCostBreakdown(ctx, pkg.id, input);
      const after = await withOrg(organizationId, (tx) => tx.tourPackage.findUniqueOrThrow({ where: { id: pkg.id } }));
      console.log(
        `${pkg.title} (${pkg.packageReference}): priceMinor ${before} -> ${after.priceMinor} ` +
          `[accommodation ${result.computedAccommodationMinor}, restaurant ${result.computedRestaurantMinor}, ` +
          `activities ${result.computedActivitiesMinor}, base ${result.computedBaseCostMinor}, ` +
          `subtotal ${result.computedSellingPriceMinor}, tax ${result.computedTaxMinor}, ` +
          `platform fee ${result.computedPlatformFeeMinor}, total ${result.computedTotalMinor}]`,
      );
      updated++;
    } catch (err) {
      console.error(`FAILED to recompute ${pkg.title} (${pkg.packageReference}):`, err instanceof Error ? err.message : err);
      failed++;
    }
  }

  console.log(`\nRecomputed ${updated} of ${stale.length} stale breakdown(s). Skipped ${skippedOverridden} with an active override, ${failed} failed.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

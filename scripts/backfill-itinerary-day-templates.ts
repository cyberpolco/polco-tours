// One-off CLI: for every existing ItineraryDay created before DR-119/DR-120
// (or otherwise missing hotelId/restaurantId/activityIds), fills those three
// fields in from the matching PackageItineraryDay template row (same
// tourPackageId, same dayNumber) -- the same data itineraryService
// .createItinerary's template-copy step now applies automatically to every
// newly-created itinerary. Fills gaps only: a day that already has a
// hotelId/restaurantId/non-empty activityIds is left untouched, so this can
// never overwrite a value staff already set (via the template-copy step, or
// by hand on the day-edit form). Not wired into db:setup -- run by hand,
// once. Bypasses the itinerary/catalog/booking modules' service layers (no
// AuthContext for an operator-run maintenance script, same precedent as
// scripts/backfill-coordinates.ts) and talks to Prisma directly, scoped to
// the primary org (DR-005: single-tenant launch).
//
// Usage: npx tsx scripts/backfill-itinerary-day-templates.ts
import { prisma, withOrg } from '@lib/db';
import { getPrimaryOrgId } from '@lib/primary-org';

async function main() {
  const organizationId = await getPrimaryOrgId();

  const itineraries = await withOrg(organizationId, (tx) =>
    tx.itinerary.findMany({ include: { booking: { select: { departureId: true } } } }),
  );

  let updatedDays = 0;
  let inspectedDays = 0;
  const skippedNoDeparture: string[] = [];

  for (const itinerary of itineraries) {
    const departureId = itinerary.booking.departureId;
    if (!departureId) {
      skippedNoDeparture.push(itinerary.id);
      continue;
    }

    const departure = await withOrg(organizationId, (tx) => tx.departure.findUnique({ where: { id: departureId } }));
    if (!departure?.tourPackageId) continue;

    const templateDays = await withOrg(organizationId, (tx) =>
      tx.packageItineraryDay.findMany({ where: { tourPackageId: departure.tourPackageId! } }),
    );
    if (templateDays.length === 0) continue;
    const templateByDayNumber = new Map(templateDays.map((d) => [d.dayNumber, d]));

    const days = await withOrg(organizationId, (tx) => tx.itineraryDay.findMany({ where: { itineraryId: itinerary.id } }));

    for (const day of days) {
      inspectedDays++;
      const template = templateByDayNumber.get(day.dayNumber);
      if (!template) continue;

      const data: { hotelId?: string; restaurantId?: string; activityIds?: string[] } = {};
      if (day.hotelId == null && template.hotelId != null) data.hotelId = template.hotelId;
      if (day.restaurantId == null && template.restaurantId != null) data.restaurantId = template.restaurantId;
      if (day.activityIds.length === 0 && template.activityIds.length > 0) data.activityIds = template.activityIds;

      if (Object.keys(data).length === 0) continue;

      await withOrg(organizationId, (tx) => tx.itineraryDay.update({ where: { id: day.id }, data }));
      updatedDays++;
      console.log(`Itinerary ${itinerary.id} day ${day.dayNumber}: backfilled ${Object.keys(data).join(', ')}`);
    }
  }

  console.log(`\nBackfilled ${updatedDays} of ${inspectedDays} inspected itinerary day(s).`);
  if (skippedNoDeparture.length > 0) {
    console.log(`Skipped ${skippedNoDeparture.length} itinerary(ies) with no departure (TAILOR_MADE, not yet converted) -- no template to copy from.`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

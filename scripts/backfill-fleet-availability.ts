// One-off CLI (DR-149): re-syncs fleet availability for every departure that
// has ever had an Assignment, across every organization -- fixes any
// vehicle/driver/guide left stuck at BOOKED by a pre-existing gap in
// src/lib/fleet-availability.ts's hook coverage (most notably: deleting a
// CONFIRMED/IN_PROGRESS booking, DR-058, never called the sync hook at all,
// AND hasActiveBookingForDeparture didn't exclude a soft-deleted booking
// even when it did -- both fixed alongside this script). Re-running
// syncFleetAvailabilityForDeparture is always safe: it recomputes fresh
// from the departure's CURRENT booking/assignment state every time,
// regardless of why availability drifted, so this is a blunt "resync
// everything" pass rather than a targeted fix for one specific cause.
//
// Bypasses no service layer -- syncFleetAvailabilityForDeparture is the
// same exported helper every real call site (confirm/cancel/refund/delete,
// the booking sweep, the cooldown sweep) already uses; this script's only
// job is to enumerate every (organizationId, departureId) pair worth
// re-checking. Not wired into db:setup or a QStash schedule -- run by hand,
// once, after deploying the DR-149 fix.
//
// Usage: npx tsx scripts/backfill-fleet-availability.ts
import { prisma, withOrg } from '@lib/db';
import { syncFleetAvailabilityForDeparture } from '@lib/fleet-availability';

async function main() {
  const orgs = await prisma.organization.findMany({ select: { id: true } });

  let resyncedCount = 0;
  for (const org of orgs) {
    const departureIds = await withOrg(org.id, async (tx) => {
      const rows = await tx.assignment.findMany({ distinct: ['departureId'], select: { departureId: true } });
      return rows.map((r) => r.departureId);
    });

    for (const departureId of departureIds) {
      await syncFleetAvailabilityForDeparture(org.id, departureId);
      resyncedCount++;
      console.log(`org ${org.id}: resynced departure ${departureId}`);
    }
  }

  console.log(`Done. Resynced ${resyncedCount} departure(s) across ${orgs.length} organization(s).`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});

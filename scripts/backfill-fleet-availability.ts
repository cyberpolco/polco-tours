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
// This machine's connection to Neon has proven intermittently unreliable
// (confirmed independent of Prisma/this script -- a bare psql connect fails
// roughly as often as it succeeds) -- retryWithBackoff and the per-org
// try/catch below exist purely to let one transient blip skip/retry rather
// than abort the entire run; they are NOT compensating for anything wrong
// with syncFleetAvailabilityForDeparture itself (which already has its own
// best-effort try/catch, by design, for its real production call sites).
//
// Usage: npx tsx scripts/backfill-fleet-availability.ts
import { prisma, withOrg } from '@lib/db';
import { syncFleetAvailabilityForDeparture } from '@lib/fleet-availability';

async function retryWithBackoff<T>(label: string, attempts: number, work: () => Promise<T>): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await work();
    } catch (err) {
      lastErr = err;
      const delayMs = 1000 * attempt;
      console.log(`${label}: attempt ${attempt}/${attempts} failed (${err instanceof Error ? err.message : String(err)}), retrying in ${delayMs}ms`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastErr;
}

async function main() {
  const orgs = await retryWithBackoff('list organizations', 5, () => prisma.organization.findMany({ select: { id: true } }));

  let resyncedCount = 0;
  const failedOrgIds: string[] = [];

  for (const org of orgs) {
    try {
      const departureIds = await retryWithBackoff(`org ${org.id}: list departures`, 5, () =>
        withOrg(org.id, async (tx) => {
          const rows = await tx.assignment.findMany({ distinct: ['departureId'], select: { departureId: true } });
          return rows.map((r) => r.departureId);
        }),
      );

      for (const departureId of departureIds) {
        // syncFleetAvailabilityForDeparture already swallows its own errors
        // (best-effort by design) -- retrying it here is just improving the
        // odds it lands on a good connection, not catching a thrown error.
        for (let attempt = 1; attempt <= 3; attempt++) {
          await syncFleetAvailabilityForDeparture(org.id, departureId);
        }
        resyncedCount++;
        console.log(`org ${org.id}: resynced departure ${departureId}`);
      }
    } catch (err) {
      failedOrgIds.push(org.id);
      console.log(`org ${org.id}: giving up after retries (${err instanceof Error ? err.message : String(err)})`);
    }
  }

  console.log(`Done. Resynced ${resyncedCount} departure(s) across ${orgs.length - failedOrgIds.length}/${orgs.length} organization(s).`);
  if (failedOrgIds.length > 0) {
    console.log(`Skipped ${failedOrgIds.length} organization(s) after repeated connection failures -- re-run this script to retry them: ${failedOrgIds.join(', ')}`);
  }
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});

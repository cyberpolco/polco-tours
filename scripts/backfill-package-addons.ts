// One-off CLI (DR-180): associates every existing TourPackage with every
// currently-active AddonService in its own organization, via the new
// PackageAddonService join table. Before this change, add-ons were shown
// uniformly to every package (org+country scoped only, no per-package
// curation) -- this backfill preserves that exact guest-facing behavior on
// deploy, so nothing disappears from a package's add-ons step until a staff
// member deliberately narrows its list. Idempotent: setPackageAddons uses
// replace-all semantics, so re-running this against a package staff already
// edited would silently undo their narrowing -- run this ONCE, immediately
// after the schema/RLS push, before any staff edits a package's add-ons.
//
// Bypasses catalogService.setPackageAddons's own AuthContext-gated
// permission check -- no AuthContext exists for an operator-run maintenance
// script (same precedent as scripts/backfill-coordinates.ts and
// scripts/reset-all-users.ts) -- and calls catalogRepository.setPackageAddons
// (the same replace-all writer that service method wraps) directly. Not
// wired into db:setup or a QStash schedule -- run by hand, once, after the
// DR-180 schema push.
//
// Usage: npx tsx scripts/backfill-package-addons.ts
import { prisma, withOrg } from '@lib/db';
import { catalogRepository } from '@modules/catalog/repository';

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

  let linkedCount = 0;
  const failedOrgIds: string[] = [];

  for (const org of orgs) {
    try {
      const { packageIds, addonServiceIds } = await retryWithBackoff(`org ${org.id}: list packages + active add-ons`, 5, () =>
        withOrg(org.id, async (tx) => {
          const packages = await tx.tourPackage.findMany({ where: { deletedAt: null }, select: { id: true } });
          const addons = await tx.addonService.findMany({ where: { active: true }, select: { id: true } });
          return { packageIds: packages.map((p) => p.id), addonServiceIds: addons.map((a) => a.id) };
        }),
      );

      if (addonServiceIds.length === 0) {
        console.log(`org ${org.id}: no active add-ons, nothing to backfill`);
        continue;
      }

      for (const packageId of packageIds) {
        await retryWithBackoff(`org ${org.id}: link package ${packageId}`, 5, () =>
          catalogRepository.setPackageAddons(org.id, packageId, addonServiceIds),
        );
        linkedCount++;
        console.log(`org ${org.id}: linked package ${packageId} to ${addonServiceIds.length} add-on(s)`);
      }
    } catch (err) {
      failedOrgIds.push(org.id);
      console.log(`org ${org.id}: giving up after retries (${err instanceof Error ? err.message : String(err)})`);
    }
  }

  console.log(`Done. Linked ${linkedCount} package(s) across ${orgs.length - failedOrgIds.length}/${orgs.length} organization(s).`);
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

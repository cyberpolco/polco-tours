// One-off CLI: generates a personalized slug (DR-118) for every existing
// TourPackage row that has none yet -- created before the slug feature
// shipped. Not wired into db:setup; run by hand, once, after the schema
// push that added TourPackage.slug. Bypasses the catalog module's service
// layer (no AuthContext for an operator-run maintenance script, same
// precedent as scripts/backfill-coordinates.ts) and talks to Prisma
// directly, scoped to the primary org (DR-005: single-tenant launch).
//
// Slug uniqueness is checked globally (plain `prisma`, not `withOrg`'s
// RLS-scoped tx) -- same reasoning as catalog/repository.ts's own
// nextUniqueSlug, since a guest-facing package URL isn't org-scoped.
//
// Usage: npx tsx scripts/backfill-package-slugs.ts
import { prisma, withOrg } from '@lib/db';
import { getPrimaryOrgId } from '@lib/primary-org';
import { slugify } from '@lib/slug';

async function nextUniqueSlug(title: string): Promise<string> {
  const base = slugify(title) || 'package';
  let candidate = base;
  let suffix = 2;
  while (await prisma.tourPackage.findUnique({ where: { slug: candidate } })) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

async function main() {
  const organizationId = await getPrimaryOrgId();
  const packages = await withOrg(organizationId, (tx) => tx.tourPackage.findMany({ where: { deletedAt: null, slug: null } }));

  let backfilledCount = 0;
  for (const pkg of packages) {
    const slug = await nextUniqueSlug(pkg.title);
    await withOrg(organizationId, (tx) => tx.tourPackage.update({ where: { id: pkg.id }, data: { slug } }));
    backfilledCount++;
    console.log(`${pkg.packageReference} "${pkg.title}" -> ${slug}`);
  }

  console.log(`\nBackfilled ${backfilledCount} of ${packages.length} package(s) with no slug.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

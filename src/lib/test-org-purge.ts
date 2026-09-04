// DR-235: safety-net garbage collector for leftover test-fixture
// organizations. ~97 tests/api/*.test.ts files create their own throwaway
// Organization rows (naming convention: uppercase segments ending in a
// `Date.now()` 13-digit millisecond suffix, e.g. `FLEET-API-TEST-
// 1785580375687`) and clean them up in their own `afterAll`. That cleanup
// has no retry against the transient Neon connectivity blips this repo's
// own CLAUDE.md Gotchas already document as expected ("Prisma's query
// engine intermittently can't reach the Neon pooler... treat as transient
// and retry") -- a blip during `afterAll` throws before `organization
// .delete()` runs, orphaning the org permanently. A related, worse bug in
// several `*.security.test.ts` files: they create two orgs via
// `Promise.all([...])` and only assign both id variables after the whole
// promise resolves, so if either create call fails the successfully-created
// org's id is never captured in a JS variable at all -- `afterAll`'s own
// "don't wipe production if setup half-failed" guard then skips cleanup
// entirely. A one-time manual cleanup found 432 such orgs accumulated over
// about a year (2026-09-04).
//
// Lives here, not inside a module, because Organization has no owning
// module (fleet/catalog/booking repositories only ever read it via a
// relation on their own tables) -- same "cross-module, one level up"
// precedent as client-deletion.ts/fleet-availability.ts.
import { prisma, withTransientRetry } from '@lib/db';

// Matches this repo's test-fixture naming convention exactly: one or more
// uppercase-alphanumeric segments joined by hyphens, ending in a 13-digit
// `Date.now()` suffix (safe through the year 2286). Deliberately NOT "any
// non-Lam org" -- DR-005 keeps multi-tenancy live so a second real operator
// can onboard with no migration; a real operator's name is vanishingly
// unlikely to collide with this exact synthetic shape, but "any org that
// isn't Lam" would delete one on day one of onboarding.
const TEST_ORG_NAME_PATTERN = /^[A-Z0-9]+(?:-[A-Z0-9]+)*-\d{13}$/;

const STALE_AFTER_MS = 60 * 60 * 1000; // 1 hour (DR-235, explicit user choice over a longer window)

export async function purgeStaleTestOrganizations(now: Date = new Date()): Promise<{
  purged: number;
  failed: number;
  failedIds: string[];
}> {
  const cutoff = new Date(now.getTime() - STALE_AFTER_MS);
  const candidates = await prisma.organization.findMany({
    where: { isPrimary: false, createdAt: { lt: cutoff } },
    select: { id: true, name: true },
  });
  const stale = candidates.filter((org) => TEST_ORG_NAME_PATTERN.test(org.name));

  let purged = 0;
  const failedIds: string[] = [];

  for (const org of stale) {
    try {
      await withTransientRetry(() =>
        prisma.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT set_config('app.org_id', ${org.id}, true)`;
          await tx.organization.delete({ where: { id: org.id } });
        }),
      );
      purged += 1;
    } catch {
      failedIds.push(org.id);
    }
  }

  return { purged, failed: failedIds.length, failedIds };
}

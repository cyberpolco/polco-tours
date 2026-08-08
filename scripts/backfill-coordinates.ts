// One-off CLI: geocodes every existing Hotel/Restaurant/Site row that has
// no latitude/longitude yet, via the Geocoding API (GOOGLE_MAPS_SERVER_API_KEY,
// OI-13 resolved 2026-08-08 -- this is that key's first real consumer). Not
// wired into db:setup or a QStash schedule -- run by hand, once, after the
// schema push that added these columns. Bypasses the itinerary module's
// service layer (no AuthContext for an operator-run maintenance script,
// same precedent as scripts/reset-all-users.ts) and talks to Prisma
// directly, scoped to the primary org (DR-005: single-tenant launch).
//
// Each row's geocode fetch is deliberately OUTSIDE any Prisma transaction --
// withOrg's `$transaction` has a 5000ms default total timeout (Prisma's own
// default, not per-query), so nesting a whole loop of slow network calls
// inside one withOrg call (the first draft's mistake) blows that budget on
// the very first row. Only the (fast) initial listing and each individual
// (fast) update run inside their own short-lived withOrg call.
//
// Usage: npx tsx scripts/backfill-coordinates.ts
import { prisma, withOrg } from '@lib/db';
import { getPrimaryOrgId } from '@lib/primary-org';

interface GeocodeResult {
  lat: number;
  lng: number;
}

async function geocode(query: string, apiKey: string): Promise<GeocodeResult | null> {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&key=${apiKey}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) return null;
  const json = (await res.json()) as { status: string; results: Array<{ geometry: { location: { lat: number; lng: number } } }> };
  if (json.status !== 'OK' || json.results.length === 0) return null;
  const { lat, lng } = json.results[0]!.geometry.location;
  return { lat, lng };
}

async function main() {
  const apiKey = process.env.GOOGLE_MAPS_SERVER_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_MAPS_SERVER_API_KEY is not set.');

  const organizationId = await getPrimaryOrgId();
  const ungeocodable: string[] = [];
  let geocodedCount = 0;

  const [hotels, restaurants, sites] = await withOrg(organizationId, (tx) =>
    Promise.all([
      tx.hotel.findMany({ where: { deletedAt: null, latitude: null } }),
      tx.restaurant.findMany({ where: { deletedAt: null, latitude: null } }),
      tx.site.findMany({ where: { deletedAt: null, latitude: null } }),
    ]),
  );

  for (const h of hotels) {
    const point = await geocode([h.name, h.address, h.country].filter(Boolean).join(', '), apiKey);
    if (!point) {
      ungeocodable.push(`Hotel "${h.name}" (${h.id})`);
      continue;
    }
    await withOrg(organizationId, (tx) => tx.hotel.update({ where: { id: h.id }, data: { latitude: point.lat, longitude: point.lng } }));
    geocodedCount++;
  }

  for (const r of restaurants) {
    const point = await geocode([r.name, r.address, r.country].filter(Boolean).join(', '), apiKey);
    if (!point) {
      ungeocodable.push(`Restaurant "${r.name}" (${r.id})`);
      continue;
    }
    await withOrg(organizationId, (tx) => tx.restaurant.update({ where: { id: r.id }, data: { latitude: point.lat, longitude: point.lng } }));
    geocodedCount++;
  }

  for (const s of sites) {
    const point = await geocode([s.name, s.city, s.province, s.country].filter(Boolean).join(', '), apiKey);
    if (!point) {
      ungeocodable.push(`Site "${s.name}" (${s.id})`);
      continue;
    }
    await withOrg(organizationId, (tx) => tx.site.update({ where: { id: s.id }, data: { latitude: point.lat, longitude: point.lng } }));
    geocodedCount++;
  }

  console.log(`Geocoded ${geocodedCount} row(s).`);
  if (ungeocodable.length > 0) {
    console.log(`Could not geocode ${ungeocodable.length} row(s) -- spot-check and set these by hand via the staff UI:`);
    for (const label of ungeocodable) console.log(`  - ${label}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

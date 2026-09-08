import type { MetadataRoute } from 'next';
import { catalogService } from '@modules/catalog';
import { cmsService } from '@modules/cms';
import { WEATHER_TOWNS } from '@lib/weather-towns';

// Same canonical host every other absolute-URL consumer already hardcodes
// (see robots.ts's own comment).
const SITE_URL = 'https://mufasasafaris.com';

// Static, stable, indexable guest routes -- deliberately excludes the
// booking/quotation flows (book, book-package, booking, complete-booking)
// and the two lookup-result pages (find-booking/result, rate/result), which
// all render one specific guest's own data behind a reference/booking id in
// the URL rather than being a page for search engines to send new visitors
// to (robots.ts disallows crawling those same paths).
const STATIC_ROUTES = ['/', '/packages', '/about', '/faq', '/contact', '/gallery', '/plan-my-trip', '/find-booking', '/rate', '/terms', '/weather'];

// Revalidates hourly (App Router's file-convention default for a dynamic
// sitemap with no explicit revalidate) -- packages/gallery entries are
// staff-edited, not so frequently that this needs to be fully dynamic on
// every request.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const staticEntries: MetadataRoute.Sitemap = STATIC_ROUTES.map((path) => ({
    url: `${SITE_URL}${path}`,
    lastModified: now,
  }));

  // Real, published packages only (listPublicPackages already applies the
  // same isPackageVisible gate the package pages themselves enforce) --
  // prefer the human-readable slug when one exists (DR-118), falling back to
  // the raw id for an older/not-yet-slugged row, matching
  // getPublicPackageWithDepartures's own idOrSlug resolution.
  const packages = await catalogService.listPublicPackages();
  const packageEntries: MetadataRoute.Sitemap = packages.map((pkg) => ({
    url: `${SITE_URL}/packages/${pkg.slug ?? pkg.id}`,
    lastModified: pkg.updatedAt,
  }));

  // Real, staff-configured gallery sites only -- same slug-or-slotKey
  // resolution cmsService.getPublicMediaItem itself uses (DR-254).
  const galleryItems = await cmsService.listPublicMediaItems('gallery');
  const galleryEntries: MetadataRoute.Sitemap = galleryItems
    .filter((item) => item.url)
    .map((item) => ({
      url: `${SITE_URL}/gallery/${item.slug ?? item.slotKey}`,
      lastModified: item.updatedAt,
    }));

  // Static curated town list (src/lib/weather-towns.ts) -- no DB table, so
  // no lastModified signal beyond "this build".
  const weatherEntries: MetadataRoute.Sitemap = WEATHER_TOWNS.map((town) => ({
    url: `${SITE_URL}/weather/${town.slug}`,
    lastModified: now,
  }));

  return [...staticEntries, ...packageEntries, ...galleryEntries, ...weatherEntries];
}

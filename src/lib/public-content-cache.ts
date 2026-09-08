import { unstable_cache } from 'next/cache';

// DR-266 incident (2026-09-08): a handful of guest pages (/, /packages,
// /plan-my-trip, /terms) each re-run several staff-edited CMS/catalog reads
// on every single request -- correct, since the surrounding page is
// cookie-driven (locale) and therefore can't be statically rendered, but
// wasteful once real crawler/bot traffic starts hitting them repeatedly
// (contributed to exhausting the Vercel Hobby plan's monthly Active CPU
// allowance the day sitemap.xml/robots.txt were published). This content
// only changes when staff edits it in /staff/cms, so a short cache window
// on the underlying data fetch (not the page render itself, which still
// renders fresh per request -- no locale-leak risk) trades a few seconds of
// edit-to-guest-site propagation delay for a large cut in repeat-request
// DB/CPU cost. Kept short enough that a staff edit is never surprising for
// more than a minute.
const PUBLIC_CONTENT_REVALIDATE_SECONDS = 60;

// Thin wrapper over unstable_cache with this module's shared revalidate
// window -- `keyParts` must fully capture every argument the wrapped read
// actually varies on (e.g. locale, page slug) so two different reads never
// collide on the same cache entry. unstable_cache round-trips its return
// value through JSON, so a `Date` field survives a cache miss but comes back
// as a plain ISO string on a cache hit -- only wrap a read whose caller
// doesn't consume a Date-typed field from the result (every current caller
// only reads plain string/number/id fields).
export function cachedPublicRead<T>(fn: () => Promise<T>, keyParts: string[]): () => Promise<T> {
  return unstable_cache(fn, keyParts, { revalidate: PUBLIC_CONTENT_REVALIDATE_SECONDS });
}

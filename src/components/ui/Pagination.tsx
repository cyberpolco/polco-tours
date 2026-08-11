import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

interface PaginationProps {
  page: number;
  totalPages: number;
  hrefFor: (page: number) => string;
}

// Numbered page links with ellipsis truncation once there are more pages
// than can reasonably fit -- always shows first, last, and a small window
// around the current page, so a large result set never renders dozens of
// links at once. Plain <Link>s (no client JS) -- hrefFor is responsible for
// carrying every other active filter/search param along with the page
// number, same "GET-driven, server-rendered" convention as the rest of this
// app's list filtering. Async server component (every call site is a
// server-rendered list page) so it can read Common.previous/next directly.
export async function Pagination({ page, totalPages, hrefFor }: PaginationProps) {
  if (totalPages <= 1) return null;

  const t = await getTranslations('Common');
  const pages = pageWindow(page, totalPages);

  return (
    <nav aria-label="Pagination" className="flex items-center justify-center gap-1 text-sm">
      <PageStepLink href={hrefFor(page - 1)} disabled={page <= 1} label={t('previous')} />
      {pages.map((p, i) =>
        p === 'ellipsis' ? (
          <span key={`ellipsis-${i}`} className="px-2 text-mist">
            …
          </span>
        ) : (
          <Link
            key={p}
            href={hrefFor(p)}
            aria-current={p === page ? 'page' : undefined}
            className={
              p === page
                ? 'flex h-8 min-w-8 items-center justify-center rounded-pill bg-amber px-2 font-semibold text-ink'
                : 'flex h-8 min-w-8 items-center justify-center rounded-pill px-2 text-navy hover:bg-amber/10'
            }
          >
            {p}
          </Link>
        ),
      )}
      <PageStepLink href={hrefFor(page + 1)} disabled={page >= totalPages} label={t('next')} />
    </nav>
  );
}

function PageStepLink({ href, disabled, label }: { href: string; disabled: boolean; label: string }) {
  if (disabled) {
    return <span className="flex h-8 items-center px-2 text-mist/50">{label}</span>;
  }
  return (
    <Link href={href} className="flex h-8 items-center px-2 text-navy hover:text-amber">
      {label}
    </Link>
  );
}

/** first, last, and a window of `radius` pages around the current one, with
 * a single "…" wherever a gap opens up. */
function pageWindow(current: number, total: number, radius = 2): Array<number | 'ellipsis'> {
  const pages: Array<number | 'ellipsis'> = [1];
  const start = Math.max(2, current - radius);
  const end = Math.min(total - 1, current + radius);

  if (start > 2) pages.push('ellipsis');
  for (let p = start; p <= end; p++) pages.push(p);
  if (end < total - 1) pages.push('ellipsis');
  if (total > 1) pages.push(total);

  return pages;
}

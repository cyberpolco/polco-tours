import { getTranslations } from 'next-intl/server';

// DR-068: a plain 0-5 star rating rendered via a classic two-layer clip
// (a muted full row underneath, a gold row clipped to `rating/5`) -- no
// icon font/SVG sprite dependency, works for any fractional rating. Async
// server component (every call site is server-rendered) so it can read
// Common.ratingAriaLabel directly.
interface RatingStarsProps {
  rating: number;
  size?: 'sm' | 'md';
  className?: string;
}

export async function RatingStars({ rating, size = 'md', className }: RatingStarsProps) {
  const t = await getTranslations('Common');
  const pct = Math.max(0, Math.min(100, (rating / 5) * 100));
  const textSize = size === 'sm' ? 'text-xs' : 'text-sm';
  return (
    <span
      role="img"
      aria-label={t('ratingAriaLabel', { rating: rating.toFixed(1) })}
      className={['relative inline-block whitespace-nowrap leading-none tracking-[0.1em]', textSize, className]
        .filter(Boolean)
        .join(' ')}
    >
      <span aria-hidden className="text-rule">
        ★★★★★
      </span>
      <span aria-hidden className="absolute inset-0 overflow-hidden text-gold" style={{ width: `${pct}%` }}>
        ★★★★★
      </span>
    </span>
  );
}

// Bare pulse placeholder block -- pass className to size/shape it per use
// (a text line, a card, a map). Plain CSS animation, covered by globals.css's
// site-wide prefers-reduced-motion safety net, so no extra guard here.
export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-card bg-mist/15 ${className}`} />;
}

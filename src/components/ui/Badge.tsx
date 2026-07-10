// No red/danger token exists in the "Meridian Cartography" palette (see
// CLAUDE.md) -- `danger` reuses amber but solid/bold instead of `warning`'s
// soft tint, so a FAILED payment still reads as visually distinct from a
// merely-PENDING one. Same reasoning fleet/domain.ts's complianceStatus
// already established (EXPIRED renders bold-amber, not a new color).
const TONE_CLASSES = {
  success: 'bg-forest/10 text-forest',
  warning: 'bg-amber/10 text-amber',
  neutral: 'bg-mist/10 text-mist',
  danger: 'bg-amber text-navy font-semibold',
} as const;

export type BadgeTone = keyof typeof TONE_CLASSES;

export function Badge({ tone, children }: { tone: BadgeTone; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-survey px-2 py-0.5 text-xs font-medium ${TONE_CLASSES[tone]}`}>
      {children}
    </span>
  );
}

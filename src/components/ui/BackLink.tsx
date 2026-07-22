import Link from 'next/link';

// Shared guest+staff "go back" affordance (Horizon redesign) -- a small pill
// chip (circular icon badge + label) rather than a bare text+chevron link, so
// "back" reads as a deliberate on-theme control instead of plain inline text.
// Exported so callers that need the "step back" affordance inside a Button
// (e.g. a wizard's Back/Next button row, where a plain text link would read
// as a different weight than its neighboring primary button) can reuse the
// same glyph instead of a literal "←" character.
export function BackChevron() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="h-3 w-3 shrink-0 transition-transform duration-200 group-hover:-translate-x-0.5"
    >
      <path d="M12.5 15 7 10l5.5-5" />
    </svg>
  );
}

type BackTone = 'light' | 'dark';

// 'light' (the default) is for the bone/light-surface chrome every guest
// route and the staff dashboard shell use -- hover shifts to forest so "back"
// stays visually distinct from the amber primary-CTA color used everywhere
// else on light pages. 'dark' is for the one caller on a navy surface
// (staff/login) -- hover shifts to amber there instead, matching the accent
// already established on that page's dark chrome.
const TONE_STYLES: Record<BackTone, { container: string; badge: string }> = {
  light: {
    container:
      'border-rule bg-bone/60 text-forest hover:border-forest/40 hover:bg-forest/10 focus-visible:ring-amber/60 focus-visible:ring-offset-bone',
    badge: 'border-rule bg-bone text-forest',
  },
  dark: {
    container:
      'border-bone/20 bg-bone/10 text-bone hover:border-amber/40 hover:bg-amber/10 hover:text-amber focus-visible:ring-amber/60 focus-visible:ring-offset-navy',
    badge: 'border-bone/20 bg-bone/10 text-bone',
  },
};

function chipClassName(tone: BackTone, className?: string) {
  return [
    'group inline-flex items-center gap-2 rounded-pill border py-1 pl-1 pr-3 text-sm font-medium shadow-card transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
    TONE_STYLES[tone].container,
    className,
  ]
    .filter(Boolean)
    .join(' ');
}

function BackBadge({ tone }: { tone: BackTone }) {
  return (
    <span
      className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors duration-200 ${TONE_STYLES[tone].badge}`}
    >
      <BackChevron />
    </span>
  );
}

interface BackLinkProps {
  href: string;
  children: React.ReactNode;
  className?: string;
  tone?: BackTone;
}

export function BackLink({ href, children, className, tone = 'light' }: BackLinkProps) {
  return (
    <Link href={href} className={chipClassName(tone, className)}>
      <BackBadge tone={tone} />
      {children}
    </Link>
  );
}

interface BackActionProps {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  className?: string;
  tone?: BackTone;
}

// Browser-history / client-state "go back" (no href) -- the staff dashboard
// shell's router.back() and any in-wizard step-back action.
export function BackAction({ onClick, disabled, children, className, tone = 'light' }: BackActionProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={chipClassName(tone, ['disabled:pointer-events-none disabled:opacity-50', className].filter(Boolean).join(' '))}
    >
      <BackBadge tone={tone} />
      {children}
    </button>
  );
}

import Link from 'next/link';

// Shared guest+staff "go back" affordance (Horizon redesign) -- replaces the
// literal "←" glyph that was hand-copied across ~20 pages with a consistent
// icon + hover/focus treatment matching Button.tsx's conventions.
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
      className="h-3.5 w-3.5 shrink-0 transition-transform duration-200 group-hover:-translate-x-0.5"
    >
      <path d="M12.5 15 7 10l5.5-5" />
    </svg>
  );
}

const backClassName =
  'group inline-flex items-center gap-1.5 rounded-pill text-sm font-medium text-forest transition-colors duration-200 hover:text-amber focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bone';

interface BackLinkProps {
  href: string;
  children: React.ReactNode;
  className?: string;
}

export function BackLink({ href, children, className }: BackLinkProps) {
  return (
    <Link href={href} className={[backClassName, className].filter(Boolean).join(' ')}>
      <BackChevron />
      {children}
    </Link>
  );
}

interface BackActionProps {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  className?: string;
}

// Browser-history / client-state "go back" (no href) -- the staff dashboard
// shell's router.back() and any in-wizard step-back action.
export function BackAction({ onClick, disabled, children, className }: BackActionProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[backClassName, 'disabled:pointer-events-none disabled:opacity-50', className].filter(Boolean).join(' ')}
    >
      <BackChevron />
      {children}
    </button>
  );
}

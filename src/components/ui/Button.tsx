import type { ButtonHTMLAttributes } from 'react';
import Link, { type LinkProps } from 'next/link';

// The button recipes already used across the guest + staff flows,
// consolidated so every page shares one source of truth instead of
// re-typing the className stack. `success` (forest fill) and `compact`
// size were added for the staff dashboard's row-actions (Confirm, Mark
// paid, Remove) -- the guest flow never needed them. `invert` (DR-068)
// is for a button sitting on a dark/gradient surface (the hero carousel,
// the homepage's dark CTA band) where `primary`'s ember fill would clash.
// Real hover/active/focus states (DR-068) -- previously none existed;
// `prefers-reduced-motion` is neutralized globally in globals.css, not
// per-component.
const VARIANT_CLASSES = {
  primary:
    'bg-amber text-ink shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift active:translate-y-0 active:shadow-card focus-visible:ring-2 focus-visible:ring-amber/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bone',
  secondary:
    'border border-navy text-navy transition-colors duration-200 hover:bg-navy hover:text-bone focus-visible:ring-2 focus-visible:ring-navy/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bone',
  success:
    'bg-forest text-bone shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift active:translate-y-0 active:shadow-card focus-visible:ring-2 focus-visible:ring-forest/50 focus-visible:ring-offset-2 focus-visible:ring-offset-bone',
  invert:
    'bg-bone text-ink shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift active:translate-y-0 focus-visible:ring-2 focus-visible:ring-bone/70 focus-visible:ring-offset-2 focus-visible:ring-offset-navy',
  // The bordered counterpart to `invert` -- a secondary action on the same
  // dark surface (HeroCarousel's "Plan my trip"). Kept as its own variant
  // rather than composing `secondary` + an override className, since two
  // conflicting Tailwind classes of equal specificity in one className
  // string don't reliably resolve to the one written last.
  invertOutline:
    'border border-bone/70 text-bone transition-colors duration-200 hover:bg-bone/10 focus-visible:ring-2 focus-visible:ring-bone/60 focus-visible:ring-offset-2 focus-visible:ring-offset-navy',
} as const;

const SIZE_CLASSES = {
  default: 'px-5 py-3 text-sm',
  compact: 'px-3 py-1 text-xs',
} as const;

type Variant = keyof typeof VARIANT_CLASSES;
type Size = keyof typeof SIZE_CLASSES;

function buttonClassName(variant: Variant, size: Size, className?: string): string {
  return [
    'inline-flex items-center justify-center rounded-pill font-semibold outline-none',
    'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none disabled:hover:translate-y-0',
    SIZE_CLASSES[size],
    VARIANT_CLASSES[variant],
    className,
  ]
    .filter(Boolean)
    .join(' ');
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export function Button({ variant = 'primary', size = 'default', className, ...props }: ButtonProps) {
  return <button className={buttonClassName(variant, size, className)} {...props} />;
}

interface LinkButtonProps extends LinkProps {
  variant?: Variant;
  size?: Size;
  className?: string;
  children: React.ReactNode;
}

export function LinkButton({ variant = 'primary', size = 'default', className, children, ...props }: LinkButtonProps) {
  return (
    <Link className={buttonClassName(variant, size, className)} {...props}>
      {children}
    </Link>
  );
}

import type { ButtonHTMLAttributes } from 'react';
import Link, { type LinkProps } from 'next/link';

// The button recipes already used across the guest + staff flows,
// consolidated so every page shares one source of truth instead of
// re-typing the className stack. `success` (forest fill) and `compact`
// size were added for the staff dashboard's row-actions (Confirm, Mark
// paid, Remove) -- the guest flow never needed them.
const VARIANT_CLASSES = {
  primary: 'bg-amber text-navy',
  secondary: 'border border-navy text-navy',
  success: 'bg-forest text-bone',
} as const;

const SIZE_CLASSES = {
  default: 'px-5 py-3 text-sm',
  compact: 'px-3 py-1 text-xs',
} as const;

type Variant = keyof typeof VARIANT_CLASSES;
type Size = keyof typeof SIZE_CLASSES;

function buttonClassName(variant: Variant, size: Size, className?: string): string {
  return [
    'inline-flex items-center justify-center rounded-survey font-semibold',
    'disabled:cursor-not-allowed disabled:opacity-50',
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

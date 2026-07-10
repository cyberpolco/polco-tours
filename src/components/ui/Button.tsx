import type { ButtonHTMLAttributes } from 'react';
import Link, { type LinkProps } from 'next/link';

// The two button recipes already used across the guest flow
// (bg-amber .../ border-navy ...), consolidated so every page shares one
// source of truth instead of re-typing the className stack.
const VARIANT_CLASSES = {
  primary: 'bg-amber text-navy',
  secondary: 'border border-navy text-navy',
} as const;

type Variant = keyof typeof VARIANT_CLASSES;

function buttonClassName(variant: Variant, className?: string): string {
  return [
    'inline-flex items-center justify-center rounded-survey px-5 py-3 text-sm font-semibold',
    'disabled:cursor-not-allowed disabled:opacity-50',
    VARIANT_CLASSES[variant],
    className,
  ]
    .filter(Boolean)
    .join(' ');
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

export function Button({ variant = 'primary', className, ...props }: ButtonProps) {
  return <button className={buttonClassName(variant, className)} {...props} />;
}

interface LinkButtonProps extends LinkProps {
  variant?: Variant;
  className?: string;
  children: React.ReactNode;
}

export function LinkButton({ variant = 'primary', className, children, ...props }: LinkButtonProps) {
  return (
    <Link className={buttonClassName(variant, className)} {...props}>
      {children}
    </Link>
  );
}

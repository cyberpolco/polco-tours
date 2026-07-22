import type { SelectHTMLAttributes } from 'react';

// The dropdown counterpart to Button/Card/Badge -- native <select> elements
// were previously styled ad hoc per call site with the same className stack
// as a plain text input (`rounded-survey border border-rule px-3 py-2`),
// which never picked up the Horizon redesign's rounder shape, hover state,
// or focus ring the way Button/Card/Badge did. `appearance-none` + the
// inline chevron background replaces each browser's own arrow glyph with
// one matching BackLink's chevron, recolored via `currentColor` through the
// `text-mist` class driving the SVG's stroke.
const selectClassName =
  'w-full appearance-none rounded-card border border-rule bg-bone bg-[position:right_0.75rem_center] bg-no-repeat py-2 pl-3 pr-9 text-sm text-ink transition-colors duration-200 hover:border-navy/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber/60 focus-visible:border-navy disabled:cursor-not-allowed disabled:opacity-50';

const chevronBackground = {
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='none' stroke='%238C7D78' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 8l4 4 4-4'/%3E%3C/svg%3E\")",
};

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  className?: string;
}

export function Select({ className, style, children, ...props }: SelectProps) {
  return (
    <select className={[selectClassName, className].filter(Boolean).join(' ')} style={{ ...chevronBackground, ...style }} {...props}>
      {children}
    </select>
  );
}

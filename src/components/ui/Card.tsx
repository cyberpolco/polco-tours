interface CardProps {
  as?: 'div' | 'li';
  className?: string;
  /** DR-068: opt-in hover elevation for a card that is itself a link/button
   * (e.g. PackageCard) -- a purely static content card (invoice summary,
   * alert box) stays calm with no lift on hover. */
  interactive?: boolean;
  children: React.ReactNode;
}

// The bordered-box recipe (rounded-survey border border-rule ...) repeated
// with tiny drift (p-4 vs px-3 py-2, etc.) across package cards, departure
// rows, the invoice block, and the reference-code callout -- one definition.
// DR-068: rounded-card (14px) + a resting shadow-card replace the old flat,
// sharp-cornered look; `interactive` adds real hover elevation.
export function Card({ as = 'div', className, interactive = false, children }: CardProps) {
  const Component = as;
  return (
    <Component
      className={[
        'rounded-card border border-rule p-4 shadow-card',
        interactive && 'transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </Component>
  );
}

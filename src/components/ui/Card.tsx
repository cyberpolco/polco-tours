interface CardProps {
  as?: 'div' | 'li';
  className?: string;
  children: React.ReactNode;
}

// The bordered-box recipe (rounded-survey border border-rule ...) repeated
// with tiny drift (p-4 vs px-3 py-2, etc.) across package cards, departure
// rows, the invoice block, and the reference-code callout -- one definition.
export function Card({ as = 'div', className, children }: CardProps) {
  const Component = as;
  return <Component className={['rounded-survey border border-rule p-4', className].filter(Boolean).join(' ')}>{children}</Component>;
}

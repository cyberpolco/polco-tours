interface WithChildren {
  children?: React.ReactNode;
  className?: string;
}

// Thin styled wrappers matching the exact table markup already duplicated
// across the staff bookings/fleet list pages (w-full text-left text-sm,
// border-b border-rule rows, py-2 cells) -- adopting this is a near-1:1 tag
// swap, not a rewrite. DR-068: header cells get a small-caps treatment
// (matches the site's existing `.eyebrow` convention) and rows get a real
// hover state -- neither existed before.
export function Table({ children, className }: WithChildren) {
  return <table className={['w-full text-left text-sm', className].filter(Boolean).join(' ')}>{children}</table>;
}

export function TableHeaderRow({ children }: WithChildren) {
  return <tr className="border-b border-rule text-mist">{children}</tr>;
}

export function Th({ children, className }: WithChildren) {
  return (
    <th className={['py-3 text-xs font-semibold uppercase tracking-wide', className].filter(Boolean).join(' ')}>{children}</th>
  );
}

export function Tr({ children, className }: WithChildren) {
  return (
    <tr className={['border-b border-rule transition-colors duration-150 hover:bg-amber/5', className].filter(Boolean).join(' ')}>
      {children}
    </tr>
  );
}

export function Td({ children, className }: WithChildren) {
  return <td className={['py-3', className].filter(Boolean).join(' ')}>{children}</td>;
}

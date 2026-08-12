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
//
// Mobile fix: a wide table (many columns) used to overflow the whole page
// horizontally on a phone -- every staff list page rendered through this
// one component, so containing the scroll here fixes it everywhere at
// once instead of wrapping each page's own <Table> individually.
export function Table({ children, className }: WithChildren) {
  return (
    <div className="overflow-x-auto">
      <table className={['w-full text-left text-sm', className].filter(Boolean).join(' ')}>{children}</table>
    </div>
  );
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

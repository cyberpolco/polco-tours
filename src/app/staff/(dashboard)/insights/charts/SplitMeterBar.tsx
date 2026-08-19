export interface SplitSegment {
  label: string;
  value: number;
  color: string;
}

interface SplitMeterBarProps {
  segments: SplitSegment[];
}

/** A 2-(or-few)-category split bar -- dataviz skill: "a meter, not a pie of
 * 2 slices." Used for new-vs-returning guests and the booking-origin
 * split, where a donut would be the wrong form for the category count. */
export function SplitMeterBar({ segments }: SplitMeterBarProps) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  return (
    <div className="space-y-2">
      <div className="flex h-4 w-full overflow-hidden rounded-full bg-rule/40">
        {segments.map((s) => {
          const pct = total > 0 ? (s.value / total) * 100 : 0;
          return pct > 0 ? <div key={s.label} title={`${s.label}: ${s.value}`} style={{ width: `${pct}%`, backgroundColor: s.color }} /> : null;
        })}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
            <span className="text-ink">{s.label}</span>
            <span className="text-mist">{s.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

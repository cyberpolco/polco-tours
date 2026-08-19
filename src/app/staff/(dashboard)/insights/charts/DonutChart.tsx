'use client';

import { useState } from 'react';
import { categoricalColor, CHART_CATEGORICAL, CHART_TRACK } from '../chart-colors';

export interface DonutSegment {
  label: string;
  value: number;
}

interface DonutChartProps {
  segments: DonutSegment[];
  size?: number;
  strokeWidth?: number;
  /** Series-count ladder (dataviz skill): past this many, the tail folds
   * into "Other" rather than seating another categorical hue. Defaults to
   * CHART_CATEGORICAL's own length -- there are only that many validated
   * hues (see chart-colors.ts), so a 5th+ real slice would otherwise
   * silently repeat an already-assigned color instead of folding. */
  maxSegments?: number;
  formatValue?: (value: number) => string;
  totalLabel?: string;
}

/** Part-to-whole with enough categories to earn a donut (dataviz skill:
 * "a meter, not a pie of 2 slices" -- see SplitMeterBar for the 2-category
 * case instead). Hover a segment (or its legend row) to see its value in
 * the center + a native tooltip; a legend is always shown (>=2 series). */
export function DonutChart({
  segments,
  size = 140,
  strokeWidth = 22,
  maxSegments = CHART_CATEGORICAL.length,
  formatValue = String,
  totalLabel = 'Total',
}: DonutChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const sorted = [...segments].filter((s) => s.value > 0).sort((a, b) => b.value - a.value);
  const visible = sorted.slice(0, maxSegments);
  const foldedTotal = sorted.slice(maxSegments).reduce((sum, s) => sum + s.value, 0);
  const finalSegments = foldedTotal > 0 ? [...visible, { label: 'Other', value: foldedTotal }] : visible;
  const total = finalSegments.reduce((sum, s) => sum + s.value, 0);

  if (finalSegments.length === 0) {
    return <p className="text-xs text-mist">No data for this period.</p>;
  }

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  let offsetSoFar = 0;
  const arcs = finalSegments.map((seg, i) => {
    const fraction = total > 0 ? seg.value / total : 0;
    const dash = fraction * circumference;
    const isOther = seg.label === 'Other' && i === finalSegments.length - 1 && foldedTotal > 0;
    const arc = { ...seg, dash, offset: offsetSoFar, color: isOther ? CHART_TRACK : categoricalColor(i) };
    offsetSoFar += dash;
    return arc;
  });

  const active = hoveredIndex !== null ? arcs[hoveredIndex] : null;

  return (
    <div className="flex items-center gap-4">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} onMouseLeave={() => setHoveredIndex(null)}>
        <circle cx={center} cy={center} r={radius} fill="none" stroke={CHART_TRACK} strokeWidth={strokeWidth} />
        {arcs.map((arc, i) => (
          <circle
            key={`${arc.label}-${i}`}
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={arc.color}
            strokeWidth={hoveredIndex === i ? strokeWidth + 4 : strokeWidth}
            strokeDasharray={`${arc.dash} ${circumference - arc.dash}`}
            strokeDashoffset={-arc.offset}
            transform={`rotate(-90 ${center} ${center})`}
            style={{ cursor: 'pointer', transition: 'stroke-width 0.15s ease' }}
            onMouseEnter={() => setHoveredIndex(i)}
          >
            <title>{`${arc.label}: ${formatValue(arc.value)}`}</title>
          </circle>
        ))}
        <text x={center} y={center - 6} textAnchor="middle" className="fill-navy text-sm font-bold">
          {formatValue(active ? active.value : total)}
        </text>
        <text x={center} y={center + 12} textAnchor="middle" className="fill-mist text-[10px]">
          {active ? active.label : totalLabel}
        </text>
      </svg>
      <ul className="space-y-1 text-xs">
        {arcs.map((arc, i) => (
          <li
            key={`${arc.label}-legend-${i}`}
            className="flex cursor-pointer items-center gap-2"
            onMouseEnter={() => setHoveredIndex(i)}
            onMouseLeave={() => setHoveredIndex(null)}
          >
            <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: arc.color }} />
            <span className="text-ink">{arc.label}</span>
            <span className="text-mist">{formatValue(arc.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

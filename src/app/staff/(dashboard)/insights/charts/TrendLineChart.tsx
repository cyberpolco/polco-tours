'use client';

import { useMemo, useState } from 'react';
import { CHART_MUTED_TEXT, CHART_TRACK } from '../chart-colors';

export interface TrendChartPoint {
  periodStart: string; // ISO date, the bucket's start
  value: number;
}

interface TrendLineChartProps {
  points: TrendChartPoint[];
  color: string;
  width?: number;
  height?: number;
  formatValue?: (value: number) => string;
  formatPeriod?: (periodStart: string) => string;
}

/** One series, one axis (dataviz skill: "never a dual-axis chart" -- a
 * second measure/currency gets its own TrendLineChart, i.e. small
 * multiples, not a second y-scale on this one). Crosshair + tooltip on
 * hover, per the skill's "ship interactivity by default" rule. */
export function TrendLineChart({
  points,
  color,
  width = 320,
  height = 120,
  formatValue = String,
  formatPeriod = (p) => p,
}: TrendLineChartProps) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const padding = 8;
  const maxValue = Math.max(1, ...points.map((p) => p.value));
  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  const coords = useMemo(
    () =>
      points.map((p, i) => ({
        x: padding + (points.length <= 1 ? innerWidth / 2 : (i / (points.length - 1)) * innerWidth),
        y: padding + innerHeight - (p.value / maxValue) * innerHeight,
        periodStart: p.periodStart,
        value: p.value,
      })),
    [points, maxValue, innerWidth, innerHeight],
  );

  if (points.length === 0) {
    return <p className="text-xs text-mist">No data for this period.</p>;
  }

  const linePath = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x} ${c.y}`).join(' ');
  // Safe non-null assertions -- the points.length === 0 early return above
  // guarantees coords is non-empty here.
  const areaPath = `${linePath} L ${coords[coords.length - 1]!.x} ${height - padding} L ${coords[0]!.x} ${height - padding} Z`;
  const active = hoverIndex !== null ? coords[hoverIndex] : null;
  const tooltipLeft = active ? Math.min(Math.max(active.x - 40, 0), width - 90) : 0;

  return (
    <div className="relative">
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        onMouseLeave={() => setHoverIndex(null)}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const relX = ((e.clientX - rect.left) / rect.width) * width;
          let nearest = 0;
          let nearestDist = Infinity;
          coords.forEach((c, i) => {
            const dist = Math.abs(c.x - relX);
            if (dist < nearestDist) {
              nearestDist = dist;
              nearest = i;
            }
          });
          setHoverIndex(nearest);
        }}
      >
        <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke={CHART_TRACK} strokeWidth={1} />
        <path d={areaPath} fill={color} opacity={0.12} stroke="none" />
        <path d={linePath} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {active && (
          <line x1={active.x} y1={padding} x2={active.x} y2={height - padding} stroke={CHART_MUTED_TEXT} strokeWidth={1} strokeDasharray="3 3" />
        )}
        {active && <circle cx={active.x} cy={active.y} r={4} fill={color} stroke="#F6EFE4" strokeWidth={1.5} />}
      </svg>
      {active && (
        <div
          className="pointer-events-none absolute top-0 rounded-survey border border-rule bg-bone px-2 py-1 text-xs shadow-card"
          style={{ left: tooltipLeft }}
        >
          <p className="font-semibold text-navy">{formatValue(active.value)}</p>
          <p className="text-mist">{formatPeriod(active.periodStart)}</p>
        </div>
      )}
    </div>
  );
}

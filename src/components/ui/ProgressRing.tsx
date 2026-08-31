interface ProgressRingProps {
  /** 0-100. */
  percent: number;
  label: string;
  size?: number;
  className?: string;
}

// Small circular completion meter (plain SVG stroke-dasharray, no charting
// library) -- used by StepIndicator's 'checklist' variant to echo the
// design reference's "Getting Started: 40%" ring. The percentage text
// doubles as the only content screen readers get (the ring itself is
// decorative), so it must always be legible on its own, not just visually.
export function ProgressRing({ percent, label, size = 56, className }: ProgressRingProps) {
  const clamped = Math.min(100, Math.max(0, percent));
  const radius = (size - 6) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped / 100);

  return (
    <div className={['relative inline-flex shrink-0 items-center justify-center', className].filter(Boolean).join(' ')}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="currentColor" strokeWidth="4" className="text-rule" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="text-amber transition-[stroke-dashoffset] duration-300"
        />
      </svg>
      <span className="absolute text-xs font-semibold text-navy" aria-label={label}>
        {Math.round(clamped)}%
      </span>
    </div>
  );
}

// A circular ring gauge -- "a single ratio against a limit -> meter" (dataviz
// skill), used for the utilization/conversion percentages on this page. Pure/
// stateless, so it renders fine from either the server-rendered first paint
// or the polling client wrapper.
interface RingMeterProps {
  label: string;
  value: number; // 0-1
  color: string;
  size?: number;
  strokeWidth?: number;
}

export function RingMeter({ label, value, color, size = 96, strokeWidth = 10 }: RingMeterProps) {
  const clamped = Math.max(0, Math.min(1, value));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = clamped * circumference;
  const center = size / 2;
  const percentLabel = `${Math.round(clamped * 100)}%`;

  return (
    <div className="flex flex-col items-center gap-2" role="img" aria-label={`${label}: ${percentLabel}`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <title>{`${label}: ${percentLabel}`}</title>
        <circle cx={center} cy={center} r={radius} fill="none" stroke="#E3D6C8" strokeWidth={strokeWidth} />
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference - dash}`}
          transform={`rotate(-90 ${center} ${center})`}
        />
        <text x={center} y={center} textAnchor="middle" dominantBaseline="middle" className="fill-navy text-lg font-bold">
          {percentLabel}
        </text>
      </svg>
      <p className="text-center text-xs text-mist">{label}</p>
    </div>
  );
}

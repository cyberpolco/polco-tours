export interface FunnelStageDatum {
  label: string;
  count: number;
}

interface FunnelChartProps {
  stages: FunnelStageDatum[];
  color: string;
}

/** Sequential drop-off, direct-labeled counts -- honest about being a
 * current-pipeline distribution, not a true historical funnel, where the
 * caller's data is (see insights/domain.ts's BookingStageFunnelStage
 * comment); the visual itself doesn't need to know that distinction. */
export function FunnelChart({ stages, color }: FunnelChartProps) {
  const max = Math.max(1, ...stages.map((s) => s.count));
  return (
    <div className="space-y-2">
      {stages.map((stage) => {
        const widthPct = stage.count > 0 ? Math.max(4, (stage.count / max) * 100) : 0;
        return (
          <div key={stage.label} className="flex items-center gap-3">
            <p className="w-40 shrink-0 text-xs text-mist">{stage.label}</p>
            <div className="h-5 flex-1 rounded-survey bg-rule/40" title={`${stage.label}: ${stage.count}`}>
              <div className="h-5 rounded-survey transition-all" style={{ width: `${widthPct}%`, backgroundColor: color }} />
            </div>
            <p className="w-8 shrink-0 text-right text-xs font-semibold text-navy">{stage.count}</p>
          </div>
        );
      })}
    </div>
  );
}

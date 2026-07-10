// Reusable decorative backdrop: a handful of contour-line paths, evoking a
// topographic map's elevation lines -- the "Meridian Cartography" identity
// substituting for photography (none exists yet, see CLAUDE.md). Meant to
// sit behind a hero/section as an absolutely-positioned, low-opacity layer;
// purely decorative (aria-hidden), safe to reuse on future content pages.
export function TopographicPattern({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 800 500"
      preserveAspectRatio="xMidYMid slice"
      className={className}
      aria-hidden="true"
    >
      <g fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M-20 420 C 160 380, 260 460, 420 400 S 700 340, 860 400" opacity="0.5" />
        <path d="M-20 360 C 180 320, 280 400, 440 340 S 720 280, 860 340" opacity="0.4" />
        <path d="M-20 300 C 200 260, 300 340, 460 280 S 740 220, 860 280" opacity="0.3" />
        <path d="M-20 240 C 220 200, 320 280, 480 220 S 760 160, 860 220" opacity="0.2" />
        <path d="M-20 180 C 240 140, 340 220, 500 160 S 780 100, 860 160" opacity="0.12" />
      </g>
    </svg>
  );
}

// A small crosshair/compass-tick mark standing in for a real logo (none
// exists yet) -- reused in the guest header, footer, and echoed by the
// favicon (src/app/icon.tsx). currentColor-based so it recolors per context
// (amber on navy in the header, navy on bone in the footer).
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="7" stroke="currentColor" strokeWidth="1.25" />
      <path d="M12 1v4M12 19v4M1 12h4M19 12h4" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
    </svg>
  );
}

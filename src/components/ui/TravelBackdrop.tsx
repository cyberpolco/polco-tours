// Faint travel-themed wallpaper for the Browse Packages and Plan My Trip
// pages -- hand-drawn line-art (same thin-stroke, currentColor convention
// as BrandMark.tsx/contact-icons.tsx, charter rule 4: no image asset or
// icon-library dependency, no licensed-photography budget exists either,
// see OI-12). Purely decorative: aria-hidden, pointer-events-none, and low
// enough opacity to never compete with real content for attention. The
// caller's own root element must be `relative` (or otherwise positioned)
// for this absolutely-positioned layer to size against it.

function motifClassName(className?: string) {
  return ['block h-full w-full', className].filter(Boolean).join(' ');
}

function Plane({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" fill="none" className={motifClassName(className)} aria-hidden="true">
      <path
        d="M4 34 28 30 40 8c1-2 4-2 4.5.5L42 30l14 5v4l-14-2-2.5 12 5 4v3l-8.5-3-3 6h-3l-1-6.5L18 35l-2 6h-3l1-9-10-1Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SafariJeep({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 72 48" fill="none" className={motifClassName(className)} aria-hidden="true">
      <path
        d="M6 32V20a3 3 0 0 1 3-3h10l7-9h18l5 9h9a4 4 0 0 1 4 4v11"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M19 17v8M36 8v9M6 32h56M9 8h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M2 32h68" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="18" cy="38" r="6" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="54" cy="38" r="6" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function Elephant({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 72 56" fill="none" className={motifClassName(className)} aria-hidden="true">
      <path
        d="M14 22c0-9 8-16 20-16 13 0 22 8 22 17 0 6-3 10-8 10-1 5-1 11-1 15h-6c0-4 .5-9 1-13-3 1-7 1.5-11 1.5-5 0-9-.5-12-1.5 0 5 0 9 1 13h-6c0-5-.5-11-1-15-6-1-9-5-9-11Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M14 22c-3 1-6 4-6 9s3 7 7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="18" cy="18" r="2" fill="currentColor" />
      <path d="M32 6c4-2 9-2 12 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function Bird({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 24" fill="none" className={motifClassName(className)} aria-hidden="true">
      <path
        d="M2 14c6-10 12-10 22-2 10-8 16-8 22 2-8-4-14-3-22 4-8-7-14-8-22-4Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Camera({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 40" fill="none" className={motifClassName(className)} aria-hidden="true">
      <path
        d="M6 12 9 6h10l3 6h14a4 4 0 0 1 4 4v16a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V16a4 4 0 0 1 4-4Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <circle cx="24" cy="24" r="8" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="24" cy="24" r="3.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

interface Motif {
  Art: typeof Plane;
  top: string;
  left: string;
  size: number;
  rotate: number;
  opacityClass: string;
}

const MOTIFS: Motif[] = [
  { Art: Plane, top: '4%', left: '82%', size: 120, rotate: 8, opacityClass: 'text-navy/[0.05]' },
  { Art: SafariJeep, top: '18%', left: '4%', size: 150, rotate: -4, opacityClass: 'text-forest/[0.06]' },
  { Art: Bird, top: '2%', left: '30%', size: 90, rotate: 4, opacityClass: 'text-navy/[0.06]' },
  { Art: Camera, top: '58%', left: '88%', size: 110, rotate: -10, opacityClass: 'text-amber/[0.07]' },
  { Art: Elephant, top: '68%', left: '2%', size: 170, rotate: 0, opacityClass: 'text-forest/[0.05]' },
  { Art: Bird, top: '40%', left: '60%', size: 60, rotate: -6, opacityClass: 'text-navy/[0.05]' },
  { Art: SafariJeep, top: '86%', left: '55%', size: 130, rotate: 3, opacityClass: 'text-navy/[0.05]' },
];

export function TravelBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden="true">
      {MOTIFS.map(({ Art, top, left, size, rotate, opacityClass }, i) => (
        <div key={i} style={{ position: 'absolute', top, left, width: size, height: size, transform: `rotate(${rotate}deg)` }}>
          <Art className={opacityClass} />
        </div>
      ))}
    </div>
  );
}

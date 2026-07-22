import Image from 'next/image';

// DR-068: real photography isn't sourced yet (no rights/licensing resolved
// -- see CLAUDE.md Open Items), so a package with no `imageUrl` gets one of
// a small set of "Horizon" gradient plates instead of a broken image or an
// empty box. The variant is derived deterministically from `seed` (the
// package id/reference) so the same package always renders the same plate,
// and different packages spread visually across the set rather than all
// looking identical. Swapping in a real photo later is just setting
// `imageUrl` -- no markup change needed at any call site.
const FALLBACK_GRADIENTS = [
  'linear-gradient(155deg, #3b1f3a, #d65b2e)',
  'linear-gradient(155deg, #122b2c, #2f6e4f)',
  'linear-gradient(155deg, #12222f, #2a6b78)',
  'linear-gradient(155deg, #d65b2e, #f2b441)',
  'linear-gradient(155deg, #211a1d, #3b1f3a)',
];

function hashSeed(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

interface PackageImageProps {
  imageUrl: string | null;
  alt: string;
  /** Any stable per-package identifier (id or packageReference) -- picks
   * which fallback gradient plate renders when imageUrl is null. */
  seed: string;
  className?: string;
  /** Set false when already nested inside another `rounded-card
   * overflow-hidden` container (e.g. PackageCard) -- otherwise the image's
   * own bottom corners round independently of the parent's clip, showing a
   * small notch of the parent's background where the two curves disagree. */
  rounded?: boolean;
}

export function PackageImage({ imageUrl, alt, seed, className, rounded = true }: PackageImageProps) {
  const base = ['relative aspect-[16/10] overflow-hidden', rounded && 'rounded-card', className].filter(Boolean).join(' ');

  if (imageUrl) {
    return (
      <div className={base}>
        <Image src={imageUrl} alt={alt} fill sizes="(min-width: 1024px) 380px, 100vw" className="object-cover" />
      </div>
    );
  }

  const gradient = FALLBACK_GRADIENTS[hashSeed(seed) % FALLBACK_GRADIENTS.length];
  return (
    <div className={base} style={{ backgroundImage: gradient }} role="img" aria-label={alt}>
      <svg viewBox="0 0 300 190" preserveAspectRatio="none" className="absolute inset-0 h-full w-full opacity-40">
        <g fill="none" stroke="#f6efe4" strokeWidth={1}>
          <path d="M-10 140 Q80 100 160 130 T320 100" />
          <path d="M-10 160 Q90 130 170 150 T320 130" />
        </g>
      </svg>
    </div>
  );
}

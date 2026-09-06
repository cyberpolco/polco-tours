import { BRAND_LOGO_DATA_URI } from '@lib/brand-logo';
import { fallbackGradientFor } from '@lib/package-fallback-gradient';

// Shared plate for every "static content page" opengraph-image.tsx that
// isn't Packages/a real package/a real gallery site (those three keep their
// own bespoke families -- see each file's own comment). Explicit user
// request: a page's own hero photo (the same one already used as its
// full-bleed background at sm+, see e.g. weather-glass.ts), a centered
// brand-logo watermark at low opacity so the photo still reads through it,
// and the small-badge-plus-title text this app's Packages family already
// established -- all one look so a page with no hero photo of its own
// (Contact/Terms/Gallery index) falls back to the Horizon gradient plate
// instead of a photo, rather than looking unrelated to its siblings.
export const OG_IMAGE_SIZE = { width: 1200, height: 630 };

const LOGO_SIZE = 260;

interface HeroOgPlateProps {
  title: string;
  /** Absolute URL to a plain (non-webp -- next/og's Satori renderer can't
   * decode webp) photo. Omit to render the gradient-only fallback instead. */
  heroImageUrl?: string | null;
  /** Only used when `heroImageUrl` is omitted -- picks which Horizon
   * gradient this page's fallback plate gets (same hash-based pick
   * packages/opengraph-image.tsx's fallback uses). */
  gradientSeed: string;
}

export function HeroOgPlate({ title, heroImageUrl, gradientSeed }: HeroOgPlateProps) {
  const { width, height } = OG_IMAGE_SIZE;
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', fontFamily: 'sans-serif' }}>
      {heroImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- next/og's ImageResponse renders its own <img>, not next/image.
        <img
          src={heroImageUrl}
          width={width}
          height={height}
          alt=""
          style={{ position: 'absolute', inset: 0, objectFit: 'cover' }}
        />
      ) : (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', backgroundImage: fallbackGradientFor(gradientSeed) }} />
      )}

      {/* Text-legibility scrim -- bottom-heavy like gallery/[identifier]'s
          overlay, but lighter, so the photo still shows through overall. */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          backgroundImage: 'linear-gradient(to top, rgba(33,26,29,0.85), rgba(33,26,29,0.15) 60%)',
        }}
      />

      {/* Centered watermark -- low enough opacity that the photo (or
          gradient) behind it stays the dominant thing on the plate. */}
      {/* eslint-disable-next-line @next/next/no-img-element -- next/og's ImageResponse renders its own <img>, not next/image. */}
      <img
        src={BRAND_LOGO_DATA_URI}
        width={LOGO_SIZE}
        height={LOGO_SIZE}
        alt=""
        style={{
          position: 'absolute',
          top: (height - LOGO_SIZE) / 2,
          left: (width - LOGO_SIZE) / 2,
          opacity: 0.16,
        }}
      />

      <div style={{ position: 'absolute', left: 64, right: 64, bottom: 56, display: 'flex', flexDirection: 'column' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            fontSize: 24,
            letterSpacing: 5,
            textTransform: 'uppercase',
            color: 'rgba(246,239,228,0.85)',
          }}
        >
          Mufasa Safaris &amp; Tours
        </div>
        <div style={{ display: 'flex', fontSize: 58, fontWeight: 700, color: '#F6EFE4', marginTop: 12, maxWidth: 1000 }}>{title}</div>
      </div>
    </div>
  );
}

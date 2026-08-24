import { ImageResponse } from 'next/og';
import { fallbackGradientFor } from '@lib/package-fallback-gradient';
import { BRAND_LOGO_DATA_URI } from '@lib/brand-logo';

export const alt = 'Tour packages';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// Keeps the Packages listing on the same small-badge-on-gradient family as
// packages/[packageId]/opengraph-image.tsx's fallback plate, rather than
// inheriting the new full-logo default one level up ((guest)/opengraph-
// image.tsx) -- explicit user direction: the large logo treatment should
// not apply to Packages. Defining this file is what opts this one segment
// out, since Next always prefers a segment's own file over an ancestor's.
export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          padding: 72,
          backgroundImage: fallbackGradientFor('packages'),
          color: '#F6EFE4',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 26, letterSpacing: 6, textTransform: 'uppercase', opacity: 0.75 }}>
          <img src={BRAND_LOGO_DATA_URI} width={40} height={40} alt="" />
          Mufasa Safaris & Tours
        </div>
        <div style={{ display: 'flex', fontSize: 60, fontWeight: 700, marginTop: 16, maxWidth: 1000 }}>Tour Packages</div>
      </div>
    ),
    { ...size },
  );
}

import { ImageResponse } from 'next/og';
import { BRAND_LOGO_DATA_URI } from '@lib/brand-logo';

export const alt = 'Mufasa Safaris & Tours';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// Default link-preview image for every guest page -- explicit user request:
// share a homepage/about/faq/etc. link and see the real logo in full,
// rather than nothing (no default existed before this file). Next's
// file-convention metadata images inherit down the segment tree, so this
// covers "/", "/about", "/faq", "/gallery", etc. automatically with no
// per-page wiring -- EXCEPT the Packages tree, which explicitly keeps its
// own smaller-badge-on-gradient family instead (packages/opengraph-image.tsx
// for the listing page, packages/[packageId]/opengraph-image.tsx for a real
// package, real-photo-first) by defining its own file at that segment,
// which Next always prefers over this ancestor default.
export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#3B1F3A',
          fontFamily: 'sans-serif',
        }}
      >
        <img src={BRAND_LOGO_DATA_URI} width={400} height={400} alt="" />
        <div style={{ display: 'flex', fontSize: 48, fontWeight: 700, color: '#F6EFE4', marginTop: 16 }}>Mufasa Safaris & Tours</div>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            textAlign: 'center',
            fontSize: 22,
            color: '#8C7D78',
            marginTop: 12,
            maxWidth: 860,
            lineHeight: 1.4,
          }}
        >
          One system handles both sides of a trip: the packages you browse, and everything behind them! Tourism OS Powered by Cyber PolCo
        </div>
      </div>
    ),
    { ...size },
  );
}

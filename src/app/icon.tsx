import { ImageResponse } from 'next/og';

// Dynamic favicon (Next's icon.tsx convention) -- no logo asset exists yet,
// so this renders the same crosshair/compass-tick motif as BrandMark
// (src/components/BrandMark.tsx) at request time. Plain flex/div shapes
// rather than inline SVG, for reliable Satori (next/og's renderer) support.
export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#152238',
          borderRadius: 6,
          position: 'relative',
        }}
      >
        <div style={{ position: 'absolute', width: 18, height: 18, borderRadius: '50%', border: '1.5px solid #C97B2D' }} />
        <div style={{ position: 'absolute', width: 22, height: 1.5, background: '#C97B2D' }} />
        <div style={{ position: 'absolute', width: 1.5, height: 22, background: '#C97B2D' }} />
        <div style={{ position: 'absolute', width: 4, height: 4, borderRadius: '50%', background: '#C97B2D' }} />
      </div>
    ),
    { ...size },
  );
}

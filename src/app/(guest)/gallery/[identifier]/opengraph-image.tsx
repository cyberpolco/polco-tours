import { ImageResponse } from 'next/og';
import sharp from 'sharp';
import { cmsService } from '@modules/cms';
import { fallbackGradientFor } from '@lib/package-fallback-gradient';
import { BRAND_LOGO_DATA_URI } from '@lib/brand-logo';

export const alt = 'Gallery preview';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
// sharp (below) needs Node's native bindings -- not available on the Edge
// runtime -- same convention as packages/[packageId]/opengraph-image.tsx,
// this repo's other sharp-in-an-OG-route consumer.
export const runtime = 'nodejs';

interface Props {
  // Either the staff-editable `slug` or the raw `slotKey` (DR-254) --
  // cmsService.getPublicMediaItem resolves both the same way.
  params: Promise<{ identifier: string }>;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

// Logo top-right + title + a snippet of the description, laid over the
// site's own photo (or, absent one, a gradient plate) -- unlike
// packages/[packageId]'s OG image (a bare photo with no overlay when a real
// photo exists), a shared gallery link should always carry the brand mark
// and the site's own name/blurb, per explicit user request.
function overlay(title: string, description: string | null) {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column' }}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          backgroundImage: 'linear-gradient(to top, rgba(33,26,29,0.92), rgba(33,26,29,0.08) 55%)',
        }}
      />
      <img src={BRAND_LOGO_DATA_URI} width={72} height={72} alt="" style={{ position: 'absolute', top: 40, right: 40 }} />
      <div style={{ position: 'absolute', left: 64, right: 64, bottom: 56, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', fontSize: 54, fontWeight: 700, color: '#F6EFE4' }}>{title}</div>
        {description && (
          <div style={{ display: 'flex', fontSize: 26, color: 'rgba(246,239,228,0.85)', marginTop: 14, maxWidth: 1000 }}>
            {truncate(description, 140)}
          </div>
        )}
      </div>
    </div>
  );
}

export default async function Image({ params }: Props) {
  const { identifier } = await params;

  let title = 'Mufasa Safaris & Tours';
  let description: string | null = null;
  let imageUrl: string | null = null;
  try {
    const item = await cmsService.getPublicMediaItem('gallery', identifier);
    if (item?.name) {
      title = item.name;
      description = item.description;
      imageUrl = item.mediaType === 'image' ? item.url : null;
    }
  } catch {
    // Unknown slot -- fall through to the generic plate below.
  }

  if (imageUrl) {
    // Same webp-decode workaround as packages/[packageId]/opengraph-image.tsx
    // -- next/og's Satori renderer can't decode webp, and every image upload
    // since DR-163 is compressed to webp server-side.
    try {
      const res = await fetch(imageUrl);
      if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
      const inputBuffer = Buffer.from(await res.arrayBuffer());
      const pngBuffer = await sharp(inputBuffer).resize(size.width, size.height, { fit: 'cover' }).png().toBuffer();
      const dataUri = `data:image/png;base64,${pngBuffer.toString('base64')}`;
      return new ImageResponse(
        (
          <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex' }}>
            <img src={dataUri} width={size.width} height={size.height} alt="" style={{ position: 'absolute', inset: 0 }} />
            {overlay(title, description)}
          </div>
        ),
        { ...size },
      );
    } catch {
      // A broken/unreachable Blob URL or a decode failure falls through to
      // the gradient plate below -- never crash the social-preview route.
    }
  }

  return new ImageResponse(
    (
      <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', backgroundImage: fallbackGradientFor(identifier) }}>
        {overlay(title, description)}
      </div>
    ),
    { ...size },
  );
}

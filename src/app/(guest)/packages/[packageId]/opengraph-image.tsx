import { ImageResponse } from 'next/og';
import sharp from 'sharp';
import { catalogService } from '@modules/catalog';
import { fallbackGradientFor } from '@lib/package-fallback-gradient';

export const alt = 'Package preview';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
// sharp (below) needs Node's native bindings -- not available on the Edge
// runtime -- same convention as cms/media-upload/route.ts, this repo's other
// sharp consumer.
export const runtime = 'nodejs';

interface Props {
  params: Promise<{ packageId: string }>;
}

// DR-118 follow-up: a shared package link had no og:image at all, so every
// chat app/social preview fell back to nothing. This file's name is a
// Next.js convention -- it's served at .../packages/[packageId]/opengraph-image
// and auto-wired into the page's og:image/twitter:image, no generateMetadata
// wiring needed for the image itself. Real photography still isn't sourced
// (OI-12), so a package with no `imageUrl` gets the same "Horizon" gradient
// plate PackageImage already renders in-page, with the title overlaid,
// rather than a blank/broken preview.
export default async function Image({ params }: Props) {
  const { packageId } = await params;

  let title = 'Mufasa Safaris & Tours';
  let imageUrl: string | null = null;
  try {
    const { pkg } = await catalogService.getPublicPackageWithDepartures(packageId);
    title = pkg.title;
    // DR-172: the cover (first of up to 3 images) -- a static social preview
    // has no room for a slideshow.
    imageUrl = pkg.imageUrls[0] ?? null;
  } catch {
    // Unknown/unpublished package -- fall through to the generic plate below.
  }

  if (imageUrl) {
    // Real production bug: every image uploaded since DR-163 is compressed
    // to webp, and next/og's renderer (Satori) can't decode webp -- a bare
    // <img src={webpUrl}> silently produced a blank white 1200x630 plate
    // instead of throwing (confirmed against a live webp-covered package;
    // a pre-DR-163 PNG-covered package rendered correctly). Re-encoding
    // through sharp (already a pinned dependency) to PNG before handing it
    // to Satori sidesteps the decode gap regardless of the source format.
    try {
      const res = await fetch(imageUrl);
      if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
      const inputBuffer = Buffer.from(await res.arrayBuffer());
      const pngBuffer = await sharp(inputBuffer).resize(size.width, size.height, { fit: 'cover' }).png().toBuffer();
      const dataUri = `data:image/png;base64,${pngBuffer.toString('base64')}`;
      return new ImageResponse(<img src={dataUri} width={size.width} height={size.height} alt="" />, { ...size });
    } catch {
      // A broken/unreachable Blob URL or a decode failure falls through to
      // the generic plate below -- never crash the social-preview route.
    }
  }

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
          backgroundImage: fallbackGradientFor(packageId),
          color: '#F6EFE4',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', fontSize: 26, letterSpacing: 6, textTransform: 'uppercase', opacity: 0.75 }}>
          Mufasa Safaris & Tours
        </div>
        <div style={{ display: 'flex', fontSize: 60, fontWeight: 700, marginTop: 16, maxWidth: 1000 }}>{title}</div>
      </div>
    ),
    { ...size },
  );
}

import { ImageResponse } from 'next/og';
import { catalogService } from '@modules/catalog';
import { fallbackGradientFor } from '@lib/package-fallback-gradient';

export const alt = 'Package preview';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

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

  let title = 'Polco Tours';
  let imageUrl: string | null = null;
  try {
    const { pkg } = await catalogService.getPublicPackageWithDepartures(packageId);
    title = pkg.title;
    imageUrl = pkg.imageUrl;
  } catch {
    // Unknown/unpublished package -- fall through to the generic plate below.
  }

  if (imageUrl) {
    return new ImageResponse(
      (
        <img src={imageUrl} width={size.width} height={size.height} style={{ objectFit: 'cover' }} alt="" />
      ),
      { ...size },
    );
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
          Polco Tours
        </div>
        <div style={{ display: 'flex', fontSize: 60, fontWeight: 700, marginTop: 16, maxWidth: 1000 }}>{title}</div>
      </div>
    ),
    { ...size },
  );
}

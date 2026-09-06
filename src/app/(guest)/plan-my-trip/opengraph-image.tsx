import { ImageResponse } from 'next/og';
import { HeroOgPlate, OG_IMAGE_SIZE } from '@lib/hero-opengraph';

export const alt = 'Plan My Trip';
export const size = OG_IMAGE_SIZE;
export const contentType = 'image/png';

// Reuses this page's own full-bleed hero photo (nile-crocodile.jpg, see
// page.tsx) rather than the generic (guest)/opengraph-image.tsx logo plate
// -- explicit user request to give every content page a distinct, photo-led
// preview. Absolute URL, not a relative /public path: next/og's Satori
// renderer needs a real fetchable URL for a remote/local image (same
// technique notifications/email-template.ts's brand logo already uses for a
// public/ asset, DR-239) -- and since this is a plain JPEG, not webp,
// Satori decodes it directly with no sharp re-encode needed (unlike
// packages/[packageId]'s and gallery/[identifier]'s webp-covered photos).
export default function Image() {
  return new ImageResponse(
    <HeroOgPlate title="Plan My Trip" heroImageUrl="https://mufasasafaris.com/images/hero/nile-crocodile.jpg" gradientSeed="plan-my-trip" />,
    { ...size },
  );
}

// Shared kernel — generic "upload a public image to Vercel Blob" capability
// (charter rule 8: third-party integrations wrapped so a failure never
// crashes the request). Originally lived only in content/gateway.ts (DR-071,
// About/FAQ image uploads); promoted here (DR-114) so catalog module's
// package-image upload can reuse the same Vercel Blob mechanics under its
// own permission gate (catalog.write) instead of content's SUPERADMIN-only
// gate. Distinct from documents/gateway.ts's `access: 'private'` wrapper
// (passports/compliance docs, server-streamed, never a public URL) -- guest
// pages render these directly via <img>/next/image, unauthenticated, so they
// need a real public URL.
import { put } from '@vercel/blob';

export class PublicImageBlobGatewayError extends Error {}

export interface PublicImageUploadResult {
  pathname: string;
  url: string;
}

export interface PublicImageBlobGateway {
  uploadPublicImage(pathname: string, body: Buffer, contentType: string): Promise<PublicImageUploadResult>;
}

class VercelPublicImageBlobGateway implements PublicImageBlobGateway {
  async uploadPublicImage(pathname: string, body: Buffer, contentType: string): Promise<PublicImageUploadResult> {
    try {
      const blob = await put(pathname, body, { access: 'public', addRandomSuffix: true, contentType });
      return { pathname: blob.pathname, url: blob.url };
    } catch {
      throw new PublicImageBlobGatewayError('Public image upload failed');
    }
  }
}

export const publicImageBlobGateway: PublicImageBlobGateway = new VercelPublicImageBlobGateway();

// Validation shared by every module that uploads a public image this way
// (content's About/FAQ images, catalog's package images) -- one vocabulary
// of allowed types/size rather than each module inventing its own.
export const MAX_PUBLIC_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
const PUBLIC_IMAGE_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export function isValidPublicImageUpload(contentType: string, sizeBytes: number): boolean {
  return PUBLIC_IMAGE_CONTENT_TYPES.includes(contentType) && sizeBytes > 0 && sizeBytes <= MAX_PUBLIC_IMAGE_SIZE_BYTES;
}

export function publicImageExtension(contentType: string): string {
  if (contentType === 'image/png') return 'png';
  if (contentType === 'image/webp') return 'webp';
  return 'jpg';
}

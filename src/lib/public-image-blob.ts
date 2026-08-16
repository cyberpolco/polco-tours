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
import { logger, newTraceId } from './logger';

export class PublicImageBlobGatewayError extends Error {}

export interface PublicImageUploadResult {
  pathname: string;
  url: string;
}

export interface PublicImageBlobGateway {
  uploadPublicImage(pathname: string, body: Buffer, contentType: string): Promise<PublicImageUploadResult>;
}

// The default `BLOB_READ_WRITE_TOKEN` is bound to `polco-tours-documents`, a
// store provisioned private-only (documents/gateway.ts's passport uploads) --
// Vercel Blob stores are public-or-private store-wide, not per-object, so an
// `access: 'public'` put() against that token always fails. A second store,
// `polco-tours-public-images`, is connected under a distinct env var for
// exactly this reason; every public image upload must pass its token
// explicitly rather than relying on the ambient default.
const PUBLIC_IMAGE_BLOB_TOKEN = process.env.PUBLIC_BLOB_READ_WRITE_TOKEN_READ_WRITE_TOKEN;

class VercelPublicImageBlobGateway implements PublicImageBlobGateway {
  async uploadPublicImage(pathname: string, body: Buffer, contentType: string): Promise<PublicImageUploadResult> {
    try {
      const blob = await put(pathname, body, {
        access: 'public',
        addRandomSuffix: true,
        contentType,
        token: PUBLIC_IMAGE_BLOB_TOKEN,
      });
      return { pathname: blob.pathname, url: blob.url };
    } catch (err) {
      // The caller only ever surfaces a generic message to the client (no
      // internals leaked, charter rule) -- this was previously a bare
      // `catch {}` with no log line at all, making a real failure here
      // (missing/invalid BLOB_READ_WRITE_TOKEN, a Vercel Blob outage, a
      // pathname collision, etc.) completely invisible server-side too.
      logger(newTraceId()).error('public image upload failed', {
        message: err instanceof Error ? err.message : String(err),
        pathname,
      });
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

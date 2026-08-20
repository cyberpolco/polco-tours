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
//
// DR-163: every public image upload is compressed to webp here, in this one
// shared primitive, rather than in cms's or catalog's or Home hero's own
// upload code -- catalog's package-image upload gets compressed output too,
// as a direct (deliberate, not accidental) side effect of the fix living at
// this level instead of being duplicated per caller.
import sharp from 'sharp';
import { put } from '@vercel/blob';
import { logger, newTraceId } from './logger';

export class PublicImageBlobGatewayError extends Error {}
// Distinct from PublicImageBlobGatewayError -- a bad/corrupt input file is
// the caller's fault (maps to a validation error), not an upload/infra
// failure (maps to an internal error).
export class PublicImageCompressionError extends Error {}

// Caps the longest edge rather than a fixed width/height so both landscape
// and portrait uploads compress sensibly; quality 80 is a standard
// visually-lossless-enough default for photographic web content.
const MAX_IMAGE_DIMENSION_PX = 2560;
const WEBP_QUALITY = 80;

async function compressToWebp(body: Buffer): Promise<Buffer> {
  return sharp(body)
    .resize({ width: MAX_IMAGE_DIMENSION_PX, height: MAX_IMAGE_DIMENSION_PX, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer();
}

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
// Exported (DR-163) so the cms media-upload route can mint client tokens
// against this same public-images store for direct browser-to-Blob video
// uploads -- videos aren't run through uploadPublicImage at all (no
// compression, DR-162/163), so they need this token directly rather than
// going through the gateway above.
export const PUBLIC_IMAGE_BLOB_TOKEN = process.env.PUBLIC_BLOB_READ_WRITE_TOKEN_READ_WRITE_TOKEN;

class VercelPublicImageBlobGateway implements PublicImageBlobGateway {
  // `contentType` is accepted for interface compatibility with every
  // existing call site, but is no longer used -- the output is always
  // recompressed to webp regardless of what the caller declared.
  async uploadPublicImage(pathname: string, body: Buffer, _contentType: string): Promise<PublicImageUploadResult> {
    let webpBody: Buffer;
    try {
      webpBody = await compressToWebp(body);
    } catch (err) {
      // A malformed/corrupt image is a validation problem, not an
      // infrastructure one -- surfaced distinctly so callers can map it to
      // Errors.validation rather than a generic upload failure.
      logger(newTraceId()).warn('image compression failed, rejecting upload', {
        message: err instanceof Error ? err.message : String(err),
      });
      throw new PublicImageCompressionError('Unable to process image');
    }
    // Always .webp now, regardless of the original extension the caller's
    // pathname was built with.
    const webpPathname = pathname.replace(/\.[^./]+$/, '.webp');
    try {
      const blob = await put(webpPathname, webpBody, {
        access: 'public',
        addRandomSuffix: true,
        contentType: 'image/webp',
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
        pathname: webpPathname,
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

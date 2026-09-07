import { NextRequest, NextResponse } from 'next/server';
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { ZodError } from 'zod';
import { authService } from '@modules/auth';
import { ApiError, Errors, problemResponse } from '@lib/errors';
import { logger, newTraceId } from '@lib/logger';
import { MAX_PUBLIC_IMAGE_SIZE_BYTES, PUBLIC_IMAGE_BLOB_TOKEN, PUBLIC_IMAGE_CONTENT_TYPES } from '@lib/public-image-blob';
import { assertCan } from '@lib/rbac';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * DR-264: package images uploaded straight from the browser to Vercel Blob,
 * instead of proxied as file bytes through createPackageAction/
 * updatePackageAction's Server Action -- a single image anywhere close to
 * this app's global 4.5MB Server Action body cap (next.config.mjs) could
 * fail at the platform boundary before ever reaching the app's own 5MB
 * validation or DR-163's webp-compression step, the same class of problem
 * DR-216/257 already fixed for passport uploads.
 *
 * Unlike cms/media-upload (video) and documents/passport-upload (PDF),
 * what lands here is NOT the final asset -- it's a temporary RAW upload.
 * The browser's own follow-up call to finalizePackageImageUploadAction
 * fetches these bytes back server-side, compresses them through the exact
 * same catalogService.uploadPackageImage()/DR-163 webp pipeline every other
 * image upload uses, and deletes this raw blob once the compressed
 * replacement exists -- so "every public image is compressed to webp"
 * stays true with no exception; only the client-to-server leg for the raw
 * bytes moves off this app's Server Action body limit.
 *
 * Same two-caller shape as the other blob routes (cms/media-upload,
 * documents/passport-upload) and NOT wrapped in withAuth for the same
 * reason: Vercel's own upload-completed callback carries no staff session
 * cookie and is verified by handleUpload's own request signature, so a
 * blanket guard would reject it before that verification ever runs.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const traceId = request.headers.get('x-trace-id') ?? newTraceId();
  const body = (await request.json()) as HandleUploadBody;

  try {
    if (body.type === 'blob.generate-client-token') {
      const ctx = await authService.resolveSession(request.headers);
      try {
        assertCan(ctx, 'catalog.write');
      } catch {
        throw Errors.forbidden(`${ctx.roles.join('+')} lacks catalog.write`);
      }
    }

    const jsonResponse = await handleUpload({
      body,
      request,
      token: PUBLIC_IMAGE_BLOB_TOKEN,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: [...PUBLIC_IMAGE_CONTENT_TYPES],
        maximumSizeInBytes: MAX_PUBLIC_IMAGE_SIZE_BYTES,
        addRandomSuffix: true,
      }),
      onUploadCompleted: async () => {
        // Intentional no-op -- see module comment above; the browser's own
        // follow-up finalizePackageImageUploadAction call does the real
        // work (compress + persist + delete-the-raw-blob), avoiding any
        // race between this webhook and that call, same convention as
        // every other route here.
      },
    });
    return NextResponse.json(jsonResponse);
  } catch (err) {
    if (err instanceof ApiError) return problemResponse(err, { traceId });
    if (err instanceof ZodError) return problemResponse(Errors.validation(err.message), { traceId });
    logger(traceId).error('package-image-upload route error', {
      message: err instanceof Error ? err.message : String(err),
    });
    return problemResponse(Errors.internal(), { traceId });
  }
}

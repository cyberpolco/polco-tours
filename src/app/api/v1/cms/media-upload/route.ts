import { NextRequest, NextResponse } from 'next/server';
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { ZodError } from 'zod';
import { authService } from '@modules/auth';
import { CMS_VIDEO_CONTENT_TYPES, MAX_CMS_VIDEO_SIZE_BYTES } from '@modules/cms';
import { ApiError, Errors, problemResponse } from '@lib/errors';
import { logger, newTraceId } from '@lib/logger';
import { PUBLIC_IMAGE_BLOB_TOKEN } from '@lib/public-image-blob';
import { assertCan } from '@lib/rbac';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * DR-163 (Home hero video upload) -- this module's first REST route,
 * needed because a 25MB video exceeds Vercel serverless functions' request
 * body limit, so the browser must upload directly to Vercel Blob instead
 * of proxying bytes through a Server Action like every other cms upload.
 *
 * NOT wrapped in `withAuth` (`src/lib/route-guard.ts`) like every other
 * /api/v1 route: this single route is hit by two different callers with
 * two different trust models --
 *   1. our own staff browser, requesting a client token
 *      (`body.type === 'blob.generate-client-token'`) -- carries a normal
 *      staff session cookie, gated below exactly like `requireCmsWriter`
 *      (cms.write permission + hardcoded SUPERADMIN check).
 *   2. Vercel's own backend, reporting upload completion
 *      (`body.type === 'blob.upload-completed'`) -- no staff session
 *      cookie at all; `handleUpload` verifies this call via Vercel's own
 *      request signature internally. Gating the whole handler behind
 *      `withAuth` would 403 this callback before it ever reached that
 *      verification.
 * `onUploadCompleted` is a deliberate no-op: the actual CmsMediaItem write
 * happens via the browser's own follow-up call to setSlideMediaAction
 * once `upload()` resolves client-side, not via this webhook -- avoids any
 * race between the two.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const traceId = request.headers.get('x-trace-id') ?? newTraceId();
  const body = (await request.json()) as HandleUploadBody;

  try {
    if (body.type === 'blob.generate-client-token') {
      const ctx = await authService.resolveSession(request.headers);
      try {
        assertCan(ctx, 'cms.write');
      } catch {
        throw Errors.forbidden(`${ctx.roles.join('+')} lacks cms.write`);
      }
      if (!ctx.roles.includes('SUPERADMIN')) {
        throw Errors.forbidden('Only SUPERADMIN may upload site media');
      }
    }

    const jsonResponse = await handleUpload({
      body,
      request,
      token: PUBLIC_IMAGE_BLOB_TOKEN,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: [...CMS_VIDEO_CONTENT_TYPES],
        maximumSizeInBytes: MAX_CMS_VIDEO_SIZE_BYTES,
        addRandomSuffix: true,
      }),
      onUploadCompleted: async () => {
        // Intentional no-op -- see module comment above.
      },
    });
    return NextResponse.json(jsonResponse);
  } catch (err) {
    if (err instanceof ApiError) return problemResponse(err, { traceId });
    if (err instanceof ZodError) return problemResponse(Errors.validation(err.message), { traceId });
    logger(traceId).error('cms media-upload route error', {
      message: err instanceof Error ? err.message : String(err),
    });
    return problemResponse(Errors.internal(), { traceId });
  }
}

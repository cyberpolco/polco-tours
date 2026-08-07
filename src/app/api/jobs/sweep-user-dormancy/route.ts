import { NextRequest, NextResponse } from 'next/server';
import { authService } from '@modules/auth';
import { ApiError, Errors, problemResponse } from '@lib/errors';
import { logger, newTraceId } from '@lib/logger';
import { verifyQstashSignature } from '@lib/qstash';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Scheduled job target for QStash (DR-084) -- flags a staff account
 * dormant (sign-in blocked, see databaseHooks.session.create.before in
 * src/lib/auth.ts) after 30+ days without signing in. TOURIST accounts and
 * SUPERADMIN are excluded (see authRepository.markDormantUsers). Same
 * infra shape as /api/jobs/sweep-bookings (DR-067) and /api/jobs/sweep-
 * fleet-availability (DR-082): QStash-signature-gated, no AuthContext,
 * sits outside /api/v1.
 *
 * Inert (always 401s) until `npm run qstash:register-schedule` registers a
 * real schedule against this route's deployed URL -- see that script.
 */
export const POST = async (req: NextRequest): Promise<NextResponse> => {
  const traceId = req.headers.get('x-trace-id') ?? newTraceId();
  try {
    const body = await req.text();
    const signature = req.headers.get('upstash-signature');
    const verified = await verifyQstashSignature(signature, body);
    if (!verified) throw Errors.unauthorized('Invalid QStash signature');

    const result = await authService.runDormancySweep();
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof ApiError) return problemResponse(err, { traceId });
    logger(traceId).error('unhandled scheduled-job error', {
      message: err instanceof Error ? err.message : String(err),
    });
    return problemResponse(Errors.internal(), { traceId });
  }
};

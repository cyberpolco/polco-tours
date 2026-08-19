import { NextRequest, NextResponse } from 'next/server';
import { analyticsService } from '@modules/analytics';
import { ApiError, Errors, problemResponse } from '@lib/errors';
import { logger, newTraceId } from '@lib/logger';
import { verifyQstashSignature } from '@lib/qstash';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Scheduled job target for QStash (DR-155) -- purges WizardProgressEvent
 * rows older than 30 days (analyticsService.purgeOldEvents, the retention
 * window decided for this anonymous-tracking data). Same infra shape as
 * /api/jobs/sweep-user-dormancy: QStash-signature-gated, no AuthContext,
 * sits outside /api/v1.
 *
 * Coded but NOT YET registered against the live deployment -- run
 * `npm run qstash:register-schedule` to activate it (see that script's
 * SCHEDULES list), same "coded but not yet registered" caveat as DR-107's
 * fleet-cooldown sweep carried before it was activated.
 */
export const POST = async (req: NextRequest): Promise<NextResponse> => {
  const traceId = req.headers.get('x-trace-id') ?? newTraceId();
  try {
    const body = await req.text();
    const signature = req.headers.get('upstash-signature');
    const verified = await verifyQstashSignature(signature, body);
    if (!verified) throw Errors.unauthorized('Invalid QStash signature');

    const result = await analyticsService.purgeOldEvents();
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof ApiError) return problemResponse(err, { traceId });
    logger(traceId).error('unhandled scheduled-job error', {
      message: err instanceof Error ? err.message : String(err),
    });
    return problemResponse(Errors.internal(), { traceId });
  }
};

import { NextRequest, NextResponse } from 'next/server';
import { resyncRecentlyEndedDepartures } from '@lib/fleet-availability';
import { ApiError, Errors, problemResponse } from '@lib/errors';
import { logger, newTraceId } from '@lib/logger';
import { verifyQstashSignature } from '@lib/qstash';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Scheduled job target for QStash (DR-107) -- the only thing that flips a
 * vehicle/driver/guide from BOOKED back to AVAILABLE once its post-tour
 * cooldown window (fleet/domain.ts's POST_TOUR_AVAILABILITY_DELAY_HOURS)
 * has actually elapsed. None of syncFleetAvailabilityForDeparture's other
 * call sites (assignment create/remove, booking confirm/cancel/refund, the
 * lifecycle sweep's own COMPLETED transition) fire again on their own after
 * the fact, so without this job a resource would stay stuck at BOOKED
 * forever past its cooldown. Runs hourly (registered separately from the
 * existing daily 60-day-inactivity sweep, /api/jobs/sweep-fleet-availability
 * -- that cadence is too coarse for a 24h window). Same infra shape as every
 * other scheduled job here: QStash-signature-gated, no AuthContext, sits
 * outside /api/v1.
 */
export const POST = async (req: NextRequest): Promise<NextResponse> => {
  const traceId = req.headers.get('x-trace-id') ?? newTraceId();
  try {
    const body = await req.text();
    const signature = req.headers.get('upstash-signature');
    const verified = await verifyQstashSignature(signature, body);
    if (!verified) throw Errors.unauthorized('Invalid QStash signature');

    await resyncRecentlyEndedDepartures();
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ApiError) return problemResponse(err, { traceId });
    logger(traceId).error('unhandled scheduled-job error', {
      message: err instanceof Error ? err.message : String(err),
    });
    return problemResponse(Errors.internal(), { traceId });
  }
};

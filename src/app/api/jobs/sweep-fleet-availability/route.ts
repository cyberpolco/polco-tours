import { NextRequest, NextResponse } from 'next/server';
import { fleetService } from '@modules/fleet';
import { ApiError, Errors, problemResponse } from '@lib/errors';
import { logger, newTraceId } from '@lib/logger';
import { verifyQstashSignature } from '@lib/qstash';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Scheduled job target for QStash (DR-082) -- catches the "hasn't been
 * assigned a CONFIRMED-or-later booking in 60+ days" inactivity case across
 * every organization. This is the safety net, not the primary mechanism:
 * most availability changes are already immediate (see
 * src/lib/fleet-availability.ts's hooks off assignment create/remove and
 * booking confirm/cancel/refund) -- this only ever needs to run
 * infrequently, since it exclusively moves AVAILABLE -> INACTIVE once
 * lastActiveAt is stale. Same infra shape as /api/jobs/sweep-bookings
 * (DR-067): QStash-signature-gated, no AuthContext, sits outside /api/v1.
 *
 * Registered and live (`npm run qstash:register-schedule`, 2026-08-10) --
 * see that script for the full schedule list.
 */
export const POST = async (req: NextRequest): Promise<NextResponse> => {
  const traceId = req.headers.get('x-trace-id') ?? newTraceId();
  try {
    const body = await req.text();
    const signature = req.headers.get('upstash-signature');
    const verified = await verifyQstashSignature(signature, body);
    if (!verified) throw Errors.unauthorized('Invalid QStash signature');

    const result = await fleetService.runAvailabilitySweep();
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof ApiError) return problemResponse(err, { traceId });
    logger(traceId).error('unhandled scheduled-job error', {
      message: err instanceof Error ? err.message : String(err),
    });
    return problemResponse(Errors.internal(), { traceId });
  }
};

import { NextRequest, NextResponse } from 'next/server';
import { bookingService } from '@modules/booking';
import { ApiError, Errors, problemResponse } from '@lib/errors';
import { syncFleetAvailabilityForDeparture } from '@lib/fleet-availability';
import { logger, newTraceId } from '@lib/logger';
import { verifyQstashSignature } from '@lib/qstash';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Scheduled job target for QStash (DR-067) -- runs the booking module's
 * lifecycle sweep (expired holds -> CANCELLED, CONFIRMED -> IN_PROGRESS ->
 * COMPLETED, soft-deleted-past-retention purge) across every organization,
 * not just whichever one happens to be touched by user traffic right now.
 * Sits outside /api/v1 (infra, not a versioned REST resource) alongside
 * /api/auth, same precedent.
 *
 * DR-094: this is the ONLY path a booking ever travels CONFIRMED ->
 * IN_PROGRESS -> COMPLETED through -- unlike a manual confirm/cancel/
 * refund, this raw-SQL sweep can't call src/lib/fleet-availability.ts's
 * hook itself, so it never used to notify fleet availability at all. A
 * vehicle/driver/guide assigned to a departure whose booking only ever
 * advanced via this sweep would sit at whatever availability it had
 * (usually the AVAILABLE column default) forever, even while their tour
 * was genuinely in progress. Resync each transitioned departure here,
 * one level up from both modules, same convention as the confirm/cancel/
 * refund routes.
 *
 * Gated by QStash's own request signature, not a user session -- there is
 * no AuthContext for "the platform's own scheduler." verifyQstashSignature
 * returns false both when the signature is invalid AND when
 * QSTASH_CURRENT_SIGNING_KEY/QSTASH_NEXT_SIGNING_KEY are unset (OI-11, no
 * account provisioned yet) -- either way this route rejects the request
 * rather than running an unverified sweep, since (unlike the notification
 * gateways or the Redis rate limiter, DR-066) there is no safe fallback
 * BEHAVIOR for an unauthenticated caller triggering a cross-org bulk
 * mutation. Register the real QStash schedule via
 * `npm run qstash:register-schedule` once OI-11's credentials exist; this
 * route is inert (always 401s) with zero traffic until then.
 */
export const POST = async (req: NextRequest): Promise<NextResponse> => {
  const traceId = req.headers.get('x-trace-id') ?? newTraceId();
  try {
    const body = await req.text();
    const signature = req.headers.get('upstash-signature');
    const verified = await verifyQstashSignature(signature, body);
    if (!verified) throw Errors.unauthorized('Invalid QStash signature');

    const result = await bookingService.runScheduledSweep();
    // Sequential, not Promise.all -- same connection-pool-exhaustion
    // precedent runScheduledSweep's own per-org loop follows.
    for (const { organizationId, departureId } of result.transitionedDepartures) {
      await syncFleetAvailabilityForDeparture(organizationId, departureId);
    }
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof ApiError) return problemResponse(err, { traceId });
    logger(traceId).error('unhandled scheduled-job error', {
      message: err instanceof Error ? err.message : String(err),
    });
    return problemResponse(Errors.internal(), { traceId });
  }
};

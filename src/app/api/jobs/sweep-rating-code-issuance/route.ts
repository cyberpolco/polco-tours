import { NextRequest, NextResponse } from 'next/server';
import { ratingsService } from '@modules/ratings';
import { ApiError, Errors, problemResponse } from '@lib/errors';
import { logger, newTraceId } from '@lib/logger';
import { verifyQstashSignature } from '@lib/qstash';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Scheduled job target for QStash (DR-261) -- the automatic trigger for
 * issuing a booking's Rating Code the night before its tour ends, at 21:00
 * in every operating country's fixed UTC+2 offset (19:00 UTC -- see
 * ratings/domain.ts's tomorrowUtcDayRange comment), addressed to the tour
 * lead. Runs once daily. Unlike the manual staff-issued path
 * (ratingsService.issueRatingCode), this one deliberately does not require
 * the invoice to be PAID (explicit user decision, DR-261) -- see
 * ratingsService.runAutomaticRatingCodeIssuance's own comment. Same infra
 * shape as every other scheduled job here: QStash-signature-gated, no
 * AuthContext, sits outside /api/v1.
 */
export const POST = async (req: NextRequest): Promise<NextResponse> => {
  const traceId = req.headers.get('x-trace-id') ?? newTraceId();
  try {
    const body = await req.text();
    const signature = req.headers.get('upstash-signature');
    const verified = await verifyQstashSignature(signature, body);
    if (!verified) throw Errors.unauthorized('Invalid QStash signature');

    const result = await ratingsService.runAutomaticRatingCodeIssuance();
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof ApiError) return problemResponse(err, { traceId });
    logger(traceId).error('unhandled scheduled-job error', {
      message: err instanceof Error ? err.message : String(err),
    });
    return problemResponse(Errors.internal(), { traceId });
  }
};

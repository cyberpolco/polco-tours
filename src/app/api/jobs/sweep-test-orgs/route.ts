import { NextRequest, NextResponse } from 'next/server';
import { purgeStaleTestOrganizations } from '@lib/test-org-purge';
import { ApiError, Errors, problemResponse } from '@lib/errors';
import { logger, newTraceId } from '@lib/logger';
import { verifyQstashSignature } from '@lib/qstash';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Scheduled job target for QStash (DR-235) -- deletes any leftover
 * test-fixture Organization (and everything cascaded under it) older than
 * an hour, matching the `tests/api/*.test.ts` naming convention. Same infra
 * shape as /api/jobs/sweep-user-dormancy (DR-084) and the other sweep-*
 * jobs: QStash-signature-gated, no AuthContext, sits outside /api/v1.
 *
 * Registered via `npm run qstash:register-schedule` -- see that script for
 * the full schedule list.
 */
export const POST = async (req: NextRequest): Promise<NextResponse> => {
  const traceId = req.headers.get('x-trace-id') ?? newTraceId();
  try {
    const body = await req.text();
    const signature = req.headers.get('upstash-signature');
    const verified = await verifyQstashSignature(signature, body);
    if (!verified) throw Errors.unauthorized('Invalid QStash signature');

    const result = await purgeStaleTestOrganizations();
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof ApiError) return problemResponse(err, { traceId });
    logger(traceId).error('unhandled scheduled-job error', {
      message: err instanceof Error ? err.message : String(err),
    });
    return problemResponse(Errors.internal(), { traceId });
  }
};

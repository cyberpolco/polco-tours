import { NextResponse } from 'next/server';
import { withAuth } from '@lib/route-guard';
import { assignmentService } from '@modules/assignment';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Params {
  departureId: string;
}

// DR-029: a simple rules-based recommendation (capacity fit, maintenance
// recency, distance from pickup where data exists) -- NOT the "AI
// assignment engine" this project's roadmap lists as Phase 3. The
// Platform Admin still confirms or overrides via the normal
// POST /departures/{id}/assignments.
export const GET = withAuth<Params>('assignment.write', async (ctx, _req, { departureId }) => {
  const recommendation = await assignmentService.recommendAssignment(ctx, departureId);
  return NextResponse.json(recommendation);
});

import { NextResponse } from 'next/server';
import { withAuth } from '@lib/route-guard';
import { assignmentService } from '@modules/assignment';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Self-service schedule lookup for TOUR_GUIDE/DRIVER/VEHICLE_OWNER -- API
// only this increment, no staff-dashboard portal yet (DR-018).
export const GET = withAuth('assignment.read', async (ctx) => {
  const assignments = await assignmentService.listMyAssignments(ctx);
  return NextResponse.json({ assignments });
});

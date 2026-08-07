import { NextResponse } from 'next/server';
import { withAuth } from '@lib/route-guard';
import { fleetService } from '@modules/fleet';
import { assignmentService } from '@modules/assignment';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Params {
  assignmentId: string;
}

export const DELETE = withAuth<Params>('assignment.write', async (ctx, _req, { assignmentId }) => {
  const removed = await assignmentService.removeAssignment(ctx, assignmentId);
  // DR-082: the freed vehicle/driver/guide are no longer serving this
  // departure at all -- recompute them directly (not via the departure-
  // scoped sync helper, which can no longer find them once the assignment
  // row is gone).
  if (ctx.organizationId) {
    await fleetService.recomputeVehicleAvailability(ctx.organizationId, removed.vehicleId, false);
    await fleetService.recomputeDriverAvailability(ctx.organizationId, removed.driverProfileId, false);
    if (removed.guideUserId) await fleetService.recomputeGuideAvailability(ctx.organizationId, removed.guideUserId, false);
  }
  return new NextResponse(null, { status: 204 });
});

import { NextResponse } from 'next/server';
import { withAuth } from '@lib/route-guard';
import { assignmentService } from '@modules/assignment';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Params {
  assignmentId: string;
}

export const DELETE = withAuth<Params>('assignment.write', async (ctx, _req, { assignmentId }) => {
  await assignmentService.removeAssignment(ctx, assignmentId);
  return new NextResponse(null, { status: 204 });
});

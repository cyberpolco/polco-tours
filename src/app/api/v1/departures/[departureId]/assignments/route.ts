import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@lib/route-guard';
import { CreateAssignmentInput, assignmentService } from '@modules/assignment';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Params {
  departureId: string;
}

export const GET = withAuth<Params>('assignment.write', async (ctx, _req, { departureId }) => {
  const assignments = await assignmentService.listForDeparture(ctx, departureId);
  return NextResponse.json({ assignments });
});

export const POST = withAuth<Params>('assignment.write', async (ctx, req: NextRequest, { departureId }) => {
  const input = CreateAssignmentInput.parse(await req.json());
  const assignment = await assignmentService.createAssignment(ctx, departureId, input);
  return NextResponse.json({ assignment }, { status: 201 });
});

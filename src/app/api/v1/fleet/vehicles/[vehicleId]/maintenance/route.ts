import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@lib/route-guard';
import { CreateMaintenanceRecordInput, fleetService } from '@modules/fleet';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Params {
  vehicleId: string;
}

export const GET = withAuth<Params>('fleet.read', async (ctx, _req, { vehicleId }) => {
  const records = await fleetService.listMaintenanceRecords(ctx, vehicleId);
  return NextResponse.json({ records });
});

export const POST = withAuth<Params>('fleet.write', async (ctx, req: NextRequest, { vehicleId }) => {
  const input = CreateMaintenanceRecordInput.parse(await req.json());
  const record = await fleetService.addMaintenanceRecord(ctx, vehicleId, input);
  return NextResponse.json({ record }, { status: 201 });
});

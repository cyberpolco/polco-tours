import { NextResponse } from 'next/server';
import { withAuth } from '@lib/route-guard';
import { visaService } from '@modules/visa';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Params {
  applicationId: string;
}

// DR-151: genuine hard delete of an individual visa application -- route
// passes via the DB-editable permission matrix, visaService.deleteApplication's
// own isVisaDeleter check is the real SUPERADMIN-only gate.
export const DELETE = withAuth<Params>('visa.delete', async (ctx, _req, { applicationId }) => {
  await visaService.deleteApplication(ctx, applicationId);
  return new NextResponse(null, { status: 204 });
});

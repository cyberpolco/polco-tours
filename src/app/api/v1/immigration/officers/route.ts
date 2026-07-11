import { NextResponse } from 'next/server';
import { withAuth } from '@lib/route-guard';
import { authService } from '@modules/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Admin-only (SUPERADMIN/PLATFORM_ADMIN via '*') -- powers the officer-
// management page (list IMMIGRATION_OFFICER accounts + the org's own
// countries, for the assign/reassign form). Sibling to
// /immigration/visa-applications (also immigration-namespace, admin-facing)
// even though the underlying rows are User, not VisaApplication (DR-020).
export const GET = withAuth('admin.all', async (ctx) => {
  const { officers, availableCountries } = await authService.listOfficers(ctx);
  return NextResponse.json({ officers, availableCountries });
});

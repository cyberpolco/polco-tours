import { redirect } from 'next/navigation';
import { requireStaffContext, resolveStaffLandingPath } from '@lib/staff-guard';

// Outside the (dashboard) route group, same as login/forbidden/change-
// password -- see staff-guard.ts's redirect-loop warning. Thin dispatcher
// for the one caller that can't compute resolveStaffLandingPath itself:
// staff-login-form.tsx is a Client Component with no resolved AuthContext
// at the point it redirects, so it pushes here instead of a hardcoded page.
export default async function StaffIndexPage() {
  const ctx = await requireStaffContext();
  redirect(resolveStaffLandingPath(ctx));
}

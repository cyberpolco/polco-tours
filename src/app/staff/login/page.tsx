import { redirect } from 'next/navigation';
import { getOptionalStaffSession } from '@lib/staff-guard';
import { isStaffRole } from '@lib/rbac';
import { StaffLoginForm } from './staff-login-form';

// Outside the (dashboard) route group on purpose, same as /staff/change-
// password -- see staff-guard.ts's redirect-loop warning. Checks for an
// already-live staff session first: without this, leaving the dashboard
// (e.g. the "Polco Tours · Staff" brand link back to the homepage) and
// returning via "Admin Access" always re-showed the sign-in form, even
// though the session cookie was never touched -- indistinguishable from
// being signed out, from the visitor's side.
export default async function StaffLoginPage() {
  const ctx = await getOptionalStaffSession();
  if (ctx && isStaffRole(ctx.roles)) redirect('/staff/bookings');
  return <StaffLoginForm />;
}

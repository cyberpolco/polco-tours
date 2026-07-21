import { redirect } from 'next/navigation';
import { requireAnyStaffSession } from '@lib/staff-guard';
import { ChangePasswordForm } from './change-password-form';

// Outside the (dashboard) route group on purpose, same as /staff/login --
// requireStaffContext (staff-guard.ts) redirects here whenever
// ctx.mustChangePassword is true, and this page must never itself be
// gated by that same check or it'd redirect-loop (DR-026). Also reachable
// voluntarily now, as a "Change Password" entry in the Settings sidebar
// (settings-items.ts, DR-043) -- requireAnyStaffSession is the same
// no-mustChangePassword-gate escape hatch that makes the forced visit
// possible, so it works for both.
//
// Explicit user direction: a SUPERADMIN's voluntary (non-forced) visit here
// now redirects to /staff/profile instead, which has its own inline
// Password section (consolidated alongside name/phone editing) -- a forced
// visit (mustChangePassword true, an admin-created account's generated
// temp password) still lands here regardless of role, since /staff/profile
// itself would 403 a mustChangePassword session anyway.
export default async function ChangePasswordPage() {
  const ctx = await requireAnyStaffSession();
  if (!ctx.mustChangePassword && ctx.roles.includes('SUPERADMIN')) redirect('/staff/profile');
  return <ChangePasswordForm forced={ctx.mustChangePassword} />;
}

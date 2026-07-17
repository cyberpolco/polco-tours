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
export default async function ChangePasswordPage() {
  const ctx = await requireAnyStaffSession();
  return <ChangePasswordForm forced={ctx.mustChangePassword} />;
}

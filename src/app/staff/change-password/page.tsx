import { redirect } from 'next/navigation';
import { requireAnyStaffSession } from '@lib/staff-guard';
import { ChangePasswordForm } from './change-password-form';

// Outside the (dashboard) route group on purpose, same as /staff/login --
// requireStaffContext (staff-guard.ts) redirects here whenever
// ctx.mustChangePassword is true, and this page must never itself be
// gated by that same check or it'd redirect-loop (DR-026).
//
// No longer has its own Settings-sidebar entry (removed per explicit user
// direction: "merged with profile, we keep profile") -- a SUPERADMIN's
// voluntary password change now lives inline on /staff/profile
// (password-section.tsx) instead. This page still exists purely as the
// forced landing spot for ctx.mustChangePassword (an admin-created
// account's generated temp password) -- requireAnyStaffSession is the
// same no-mustChangePassword-gate escape hatch that makes that forced
// redirect possible without looping. A SUPERADMIN who somehow lands here
// with mustChangePassword already false (e.g. a stale bookmark) still
// redirects onward to /staff/profile below.
export default async function ChangePasswordPage() {
  const ctx = await requireAnyStaffSession();
  if (!ctx.mustChangePassword && ctx.roles.includes('SUPERADMIN')) redirect('/staff/profile');
  return <ChangePasswordForm forced={ctx.mustChangePassword} />;
}

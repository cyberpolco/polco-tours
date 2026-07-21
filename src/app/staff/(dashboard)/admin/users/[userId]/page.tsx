import { notFound, redirect } from 'next/navigation';
import { requireStaffContext } from '@lib/staff-guard';
import { ASSIGNABLE_ROLES, authService } from '@modules/auth';
import { PageHeader } from '@/components/ui/PageHeader';
import { EditUserForm } from './edit-user-form';
import { ResetPasswordPanel } from './reset-password-panel';

interface Props {
  params: Promise<{ userId: string }>;
}

// Admin-only (admin.all, DR-035) -- edit an existing user's profile/role
// set and reset their password. Distinct from /staff/admin/permissions
// (SUPERADMIN-only), which edits what a ROLE can do, not which roles a
// specific user holds.
export default async function EditUserPage({ params }: Props) {
  const { userId } = await params;
  const ctx = await requireStaffContext('admin.all');

  // updateUser/resetPassword both block self-edit here -- this used to be a
  // bare notFound(), a real dead end: an admin clicking their own row in the
  // Users list (the natural place to look for "edit my name") got a plain
  // 404 with no pointer to where self-editing actually lives. A SUPERADMIN
  // gets redirected to the real place (self-service /staff/profile,
  // SUPERADMIN-only); any other admin.all holder (e.g. PLATFORM_ADMIN)
  // viewing their own row still 404s rather than bouncing through a page
  // that would just redirect them again to /staff/forbidden.
  if (userId === ctx.userId) {
    if (ctx.roles.includes('SUPERADMIN')) redirect('/staff/profile');
    notFound();
  }

  const user = await authService.getUser(userId);
  if (!user) notFound();

  return (
    <div className="max-w-md space-y-10">
      <PageHeader eyebrow="Users" title={user.name ?? user.email} />
      <EditUserForm userId={user.id} user={user} assignableRoles={ASSIGNABLE_ROLES} />
      <ResetPasswordPanel userId={user.id} />
    </div>
  );
}

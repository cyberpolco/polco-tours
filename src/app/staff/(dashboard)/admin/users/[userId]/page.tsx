import { notFound } from 'next/navigation';
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

  if (userId === ctx.userId) notFound(); // updateUser/resetPassword both block self-edit

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

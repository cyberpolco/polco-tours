'use server';

import { redirect } from 'next/navigation';
import { requireStaffContext } from '@lib/staff-guard';
import { ApiError } from '@lib/errors';
import { provisionFleetProfilesForUser } from '@lib/provision-fleet-profiles-for-user';
import { ASSIGNABLE_ROLES, UpdateUserInput, authService } from '@modules/auth';
import { notificationsService } from '@modules/notifications';

export interface UpdateUserState {
  error?: string;
}

export async function updateUserAction(
  userId: string,
  _prevState: UpdateUserState,
  formData: FormData,
): Promise<UpdateUserState> {
  const ctx = await requireStaffContext('admin.all');

  const roles = ASSIGNABLE_ROLES.filter((r) => formData.get(`role_${r}`) === 'on');
  const phoneRaw = String(formData.get('phone') ?? '').trim();

  const parsed = UpdateUserInput.safeParse({
    name: String(formData.get('name') ?? '').trim(),
    email: String(formData.get('email') ?? '').trim(),
    phone: phoneRaw || null,
    roles: roles.length > 0 ? roles : undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }

  try {
    const user = await authService.updateUser(ctx, userId, parsed.data);
    // DR-138: only when this edit actually touched roles -- parsed.data.roles
    // is undefined for a profile-only edit (no role checkboxes changed),
    // same "undefined = leave as-is" semantics authService.updateUser itself
    // already follows.
    if (parsed.data.roles) await provisionFleetProfilesForUser(ctx, user.id, user.roles);
  } catch (err) {
    if (err instanceof ApiError) return { error: err.detail ?? err.title };
    throw err;
  }
  redirect('/staff/admin/users');
}

export interface ResetPasswordState {
  error?: string;
  success?: { temporaryPassword: string };
}

// Same reveal-once shape as createUserAction -- deliberately does not
// redirect on success, since the generated password must be shown exactly
// once and a redirect would lose it.
export async function resetPasswordAction(userId: string, _prevState: ResetPasswordState): Promise<ResetPasswordState> {
  const ctx = await requireStaffContext('admin.all');
  try {
    const { temporaryPassword } = await authService.resetPassword(ctx, userId);
    // DR-205 (explicit user request): also email the new temporary password
    // -- see createUserAction's own comment for why this must be called
    // from here rather than from inside authService.resetPassword itself
    // (auth -> notifications would be a real import cycle). resetPassword
    // doesn't touch deletedAt, so the recipient lookup below still resolves
    // fine regardless of call order.
    const target = await authService.getUser(userId);
    if (target) {
      await notificationsService.notifyEmail('STAFF_PASSWORD_RESET', target.email, target.preferredLocale, target.organizationId ?? '', {
        temporaryPassword,
      });
    }
    return { success: { temporaryPassword } };
  } catch (err) {
    if (err instanceof ApiError) return { error: err.detail ?? err.title };
    throw err;
  }
}

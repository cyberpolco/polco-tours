'use server';

import { redirect } from 'next/navigation';
import { requireStaffContext } from '@lib/staff-guard';
import { ApiError } from '@lib/errors';
import { ASSIGNABLE_ROLES, UpdateUserInput, authService } from '@modules/auth';

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
    await authService.updateUser(ctx, userId, parsed.data);
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
    return { success: { temporaryPassword } };
  } catch (err) {
    if (err instanceof ApiError) return { error: err.detail ?? err.title };
    throw err;
  }
}

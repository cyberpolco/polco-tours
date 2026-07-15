'use server';

import { redirect } from 'next/navigation';
import { requireStaffContext } from '@lib/staff-guard';
import { ApiError } from '@lib/errors';
import { ASSIGNABLE_ROLES, CreateUserInput, authService } from '@modules/auth';

export interface CreateUserState {
  error?: string;
  success?: { email: string; temporaryPassword: string };
}

// Deliberately does NOT redirect on success -- the generated password must
// be shown exactly once, and a redirect (or a query-string round trip) would
// either lose it or leak it into browser history/Referer headers (the same
// class of leak DR-016 flagged for a bare bookingId in a URL). Returning
// state to a useActionState-driven client form keeps it purely in memory.
export async function createUserAction(_prevState: CreateUserState, formData: FormData): Promise<CreateUserState> {
  const ctx = await requireStaffContext('admin.all');

  const roles = ASSIGNABLE_ROLES.filter((r) => formData.get(`role_${r}`) === 'on');
  const phoneRaw = String(formData.get('phone') ?? '').trim();

  const parsed = CreateUserInput.safeParse({
    name: String(formData.get('name') ?? '').trim(),
    email: String(formData.get('email') ?? '').trim(),
    phone: phoneRaw || null,
    roles,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }

  try {
    const { user, temporaryPassword } = await authService.createUser(ctx, parsed.data);
    return { success: { email: user.email, temporaryPassword } };
  } catch (err) {
    if (err instanceof ApiError) return { error: err.detail ?? err.title };
    throw err;
  }
}

export async function deactivateUserAction(userId: string): Promise<void> {
  const ctx = await requireStaffContext('admin.all');
  await authService.deactivateUser(ctx, userId);
  redirect('/staff/admin/users');
}

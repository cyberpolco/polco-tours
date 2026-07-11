'use server';

import { redirect } from 'next/navigation';
import { requireStaffContext } from '@lib/staff-guard';
import { ApiError } from '@lib/errors';
import { authService } from '@modules/auth';

export async function assignOfficerCountryAction(userId: string, formData: FormData): Promise<void> {
  const ctx = await requireStaffContext('admin.all');
  const country = String(formData.get('country') ?? '').trim();

  try {
    await authService.assignOfficerCountry(ctx, userId, country);
  } catch (err) {
    if (err instanceof ApiError && err.status === 422) {
      redirect('/staff/admin/officers?error=invalid_country');
    }
    throw err;
  }
  redirect('/staff/admin/officers');
}

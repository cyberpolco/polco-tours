'use server';

import { redirect } from 'next/navigation';
import { requireStaffContext } from '@lib/staff-guard';
import { ApiError } from '@lib/errors';
import { assertClientDeletable } from '@lib/client-deletion';
import { authService } from '@modules/auth';

export async function deleteClientAction(clientUserId: string): Promise<void> {
  const ctx = await requireStaffContext('booking.create');
  if (!ctx.organizationId) redirect('/staff/forbidden');

  try {
    await assertClientDeletable(ctx, ctx.organizationId, clientUserId);
    await authService.deleteClient(ctx, clientUserId);
  } catch (err) {
    if (err instanceof ApiError) {
      redirect(`/staff/admin/clients?error=${err.slug}&detail=${encodeURIComponent(err.detail ?? '')}`);
    }
    throw err;
  }
  redirect('/staff/admin/clients');
}

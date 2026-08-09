'use server';

import { redirect } from 'next/navigation';
import { requireStaffContext } from '@lib/staff-guard';
import { ApiError } from '@lib/errors';
import { assertClientDeletable } from '@lib/client-deletion';
import { authService } from '@modules/auth';

// DR-091: redirectQuery carries the caller's current search/filter/page
// state back through on success -- without it, deleting a client from a
// filtered or paginated view would silently drop back to page 1, unfiltered.
export async function deleteClientAction(clientUserId: string, redirectQuery: string): Promise<void> {
  const ctx = await requireStaffContext('booking.create');
  if (!ctx.organizationId) redirect('/staff/forbidden');

  try {
    await assertClientDeletable(ctx, ctx.organizationId, clientUserId);
    await authService.deleteClient(ctx, clientUserId);
  } catch (err) {
    if (err instanceof ApiError) {
      const errorParams = `error=${err.slug}&detail=${encodeURIComponent(err.detail ?? '')}`;
      redirect(`/staff/admin/clients?${redirectQuery ? `${redirectQuery}&${errorParams}` : errorParams}`);
    }
    throw err;
  }
  redirect(`/staff/admin/clients${redirectQuery ? `?${redirectQuery}` : ''}`);
}

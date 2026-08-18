'use server';

import { revalidatePath } from 'next/cache';
import { requireStaffContext } from '@lib/staff-guard';
import { ratingsService } from '@modules/ratings';

// DR-148 (explicit user request): SUPERADMIN-only genuine delete of an
// individual review. requireStaffContext('rating.delete') redirects to
// /staff/forbidden for anyone else -- rating.delete is never seeded to any
// role, so only SUPERADMIN's hardcoded wildcard ever passes this gate.
export async function deleteReviewAction(reviewId: string): Promise<void> {
  const ctx = await requireStaffContext('rating.delete');
  await ratingsService.deleteReview(ctx, reviewId);
  revalidatePath('/staff/ratings');
}

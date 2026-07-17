'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { ratingsService } from '@modules/ratings';

function optionalString(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

// Per-subject ratings are optional (a client may skip rating a driver/guide
// they don't remember) -- only rows where the star select wasn't left on
// "Skip" (empty value) are included; ratingsService re-validates every id
// against the departure's real Assignment rows regardless.
export async function submitRatingAction(formData: FormData): Promise<void> {
  const bookingReference = String(formData.get('bookingReference'));
  const ratingCode = String(formData.get('ratingCode'));
  const overallRating = Number(formData.get('overallRating'));
  const overallComment = optionalString(formData, 'overallComment');

  const driverRatings = formData
    .getAll('driverIds')
    .map(String)
    .map((driverProfileId) => ({
      driverProfileId,
      rating: Number(formData.get(`rating_driver_${driverProfileId}`)),
      comment: optionalString(formData, `comment_driver_${driverProfileId}`),
    }))
    .filter((r) => r.rating >= 1 && r.rating <= 5);

  const guideRatings = formData
    .getAll('guideIds')
    .map(String)
    .map((guideUserId) => ({
      guideUserId,
      rating: Number(formData.get(`rating_guide_${guideUserId}`)),
      comment: optionalString(formData, `comment_guide_${guideUserId}`),
    }))
    .filter((r) => r.rating >= 1 && r.rating <= 5);

  const ip = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim();

  await ratingsService.submitRating(
    { bookingReference, ratingCode, overallRating, overallComment, driverRatings, guideRatings },
    ip,
  );

  redirect('/rate?submitted=1');
}

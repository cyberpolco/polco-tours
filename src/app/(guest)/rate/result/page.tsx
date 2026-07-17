import Link from 'next/link';
import { headers } from 'next/headers';
import { ratingsService } from '@modules/ratings';
import { ApiError } from '@lib/errors';
import { Alert } from '@/components/ui/Alert';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { FormField } from '@/components/ui/FormField';
import { submitRatingAction } from './actions';

interface Props {
  searchParams: Promise<{ bookingReference?: string; ratingCode?: string }>;
}

function StarSelect({ name }: { name: string }) {
  return (
    <select name={name} defaultValue="" className="rounded-survey border border-rule px-3 py-2">
      <option value="">Skip</option>
      <option value="1">1 star</option>
      <option value="2">2 stars</option>
      <option value="3">3 stars</option>
      <option value="4">4 stars</option>
      <option value="5">5 stars</option>
    </select>
  );
}

export default async function RateResultPage({ searchParams }: Props) {
  const { bookingReference, ratingCode } = await searchParams;

  if (!bookingReference || !ratingCode) {
    return (
      <div className="max-w-sm">
        <Alert tone="info">Enter your booking reference and Rating Code.</Alert>
        <Link href="/rate" className="mt-4 inline-block text-sm text-forest hover:underline">
          ← try again
        </Link>
      </div>
    );
  }

  const ip = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim();
  const input = { bookingReference: bookingReference.trim().toUpperCase(), ratingCode: ratingCode.trim().toUpperCase() };

  let result;
  try {
    result = await ratingsService.lookupForRating(input, ip);
  } catch (err) {
    const message =
      err instanceof ApiError && err.status === 429
        ? 'Too many attempts -- please try again later.'
        : err instanceof ApiError && err.status === 409
          ? "This booking isn't eligible to be rated yet -- ratings open once your tour is complete and fully paid, from 48 hours after your trip ends."
          : "We couldn't find a booking matching that reference and Rating Code.";
    return (
      <div className="max-w-sm">
        <Alert tone="error">{message}</Alert>
        <Link href="/rate" className="mt-4 inline-block text-sm text-forest hover:underline">
          ← try again
        </Link>
      </div>
    );
  }

  const { drivers, guides } = result;

  return (
    <div className="max-w-md">
      <p className="eyebrow text-mist">Rate your trip</p>
      <h1 className="mt-1 text-2xl font-bold text-navy">{result.bookingReference}</h1>

      <form action={submitRatingAction} className="mt-6 space-y-6">
        <input type="hidden" name="bookingReference" value={input.bookingReference} />
        <input type="hidden" name="ratingCode" value={input.ratingCode} />

        <div>
          <p className="eyebrow text-mist">Overall experience</p>
          <div className="mt-2 flex items-end gap-3">
            <FormField label="Rating" htmlFor="overallRating">
              <select name="overallRating" required defaultValue="" className="rounded-survey border border-rule px-3 py-2">
                <option value="" disabled>
                  Select
                </option>
                <option value="1">1 star</option>
                <option value="2">2 stars</option>
                <option value="3">3 stars</option>
                <option value="4">4 stars</option>
                <option value="5">5 stars</option>
              </select>
            </FormField>
          </div>
          <FormField label="Comments" htmlFor="overallComment" optional>
            <textarea name="overallComment" rows={3} maxLength={1000} className="w-full rounded-survey border border-rule px-3 py-2" />
          </FormField>
        </div>

        {drivers.length > 0 && (
          <div>
            <div className="survey-rule mb-4" />
            <p className="eyebrow text-mist">Driver(s)</p>
            {drivers.map((d) => (
              <div key={d.driverProfileId} className="mt-3 space-y-2">
                <input type="hidden" name="driverIds" value={d.driverProfileId} />
                <p className="text-sm text-ink">{d.name}</p>
                <div className="flex items-center gap-3">
                  <StarSelect name={`rating_driver_${d.driverProfileId}`} />
                </div>
                <textarea
                  name={`comment_driver_${d.driverProfileId}`}
                  rows={2}
                  maxLength={1000}
                  placeholder="Optional comment"
                  className="w-full rounded-survey border border-rule px-3 py-2"
                />
              </div>
            ))}
          </div>
        )}

        {guides.length > 0 && (
          <div>
            <div className="survey-rule mb-4" />
            <p className="eyebrow text-mist">Tour guide(s)</p>
            {guides.map((g) => (
              <div key={g.guideUserId} className="mt-3 space-y-2">
                <input type="hidden" name="guideIds" value={g.guideUserId} />
                <p className="text-sm text-ink">{g.name}</p>
                <div className="flex items-center gap-3">
                  <StarSelect name={`rating_guide_${g.guideUserId}`} />
                </div>
                <textarea
                  name={`comment_guide_${g.guideUserId}`}
                  rows={2}
                  maxLength={1000}
                  placeholder="Optional comment"
                  className="w-full rounded-survey border border-rule px-3 py-2"
                />
              </div>
            ))}
          </div>
        )}

        <SubmitButton pendingLabel="Submitting…">Submit feedback</SubmitButton>
      </form>
    </div>
  );
}

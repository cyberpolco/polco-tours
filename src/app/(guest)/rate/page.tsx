import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Alert } from '@/components/ui/Alert';
import { Reveal } from '@/components/ui/Reveal';

interface Props {
  searchParams: Promise<{ submitted?: string }>;
}

// Customer Ratings & Feedback (DR-037) -- same plain-GET-form, no-session
// convention as /find-booking. A client rates using their Booking
// Reference + the single-use Rating Code staff issued once their booking
// was fully paid.
export default async function RatePage({ searchParams }: Props) {
  const { submitted } = await searchParams;

  return (
    <Reveal>
      <div className="max-w-sm">
        <p className="eyebrow text-mist">Rate your trip</p>
        <h1 className="mt-1 text-2xl font-bold text-navy">Share your feedback</h1>

        {submitted && (
          <div className="mt-4">
            <Alert tone="success">Thank you! Your feedback has been recorded.</Alert>
          </div>
        )}

        <p className="mt-2 text-sm text-mist">
          Enter your booking reference and the Rating Code you were sent -- available once your tour is complete.
        </p>

        <form method="get" action="/rate/result" className="mt-6 space-y-4">
          <FormField label="Booking reference" htmlFor="bookingReference">
            <input
              name="bookingReference"
              required
              placeholder="POL-2026-000154"
              className="w-full rounded-survey border border-rule px-3 py-2 uppercase"
            />
          </FormField>
          <FormField label="Rating Code" htmlFor="ratingCode">
            <input name="ratingCode" required className="w-full rounded-survey border border-rule px-3 py-2 uppercase" />
          </FormField>
          <Button type="submit">Continue</Button>
        </form>
      </div>
    </Reveal>
  );
}

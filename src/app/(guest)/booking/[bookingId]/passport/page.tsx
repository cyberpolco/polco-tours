import { redirect } from 'next/navigation';
import { requireGuestContext } from '@lib/guest-guard';
import { bookingService } from '@modules/booking';
import { uploadPassportAction } from './actions';

interface Props {
  params: Promise<{ bookingId: string }>;
  searchParams: Promise<{ error?: string }>;
}

export default async function PassportPage({ params, searchParams }: Props) {
  const { bookingId } = await params;
  const { error } = await searchParams;
  const ctx = await requireGuestContext();
  const [booking, travelers] = await Promise.all([
    bookingService.getById(ctx, bookingId),
    bookingService.listTravelers(ctx, bookingId),
  ]);

  if (travelers.length < booking.seats) {
    redirect(`/booking/${bookingId}/travelers/new`);
  }
  const lead = travelers.find((t) => t.isTourLead);
  if (!lead) {
    redirect(`/booking/${bookingId}/travelers/new`);
  }
  if (lead.passportDocumentId) {
    redirect(`/booking/${bookingId}/addons`);
  }

  return (
    <div className="max-w-md">
      <p className="text-xs tracking-survey text-mist">BOOKING SETUP · PASSPORT</p>
      <h1 className="mt-1 text-2xl font-bold text-navy">
        {lead.firstName} {lead.lastName}&apos;s passport
      </h1>
      <p className="mt-1 text-sm text-mist">Upload a PDF of the tour lead&apos;s passport (required for immigration).</p>
      {error === 'missing_file' && <p className="mt-3 text-sm text-amber">Choose a PDF file to upload.</p>}
      <form action={uploadPassportAction.bind(null, bookingId, lead.id)} className="mt-6 space-y-4">
        <input
          type="file"
          name="passport"
          accept="application/pdf"
          required
          className="w-full rounded-survey border border-rule px-3 py-2"
        />
        <button type="submit" className="rounded-survey bg-amber px-4 py-2 text-sm font-semibold text-navy">
          Upload & continue
        </button>
      </form>
    </div>
  );
}

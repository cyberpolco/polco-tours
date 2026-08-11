import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { requireStaffContext } from '@lib/staff-guard';
import { bookingService } from '@modules/booking';
import { Alert } from '@/components/ui/Alert';
import { BackLink } from '@/components/ui/BackLink';
import { PageHeader } from '@/components/ui/PageHeader';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { uploadPassportAction } from './actions';

interface Props {
  params: Promise<{ bookingId: string }>;
  searchParams: Promise<{ error?: string }>;
}

// Only reachable at all once Visa Assistance was picked at the Add-ons step
// (Booking.requiresPassportUpload) -- and when it is, EVERY traveler needs a
// passport uploaded, not just the tour lead.
export default async function PassportPage({ params, searchParams }: Props) {
  const { bookingId } = await params;
  const { error } = await searchParams;
  const ctx = await requireStaffContext('booking.create');
  const [booking, travelers] = await Promise.all([
    bookingService.getById(ctx, bookingId),
    bookingService.listTravelers(ctx, bookingId),
  ]);

  if (travelers.length < booking.seats) {
    redirect(`/staff/bookings/${bookingId}/travelers/new`);
  }
  if (!booking.requiresPassportUpload) {
    redirect(`/staff/bookings/${bookingId}`);
  }
  const nextTraveler = travelers.find((t) => !t.passportDocumentId);
  if (!nextTraveler) {
    redirect(`/staff/bookings/${bookingId}`);
  }

  const remaining = travelers.filter((t) => !t.passportDocumentId).length;
  const t = await getTranslations('StaffPassportPage');

  return (
    <div className="max-w-md">
      <BackLink href={`/staff/bookings/${bookingId}/travelers/new`}>{t('backToTravelers')}</BackLink>
      <PageHeader
        eyebrow={t('setupPassport')}
        title={t('passportTitle', { firstName: nextTraveler.firstName, lastName: nextTraveler.lastName })}
      />
      <p className="mt-1 text-sm text-mist">{t('uploadNotice', { remaining, total: travelers.length })}</p>
      {error === 'missing_file' && (
        <div className="mt-3">
          <Alert tone="error">{t('choosePdfFile')}</Alert>
        </div>
      )}
      <form action={uploadPassportAction.bind(null, bookingId, nextTraveler.id)} className="mt-6 space-y-4">
        <input
          type="file"
          name="passport"
          accept="application/pdf"
          required
          className="w-full rounded-survey border border-rule px-3 py-2"
        />
        <SubmitButton pendingLabel={t('uploading')}>{t('uploadAndContinue')}</SubmitButton>
      </form>
    </div>
  );
}

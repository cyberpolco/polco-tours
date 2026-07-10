import { redirect } from 'next/navigation';
import { requireStaffContext } from '@lib/staff-guard';
import { COUNTRY_CODES, flagEmoji } from '@lib/country-codes';
import { bookingService } from '@modules/booking';
import { FormField } from '@/components/ui/FormField';
import { PageHeader } from '@/components/ui/PageHeader';
import { SelectableCard } from '@/components/ui/SelectableCard';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { addTravelerAction } from './actions';

interface Props {
  params: Promise<{ bookingId: string }>;
}

export default async function NewTravelerPage({ params }: Props) {
  const { bookingId } = await params;
  const ctx = await requireStaffContext('booking.create');
  const [booking, travelers] = await Promise.all([
    bookingService.getById(ctx, bookingId),
    bookingService.listTravelers(ctx, bookingId),
  ]);

  if (travelers.length >= booking.seats) {
    redirect(`/staff/bookings/${bookingId}/passport`);
  }

  const hasTourLead = travelers.some((t) => t.isTourLead);
  const travelerNumber = travelers.length + 1;

  return (
    <div className="max-w-lg">
      <PageHeader eyebrow="Booking setup · Travelers" title={`Traveler ${travelerNumber} of ${booking.seats}`} />
      <p className="mt-1 text-sm text-mist">
        {travelers.length} of {booking.seats} entered
      </p>

      <form action={addTravelerAction.bind(null, bookingId)} className="mt-6 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <FormField label="First name" htmlFor="firstName">
            <input name="firstName" required className="w-full rounded-survey border border-rule px-3 py-2" />
          </FormField>
          <FormField label="Last name" htmlFor="lastName">
            <input name="lastName" required className="w-full rounded-survey border border-rule px-3 py-2" />
          </FormField>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormField label="Age" htmlFor="age">
            <input name="age" type="number" min={0} max={120} required className="w-full rounded-survey border border-rule px-3 py-2" />
          </FormField>
          <FormField label="Sex" htmlFor="sex">
            <select name="sex" required className="w-full rounded-survey border border-rule px-3 py-2">
              <option value="M">M</option>
              <option value="F">F</option>
              <option value="X">X</option>
            </select>
          </FormField>
        </div>

        <FormField label="Nationality" htmlFor="nationality">
          <select name="nationality" required className="w-full rounded-survey border border-rule px-3 py-2">
            {COUNTRY_CODES.map((c) => (
              <option key={c.alpha2} value={c.alpha2}>
                {flagEmoji(c.alpha2)} {c.name}
              </option>
            ))}
          </select>
        </FormField>

        <FormField label="ID / passport number" htmlFor="idOrPassportNumber">
          <input name="idOrPassportNumber" required className="w-full rounded-survey border border-rule px-3 py-2" />
        </FormField>

        <div>
          <p className="mb-1 block text-sm text-mist">Phone (optional)</p>
          <div className="flex gap-2">
            <select name="dialCode" defaultValue="264" className="rounded-survey border border-rule px-2 py-2">
              {COUNTRY_CODES.map((c) => (
                <option key={c.alpha2} value={c.dialCode}>
                  {flagEmoji(c.alpha2)} +{c.dialCode}
                </option>
              ))}
            </select>
            <input
              name="localNumber"
              type="tel"
              placeholder="81 234 5678"
              className="flex-1 rounded-survey border border-rule px-3 py-2"
            />
          </div>
        </div>

        <FormField label="Disabilities" htmlFor="disabilities" optional>
          <input name="disabilities" className="w-full rounded-survey border border-rule px-3 py-2" />
        </FormField>

        <FormField label="Allergies" htmlFor="allergies" optional>
          <input name="allergies" className="w-full rounded-survey border border-rule px-3 py-2" />
        </FormField>

        <FormField label="Drink preference" htmlFor="drinkPreference" optional>
          <input name="drinkPreference" className="w-full rounded-survey border border-rule px-3 py-2" />
        </FormField>

        <SelectableCard type="checkbox" name="isTourLead" defaultChecked={!hasTourLead} disabled={hasTourLead}>
          Tour lead (uploads the group&apos;s passport)
        </SelectableCard>

        <SubmitButton>{travelerNumber === booking.seats ? 'Finish travelers' : 'Add traveler & continue'}</SubmitButton>
      </form>
    </div>
  );
}

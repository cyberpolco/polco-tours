import { redirect } from 'next/navigation';
import { requireStaffContext } from '@lib/staff-guard';
import { COUNTRY_CODES, flagEmoji } from '@lib/country-codes';
import { bookingService } from '@modules/booking';
import { BackLink } from '@/components/ui/BackLink';
import { LinkButton } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/Select';
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

  // Add-ons now comes first -- bounce back to it if not finished yet.
  if (!booking.addonsFinalizedAt) {
    redirect(`/staff/bookings/${bookingId}/addons`);
  }

  // Same review-instead-of-bounce fix as the guest wizard: this branch only
  // fires on a revisit after the forward flow (addTravelerAction) already
  // redirected away once the last traveler was added -- show what's on file
  // instead of silently redirecting forward again, so the Passport step's
  // back link actually goes somewhere useful.
  if (travelers.length >= booking.seats) {
    return (
      <div className="max-w-lg">
        <BackLink href={`/staff/bookings/${bookingId}/addons`}>back to add-ons</BackLink>
        <PageHeader eyebrow="Booking setup · Travelers" title={`Travelers (${travelers.length} of ${booking.seats})`} />
        <p className="mt-1 text-sm text-mist">All travelers are already entered.</p>
        <ul className="mt-4 space-y-2">
          {travelers.map((t) => (
            <li key={t.id} className="rounded-survey border border-rule p-3 text-sm">
              <span className="font-medium text-navy">
                {t.firstName} {t.lastName}
              </span>
              {t.isTourLead && <span className="ml-2 text-xs uppercase tracking-wide text-forest">Tour lead</span>}
            </li>
          ))}
        </ul>
        <div className="mt-6">
          <LinkButton
            href={booking.requiresPassportUpload ? `/staff/bookings/${bookingId}/passport` : `/staff/bookings/${bookingId}`}
          >
            Continue
          </LinkButton>
        </div>
      </div>
    );
  }

  // The very first traveler added is always the tour lead (defaultChecked
  // below, and the checkbox is disabled once one exists) -- so which
  // traveler this form is currently adding is already known server-side.
  const hasTourLead = travelers.some((t) => t.isTourLead);
  const isAddingTourLead = !hasTourLead;
  const travelerNumber = travelers.length + 1;

  return (
    <div className="max-w-lg">
      <BackLink href={`/staff/bookings/${bookingId}/addons`}>back to add-ons</BackLink>
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
            <Select name="sex" required>
              <option value="M">M</option>
              <option value="F">F</option>
              <option value="X">X</option>
            </Select>
          </FormField>
        </div>

        <FormField label="Nationality" htmlFor="nationality">
          <Select name="nationality" required>
            {COUNTRY_CODES.map((c) => (
              <option key={c.alpha2} value={c.alpha2}>
                {flagEmoji(c.alpha2)} {c.name}
              </option>
            ))}
          </Select>
        </FormField>

        <FormField label="ID / passport number" htmlFor="idOrPassportNumber">
          <input name="idOrPassportNumber" required className="w-full rounded-survey border border-rule px-3 py-2" />
        </FormField>

        {isAddingTourLead && (
          <div className="space-y-4 rounded-survey border border-rule p-4">
            <p className="text-xs uppercase tracking-wide text-mist">Tour lead contact details</p>
            <div>
              <p className="mb-1 block text-sm text-mist">Phone</p>
              <div className="flex gap-2">
                <Select name="dialCode" defaultValue="264">
                  {COUNTRY_CODES.map((c) => (
                    <option key={c.alpha2} value={c.dialCode}>
                      {flagEmoji(c.alpha2)} +{c.dialCode}
                    </option>
                  ))}
                </Select>
                <input
                  name="localNumber"
                  type="tel"
                  required
                  placeholder="81 234 5678"
                  className="flex-1 rounded-survey border border-rule px-3 py-2"
                />
              </div>
            </div>
            <FormField label="Email" htmlFor="email">
              <input type="email" name="email" required className="w-full rounded-survey border border-rule px-3 py-2" />
            </FormField>
            <FormField label="Country of residence" htmlFor="countryOfResidence">
              <Select name="countryOfResidence" required>
                {COUNTRY_CODES.map((c) => (
                  <option key={c.alpha2} value={c.alpha2}>
                    {flagEmoji(c.alpha2)} {c.name}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>
        )}

        <FormField label="Allergies" htmlFor="allergies" optional>
          <input name="allergies" className="w-full rounded-survey border border-rule px-3 py-2" />
        </FormField>

        <div className="grid grid-cols-3 gap-4">
          <FormField label="Emergency contact name" htmlFor="emergencyContactName" optional>
            <input name="emergencyContactName" className="w-full rounded-survey border border-rule px-3 py-2" />
          </FormField>
          <FormField label="Emergency contact phone" htmlFor="emergencyContactPhone" optional>
            <input name="emergencyContactPhone" className="w-full rounded-survey border border-rule px-3 py-2" />
          </FormField>
          <FormField label="Relation" htmlFor="emergencyContactRelation" optional>
            <input name="emergencyContactRelation" placeholder="Spouse, parent…" className="w-full rounded-survey border border-rule px-3 py-2" />
          </FormField>
        </div>

        <SelectableCard type="checkbox" name="isTourLead" defaultChecked={!hasTourLead} disabled={hasTourLead}>
          Tour lead (main point of contact for the group)
        </SelectableCard>

        <SubmitButton>{travelerNumber === booking.seats ? 'Finish travelers' : 'Add traveler & continue'}</SubmitButton>
      </form>
    </div>
  );
}

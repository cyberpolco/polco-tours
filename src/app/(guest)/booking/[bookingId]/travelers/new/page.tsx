import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireGuestContext } from '@lib/guest-guard';
import { COUNTRY_CODES, flagEmoji, parseE164 } from '@lib/country-codes';
import { authService } from '@modules/auth';
import { bookingService } from '@modules/booking';
import { LinkButton } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { SelectableCard } from '@/components/ui/SelectableCard';
import { StepIndicator } from '@/components/ui/StepIndicator';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { getBookingWizardSteps } from '../../../../booking-wizard-steps';
import { addTravelerAction } from './actions';

interface Props {
  params: Promise<{ bookingId: string }>;
}

export default async function NewTravelerPage({ params }: Props) {
  const { bookingId } = await params;
  const ctx = await requireGuestContext();
  const [booking, travelers] = await Promise.all([
    bookingService.getById(ctx, bookingId),
    bookingService.listTravelers(ctx, bookingId),
  ]);

  // Add-ons now comes first -- a guest landing here directly (stale link,
  // back button) before finishing that step gets bounced back to it.
  if (!booking.addonsFinalizedAt) {
    redirect(`/booking/${bookingId}/addons`);
  }

  // The wizard's own forward flow (addTravelerAction) always redirects away
  // the moment the last traveler is added -- this branch only fires on a
  // later revisit (e.g. the Passport step's back link). Rather than
  // silently bouncing forward again (which would make "back" from Passport
  // a no-op with no way to see what was already entered), show a read-only
  // review of every traveler already on file -- nothing is re-entered,
  // edited, or lost by landing here.
  if (travelers.length >= booking.seats) {
    return (
      <div className="max-w-lg">
        <Link href={`/booking/${bookingId}/addons`} className="text-sm text-forest hover:underline">
          ← back to add-ons
        </Link>
        <StepIndicator steps={getBookingWizardSteps(booking.requiresPassportUpload)} currentIndex={2} />
        <p className="eyebrow mt-4 text-mist">Booking setup · Travelers</p>
        <h1 className="mt-1 text-2xl font-bold text-navy">
          Travelers ({travelers.length} of {booking.seats})
        </h1>
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
          <LinkButton href={booking.requiresPassportUpload ? `/booking/${bookingId}/passport` : `/booking/${bookingId}`}>
            Continue
          </LinkButton>
        </div>
      </div>
    );
  }

  // The very first traveler added is always the tour lead (defaultChecked
  // below, and the checkbox is disabled once one exists) -- so which
  // traveler this form is currently adding is already known server-side,
  // no client-side interactivity needed to conditionally show the
  // tour-lead-only fields (phone/email/country of residence).
  const hasTourLead = travelers.some((t) => t.isTourLead);
  const isAddingTourLead = !hasTourLead;
  const travelerNumber = travelers.length + 1;

  // Prefill the tour lead's name/phone from what they already typed on
  // "Your details" (book/[departureId]) -- User.name/phone, set there via
  // authService.updateProfile -- so they don't retype it. User.name is one
  // combined string (no firstName/lastName columns), split heuristically:
  // first word is the first name, everything else is the last name.
  let prefillFirstName = '';
  let prefillLastName = '';
  let prefillDialCode = '264';
  let prefillLocalNumber = '';
  if (isAddingTourLead) {
    const me = await authService.getUser(ctx.userId);
    if (me?.name) {
      const [first, ...rest] = me.name.trim().split(/\s+/);
      prefillFirstName = first ?? '';
      prefillLastName = rest.join(' ');
    }
    if (me?.phone) {
      const parsed = parseE164(me.phone);
      if (parsed) {
        prefillDialCode = parsed.dialCode;
        prefillLocalNumber = parsed.localNumber;
      }
    }
  }

  return (
    <div className="max-w-lg">
      <Link href={`/booking/${bookingId}/addons`} className="text-sm text-forest hover:underline">
        ← back to add-ons
      </Link>
      <StepIndicator steps={getBookingWizardSteps(booking.requiresPassportUpload)} currentIndex={2} />
      <p className="eyebrow mt-4 text-mist">Booking setup · Travelers</p>
      <h1 className="mt-1 text-2xl font-bold text-navy">
        Traveler {travelerNumber} of {booking.seats}
      </h1>
      <p className="mt-1 text-sm text-mist">
        {travelers.length} of {booking.seats} entered
      </p>

      <form action={addTravelerAction.bind(null, bookingId)} className="mt-6 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <FormField label="First name" htmlFor="firstName">
            <input
              name="firstName"
              required
              defaultValue={prefillFirstName}
              className="w-full rounded-survey border border-rule px-3 py-2"
            />
          </FormField>
          <FormField label="Last name" htmlFor="lastName">
            <input
              name="lastName"
              required
              defaultValue={prefillLastName}
              className="w-full rounded-survey border border-rule px-3 py-2"
            />
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

        {isAddingTourLead && (
          <div className="space-y-4 rounded-survey border border-rule p-4">
            <p className="text-xs uppercase tracking-wide text-mist">Tour lead contact details</p>
            <div>
              <p className="mb-1 block text-sm text-mist">Phone</p>
              <div className="flex gap-2">
                <select name="dialCode" defaultValue={prefillDialCode} className="rounded-survey border border-rule px-2 py-2">
                  {COUNTRY_CODES.map((c) => (
                    <option key={c.alpha2} value={c.dialCode}>
                      {flagEmoji(c.alpha2)} +{c.dialCode}
                    </option>
                  ))}
                </select>
                <input
                  name="localNumber"
                  type="tel"
                  required
                  defaultValue={prefillLocalNumber}
                  placeholder="81 234 5678"
                  className="flex-1 rounded-survey border border-rule px-3 py-2"
                />
              </div>
            </div>
            <FormField label="Email" htmlFor="email">
              <input type="email" name="email" required className="w-full rounded-survey border border-rule px-3 py-2" />
            </FormField>
            <FormField label="Country of residence" htmlFor="countryOfResidence">
              <select name="countryOfResidence" required className="w-full rounded-survey border border-rule px-3 py-2">
                {COUNTRY_CODES.map((c) => (
                  <option key={c.alpha2} value={c.alpha2}>
                    {flagEmoji(c.alpha2)} {c.name}
                  </option>
                ))}
              </select>
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
          Tour lead (our main point of contact for the group)
        </SelectableCard>

        <SubmitButton>{travelerNumber === booking.seats ? 'Finish travelers' : 'Add traveler & continue'}</SubmitButton>
      </form>
    </div>
  );
}

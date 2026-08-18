import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { requireStaffContext } from '@lib/staff-guard';
import { COUNTRY_CODES, COUNTRY_CODES_BY_ALPHA2, flagEmoji, parseE164 } from '@lib/country-codes';
import { authService } from '@modules/auth';
import { bookingService, isBookingLocked } from '@modules/booking';
import { Alert } from '@/components/ui/Alert';
import { BackLink } from '@/components/ui/BackLink';
import { LinkButton } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { FormField } from '@/components/ui/FormField';
import { PageHeader } from '@/components/ui/PageHeader';
import { Reveal, RevealGroup } from '@/components/ui/Reveal';
import { Select } from '@/components/ui/Select';
import { SelectableCard } from '@/components/ui/SelectableCard';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { addTravelerAction } from './actions';

interface Props {
  params: Promise<{ bookingId: string }>;
}

const OPERATING_COUNTRY_CODES = new Set(['NA', 'CD', 'ZM', 'ZW']);

function countryName(alpha2: string, tCountries: (code: string) => string): string {
  return OPERATING_COUNTRY_CODES.has(alpha2) ? tCountries(alpha2) : COUNTRY_CODES_BY_ALPHA2[alpha2]?.name ?? alpha2;
}

export default async function NewTravelerPage({ params }: Props) {
  const { bookingId } = await params;
  const ctx = await requireStaffContext('booking.create');
  const [booking, travelers] = await Promise.all([
    bookingService.getById(ctx, bookingId),
    bookingService.listTravelers(ctx, bookingId),
  ]);
  const t = await getTranslations('StaffTravelersPage');
  const tCountries = await getTranslations('Countries');

  if (isBookingLocked(booking.status)) {
    const tBookingStatus = await getTranslations('BookingStatusLabel');
    return (
      <div className="max-w-lg">
        <BackLink href={`/staff/bookings/${bookingId}/addons`}>{t('backToAddons')}</BackLink>
        <PageHeader eyebrow={t('setupTravelers')} title={t('travelersOf', { current: travelers.length, total: booking.seats })} />
        <div className="mt-6">
          <Alert tone="info">{t('bookingLocked', { status: tBookingStatus(booking.status) })}</Alert>
        </div>
      </div>
    );
  }

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
        <BackLink href={`/staff/bookings/${bookingId}/addons`}>{t('backToAddons')}</BackLink>
        <PageHeader eyebrow={t('setupTravelers')} title={t('travelersOf', { current: travelers.length, total: booking.seats })} />
        <p className="mt-1 text-sm text-mist">{t('allEntered')}</p>
        <RevealGroup as="ul" itemAs="li" className="mt-4 space-y-2">
          {travelers.map((tv) => (
            <Card key={tv.id} className="text-sm">
              <span className="font-medium text-navy">
                {tv.firstName} {tv.lastName}
              </span>
              {tv.isTourLead && <span className="ml-2 text-xs uppercase tracking-wide text-forest">{t('tourLead')}</span>}
            </Card>
          ))}
        </RevealGroup>
        <div className="mt-6">
          <LinkButton
            href={booking.requiresPassportUpload ? `/staff/bookings/${bookingId}/passport` : `/staff/bookings/${bookingId}`}
          >
            {t('continueLabel')}
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

  // The plan-my-trip wizard already collected the tour lead's own name/
  // email/country of residence (Booking.contactFirstName/contactLastName/
  // contactEmail/countryOfResidence, DR-047/057) and phone (User.phone, set
  // via authService.updateProfile in that same submission) -- show those as
  // a read-only summary instead of re-asking, rather than presenting blank
  // inputs for data already on file. Falls back to an editable field per-
  // field if a legacy booking is missing one (nothing here is guaranteed
  // for a TAILOR_MADE booking created before DR-047/057 introduced these
  // columns). Nothing is known about co-travelers beyond the tour lead --
  // plan-my-trip only ever collects a seat count for them.
  const isTailorMade = booking.origin === 'TAILOR_MADE';
  const knownFirstName = isTailorMade ? booking.contactFirstName : null;
  const knownLastName = isTailorMade ? booking.contactLastName : null;
  const knownEmail = isTailorMade ? booking.contactEmail : null;
  const knownCountryOfResidence = isTailorMade ? booking.countryOfResidence : null;
  const tourist = isAddingTourLead && isTailorMade ? await authService.getUser(booking.touristUserId) : null;
  const knownPhone = tourist?.phone ? parseE164(tourist.phone) : null;

  return (
    <div className="max-w-lg">
      <BackLink href={`/staff/bookings/${bookingId}/addons`}>{t('backToAddons')}</BackLink>
      <PageHeader eyebrow={t('setupTravelers')} title={t('travelerOf', { number: travelerNumber, total: booking.seats })} />
      <p className="mt-1 text-sm text-mist">{t('enteredOf', { current: travelers.length, total: booking.seats })}</p>

      <Reveal>
      <form action={addTravelerAction.bind(null, bookingId)} className="mt-6 space-y-4">
        {isAddingTourLead && knownFirstName && knownLastName ? (
          <div className="rounded-survey border border-rule bg-bone/50 p-3 text-sm">
            <p className="text-xs uppercase tracking-wide text-mist">{t('fromGuestRequest')}</p>
            <p className="mt-1 text-navy">
              {knownFirstName} {knownLastName}
            </p>
            <input type="hidden" name="firstName" value={knownFirstName} />
            <input type="hidden" name="lastName" value={knownLastName} />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            <FormField label={t('firstName')} htmlFor="firstName">
              <input name="firstName" required className="w-full rounded-survey border border-rule px-3 py-2" />
            </FormField>
            <FormField label={t('lastName')} htmlFor="lastName">
              <input name="lastName" required className="w-full rounded-survey border border-rule px-3 py-2" />
            </FormField>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <FormField label={t('age')} htmlFor="age" optional={isTailorMade}>
            <input
              name="age"
              type="number"
              min={0}
              max={120}
              required={!isTailorMade}
              className="w-full rounded-survey border border-rule px-3 py-2"
            />
          </FormField>
          <FormField label={t('sex')} htmlFor="sex">
            <Select name="sex" required>
              <option value="M">M</option>
              <option value="F">F</option>
              <option value="X">X</option>
            </Select>
          </FormField>
        </div>

        <FormField label={t('nationality')} htmlFor="nationality" optional={isTailorMade}>
          {/* Citizenship (plan-my-trip step 7) isn't guaranteed to equal
              passport nationality, so this stays an editable field rather
              than a locked summary -- but it's a reasonable default over
              silently defaulting to whichever country sorts first.
              DR-111: a TAILOR_MADE request never collected real per-traveler
              nationality, so this stays genuinely unset (blank option, no
              silent default) unless staff pick one -- required again for a
              PREDEFINED_PACKAGE booking, same as before. */}
          <Select
            name="nationality"
            required={!isTailorMade}
            defaultValue={isTailorMade ? '' : isAddingTourLead ? (booking.citizenship ?? undefined) : undefined}
          >
            {isTailorMade && <option value="">{t('notSpecified')}</option>}
            {COUNTRY_CODES.map((c) => (
              <option key={c.alpha2} value={c.alpha2}>
                {flagEmoji(c.alpha2)} {c.name}
              </option>
            ))}
          </Select>
        </FormField>

        <FormField label={t('idOrPassportNumber')} htmlFor="idOrPassportNumber" optional={isTailorMade}>
          <input name="idOrPassportNumber" required={!isTailorMade} className="w-full rounded-survey border border-rule px-3 py-2" />
        </FormField>

        {isAddingTourLead && (
          <div className="space-y-4 rounded-survey border border-rule p-4">
            <p className="text-xs uppercase tracking-wide text-mist">{t('tourLeadContactDetails')}</p>
            {knownPhone ? (
              <div>
                <p className="text-sm text-mist">{t('phone')}</p>
                <p className="text-sm text-navy">
                  +{knownPhone.dialCode} {knownPhone.localNumber}
                </p>
                <input type="hidden" name="dialCode" value={knownPhone.dialCode} />
                <input type="hidden" name="localNumber" value={knownPhone.localNumber} />
              </div>
            ) : (
              <div>
                <p className="mb-1 block text-sm text-mist">{t('phone')}</p>
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
                    placeholder={t('phonePlaceholder')}
                    className="flex-1 rounded-survey border border-rule px-3 py-2"
                  />
                </div>
              </div>
            )}
            {knownEmail ? (
              <div>
                <p className="text-sm text-mist">{t('email')}</p>
                <p className="text-sm text-navy">{knownEmail}</p>
                <input type="hidden" name="email" value={knownEmail} />
              </div>
            ) : (
              <FormField label={t('email')} htmlFor="email">
                <input type="email" name="email" required className="w-full rounded-survey border border-rule px-3 py-2" />
              </FormField>
            )}
            {knownCountryOfResidence ? (
              <div>
                <p className="text-sm text-mist">{t('countryOfResidence')}</p>
                <p className="text-sm text-navy">{countryName(knownCountryOfResidence, tCountries)}</p>
                <input type="hidden" name="countryOfResidence" value={knownCountryOfResidence} />
              </div>
            ) : (
              <FormField label={t('countryOfResidence')} htmlFor="countryOfResidence">
                <Select name="countryOfResidence" required>
                  {COUNTRY_CODES.map((c) => (
                    <option key={c.alpha2} value={c.alpha2}>
                      {flagEmoji(c.alpha2)} {c.name}
                    </option>
                  ))}
                </Select>
              </FormField>
            )}
          </div>
        )}

        <FormField label={t('allergies')} htmlFor="allergies" optional>
          <input name="allergies" className="w-full rounded-survey border border-rule px-3 py-2" />
        </FormField>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <FormField label={t('emergencyContactName')} htmlFor="emergencyContactName" optional>
            <input name="emergencyContactName" className="w-full rounded-survey border border-rule px-3 py-2" />
          </FormField>
          <FormField label={t('emergencyContactPhone')} htmlFor="emergencyContactPhone" optional>
            <input name="emergencyContactPhone" className="w-full rounded-survey border border-rule px-3 py-2" />
          </FormField>
          <FormField label={t('relation')} htmlFor="emergencyContactRelation" optional>
            <input
              name="emergencyContactRelation"
              placeholder={t('relationPlaceholder')}
              className="w-full rounded-survey border border-rule px-3 py-2"
            />
          </FormField>
        </div>

        <SelectableCard type="checkbox" name="isTourLead" defaultChecked={!hasTourLead} disabled={hasTourLead}>
          {t('tourLeadCheckboxLabel')}
        </SelectableCard>

        <SubmitButton>{travelerNumber === booking.seats ? t('finishTravelers') : t('addTravelerContinue')}</SubmitButton>
      </form>
      </Reveal>
    </div>
  );
}

import { getTranslations } from 'next-intl/server';
import { COUNTRY_CODES, flagEmoji } from '@lib/country-codes';
import { FormField } from '@/components/ui/FormField';
import { Select } from '@/components/ui/Select';
import { SelectableCard } from '@/components/ui/SelectableCard';
import { SubmitButton } from '@/components/ui/SubmitButton';

// DR-257: lifted verbatim out of booking/[bookingId]/travelers/new/page.tsx
// so the session-gated wizard and the no-session /complete-booking flow
// render the SAME traveller form rather than two that drift apart. The only
// thing that differs between them is which Server Action it posts to, so
// that is a prop; everything else is identical.
interface TravelerFormProps {
  /** Already bound to its booking by the caller. */
  action: (formData: FormData) => Promise<void>;
  /** The tour lead carries the booking's contact details, so those extra
   * fields only render for them. */
  isAddingTourLead: boolean;
  hasTourLead: boolean;
  travelerNumber: number;
  seats: number;
  prefill?: { firstName?: string; lastName?: string; dialCode?: string; localNumber?: string };
}

export async function TravelerForm({ action, isAddingTourLead, hasTourLead, travelerNumber, seats, prefill }: TravelerFormProps) {
  const t = await getTranslations('TravelersPage');

  return (
    <form action={action} className="mt-6 space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <FormField label={t('firstName')} htmlFor="firstName">
          <input name="firstName" required defaultValue={prefill?.firstName ?? ''} className="w-full rounded-survey border border-rule px-3 py-2" />
        </FormField>
        <FormField label={t('lastName')} htmlFor="lastName">
          <input name="lastName" required defaultValue={prefill?.lastName ?? ''} className="w-full rounded-survey border border-rule px-3 py-2" />
        </FormField>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <FormField label={t('age')} htmlFor="age">
          <input name="age" type="number" min={0} max={120} required className="w-full rounded-survey border border-rule px-3 py-2" />
        </FormField>
        <FormField label={t('sex')} htmlFor="sex">
          <Select name="sex" required>
            <option value="M">M</option>
            <option value="F">F</option>
            <option value="X">X</option>
          </Select>
        </FormField>
      </div>

      <FormField label={t('nationality')} htmlFor="nationality">
        <Select name="nationality" required>
          {COUNTRY_CODES.map((c) => (
            <option key={c.alpha2} value={c.alpha2}>
              {flagEmoji(c.alpha2)} {c.name}
            </option>
          ))}
        </Select>
      </FormField>

      <FormField label={t('idOrPassportNumber')} htmlFor="idOrPassportNumber">
        <input name="idOrPassportNumber" required className="w-full rounded-survey border border-rule px-3 py-2" />
      </FormField>

      {isAddingTourLead && (
        <div className="space-y-4 rounded-survey border border-rule p-4">
          <p className="text-xs uppercase tracking-wide text-mist">{t('tourLeadContactDetails')}</p>
          <div>
            <p className="mb-1 block text-sm text-mist">{t('phone')}</p>
            <div className="flex gap-2">
              <Select name="dialCode" defaultValue={prefill?.dialCode}>
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
                defaultValue={prefill?.localNumber ?? ''}
                placeholder={t('phonePlaceholder')}
                className="flex-1 rounded-survey border border-rule px-3 py-2"
              />
            </div>
          </div>
          <FormField label={t('email')} htmlFor="email">
            <input type="email" name="email" required className="w-full rounded-survey border border-rule px-3 py-2" />
          </FormField>
          <FormField label={t('countryOfResidence')} htmlFor="countryOfResidence">
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
          <input name="emergencyContactRelation" placeholder={t('relationPlaceholder')} className="w-full rounded-survey border border-rule px-3 py-2" />
        </FormField>
      </div>

      <SelectableCard type="checkbox" name="isTourLead" defaultChecked={!hasTourLead} disabled={hasTourLead}>
        {t('tourLeadCheckboxLabel')}
      </SelectableCard>

      <SubmitButton>{travelerNumber === seats ? t('finishTravelers') : t('addTravelerContinue')}</SubmitButton>
    </form>
  );
}

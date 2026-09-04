'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { flagEmoji, OPERATING_COUNTRY_CODES } from '@lib/country-codes';
import { FormField } from '@/components/ui/FormField';
import { Select } from '@/components/ui/Select';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { createAddonRateAction, createEsimDataPlanRateAction, createFlightFareRateAction } from './actions';

type AddOnKind = 'PHOTOGRAPHY' | 'VIDEOGRAPHY' | 'TRANSLATOR' | 'VISA_ASSISTANCE' | 'FLIGHT_TICKET' | 'ESIM';

const FLAT_RATE_KINDS: AddOnKind[] = ['PHOTOGRAPHY', 'VIDEOGRAPHY', 'TRANSLATOR', 'VISA_ASSISTANCE'];

const CURRENCY_OPTIONS = (
  <>
    <option value="USD">USD</option>
    <option value="EUR">EUR</option>
    <option value="NAD">NAD</option>
    <option value="CDF">CDF</option>
  </>
);

interface AddOnRateFormProps {
  airports: { id: string; label: string }[];
}

// DR-243 (explicit user request): one shared "Add-on" picker for every
// guest-facing add-on rate, all inside the same "Add-on Services" card --
// Photography/Videography/Translator/Visa Assistance post to
// createAddonRateAction (flat country+price), same as before, but picking
// Flight Ticket or eSIM here swaps in the fields those two actually price
// by (a route+airline+class, or a country+data-allowance tier) and submits
// to createFlightFareRateAction/createEsimDataPlanRateAction instead --
// neither can be flattened into AddonRate's country+code+price shape. A
// client component only because the visible fields (and the form's own
// `action`) depend on live selection state; every field still posts
// through the same plain Server Actions the rest of this page uses.
export function AddOnRateForm({ airports }: AddOnRateFormProps) {
  const t = useTranslations('StaffFinanceRates');
  const tAddons = useTranslations('TripAddons');
  const tFlights = useTranslations('StaffFlightFareRates');
  const tEsim = useTranslations('StaffEsimRates');
  const tCountries = useTranslations('Countries');
  const [kind, setKind] = useState<AddOnKind>('PHOTOGRAPHY');

  const action = kind === 'FLIGHT_TICKET' ? createFlightFareRateAction : kind === 'ESIM' ? createEsimDataPlanRateAction : createAddonRateAction;

  return (
    <form action={action} className="mt-3 flex flex-wrap items-end gap-3">
      <FormField label={t('addonService')} htmlFor="code">
        <Select name="code" required className="text-sm" value={kind} onChange={(e) => setKind(e.target.value as AddOnKind)}>
          <option value="PHOTOGRAPHY">{tAddons('PHOTOGRAPHY')}</option>
          <option value="VIDEOGRAPHY">{tAddons('VIDEOGRAPHY')}</option>
          <option value="TRANSLATOR">{tAddons('TRANSLATOR')}</option>
          <option value="VISA_ASSISTANCE">{tAddons('VISA_ASSISTANCE')}</option>
          <option value="FLIGHT_TICKET">{tAddons('FLIGHT_TICKET')}</option>
          <option value="ESIM">{tAddons('ESIM')}</option>
        </Select>
      </FormField>

      {(FLAT_RATE_KINDS.includes(kind) || kind === 'ESIM') && (
        <FormField label={t('country')} htmlFor="country">
          <Select name="country" required className="text-sm">
            {OPERATING_COUNTRY_CODES.map((code) => (
              <option key={code} value={code}>
                {flagEmoji(code)} {tCountries(code)}
              </option>
            ))}
          </Select>
        </FormField>
      )}

      {kind === 'FLIGHT_TICKET' && (
        <>
          <FormField label={tFlights('origin')} htmlFor="originAirportId">
            <Select name="originAirportId" required className="text-sm">
              {airports.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label={tFlights('destination')} htmlFor="destinationAirportId">
            <Select name="destinationAirportId" required className="text-sm">
              {airports.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label={tFlights('airline')} htmlFor="airline">
            <input name="airline" placeholder={tFlights('airlinePlaceholder')} required className="w-32 rounded-survey border border-rule px-2 py-2 text-sm" />
          </FormField>
          <FormField label={tFlights('flightClass')} htmlFor="flightClass">
            <Select name="flightClass" required className="text-sm">
              <option value="ECONOMY">{tFlights('classECONOMY')}</option>
              <option value="BUSINESS">{tFlights('classBUSINESS')}</option>
              <option value="FIRST">{tFlights('classFIRST')}</option>
            </Select>
          </FormField>
        </>
      )}

      {kind === 'ESIM' && (
        <FormField label={tEsim('dataAllowance')} htmlFor="dataAllowanceGb">
          <input
            name="dataAllowanceGb"
            type="number"
            step="1"
            min="1"
            placeholder={tEsim('dataAllowancePlaceholder')}
            required
            className="w-20 rounded-survey border border-rule px-2 py-2 text-sm"
          />
        </FormField>
      )}

      <FormField label={t('price')} htmlFor="price">
        <input name="price" type="number" step="0.01" min="0" required className="w-28 rounded-survey border border-rule px-2 py-2 text-sm" />
      </FormField>
      <FormField label={t('currency')} htmlFor="currency">
        <Select name="currency" defaultValue={kind === 'FLIGHT_TICKET' || kind === 'ESIM' ? 'USD' : 'NAD'} required className="text-sm">
          {CURRENCY_OPTIONS}
        </Select>
      </FormField>
      <SubmitButton size="compact" pendingLabel={t('adding')}>
        {t('add')}
      </SubmitButton>

      {kind === 'FLIGHT_TICKET' && airports.length === 0 && <p className="w-full text-xs text-mist">{tFlights('noAirportsAvailable')}</p>}
    </form>
  );
}

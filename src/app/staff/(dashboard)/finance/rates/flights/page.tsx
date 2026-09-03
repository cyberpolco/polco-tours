import { getTranslations } from 'next-intl/server';
import { COUNTRY_CODES, COUNTRY_CODES_BY_ALPHA2, flagEmoji, OPERATING_COUNTRY_CODES } from '@lib/country-codes';
import { requireStaffContext } from '@lib/staff-guard';
import { financeService, type AirportView } from '@modules/finance';
import { BackLink } from '@/components/ui/BackLink';
import { Card } from '@/components/ui/Card';
import { FormField } from '@/components/ui/FormField';
import { PageHeader } from '@/components/ui/PageHeader';
import { Reveal } from '@/components/ui/Reveal';
import { Select } from '@/components/ui/Select';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Table, TableHeaderRow, Td, Th, Tr } from '@/components/ui/Table';
import { format, money } from '@lib/money';
import {
  createAirportAction,
  createFlightFareRateAction,
  deleteAirportAction,
  deleteFlightFareRateAction,
  updateAirportAction,
  updateFlightFareRateAction,
} from './actions';

// Airport is worldwide reference data (a departure airport may sit outside
// every one of the 5 operating countries, e.g. a European or South African
// hub) -- the full COUNTRY_CODES list, not the narrower OPERATING_COUNTRY_
// CODES set every other Operational Rate's country field uses. Same "large
// static reference dataset, deliberately untranslated" exclusion CLAUDE.md's
// i18n section documents for COUNTRY_CODES elsewhere (nationality/dial-code
// selects) -- c.name is shown as-is, no tCountries() call.
function worldCountryOptions() {
  return (
    <>
      {COUNTRY_CODES.map((c) => (
        <option key={c.alpha2} value={c.alpha2}>
          {flagEmoji(c.alpha2)} {c.name}
        </option>
      ))}
    </>
  );
}

// Same fallback convention as bookings/[bookingId]/page.tsx's own
// countryName helper: translate the 5 operating countries, fall back to the
// untranslated world-list name (or the raw code) for anything else -- an
// Airport's country is not restricted to the operating set (see above).
const OPERATING_COUNTRY_CODE_SET = new Set<string>(OPERATING_COUNTRY_CODES);
function countryName(alpha2: string, tCountries: (code: string) => string): string {
  return OPERATING_COUNTRY_CODE_SET.has(alpha2) ? tCountries(alpha2) : (COUNTRY_CODES_BY_ALPHA2[alpha2]?.name ?? alpha2);
}

function airportLabel(a: AirportView | undefined): string {
  return a ? `${a.iataCode} — ${a.name}, ${a.city}` : '—';
}

const CURRENCY_OPTIONS = (
  <>
    <option value="USD">USD</option>
    <option value="EUR">EUR</option>
    <option value="NAD">NAD</option>
    <option value="CDF">CDF</option>
  </>
);

function DeleteButton({
  action,
  removingLabel,
  removeConfirm,
  removeLabel,
}: {
  action: () => Promise<void>;
  removingLabel: string;
  removeConfirm: string;
  removeLabel: string;
}) {
  return (
    <form action={action}>
      <SubmitButton variant="secondary" size="compact" pendingLabel={removingLabel} confirmMessage={removeConfirm}>
        {removeLabel}
      </SubmitButton>
    </form>
  );
}

// A dependency-free, JS-free inline edit toggle, copied verbatim from
// finance/rates/page.tsx (a page.tsx file may only export `default` plus
// Next's own well-known names, so this can't be shared via import -- same
// reasoning settings/tax-rates/page.tsx's own copy documents).
function EditDisclosure({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <details className="mt-1">
      <summary className="cursor-pointer text-xs font-medium text-navy underline decoration-rule transition-colors hover:text-amber hover:decoration-amber">
        {label}
      </summary>
      <div className="mt-2">{children}</div>
    </details>
  );
}

// DR-222: staff CRUD for the FLIGHT_TICKET add-on's two backing reference
// tables -- Airport (a plain reference list) and FlightFareRate (the actual
// per-route x airline x class price, FK'd to two Airports). Same read/write
// gating as finance/rates/page.tsx: finance_config.read for the page,
// finance_config.write (SUPERADMIN-only, requireRateWriter) for every
// create/edit/delete form -- hidden here entirely rather than left dangling
// to 403, same "route passes, service rejects" precedent.
export default async function FlightFareRatesPage() {
  const ctx = await requireStaffContext('finance_config.read');
  const canWrite = ctx.roles.includes('SUPERADMIN');
  const t = await getTranslations('StaffFlightFareRates');
  const tCountries = await getTranslations('Countries');

  const [airports, flightFareRates] = await Promise.all([financeService.listAirports(ctx), financeService.listFlightFareRates(ctx)]);

  const airportById = new Map(airports.map((a) => [a.id, a]));
  const classLabel: Record<string, string> = {
    ECONOMY: t('classECONOMY'),
    BUSINESS: t('classBUSINESS'),
    FIRST: t('classFIRST'),
  };

  return (
    <div className="space-y-8">
      <BackLink href="/staff/settings/finance">{t('backToFinance')}</BackLink>
      <PageHeader eyebrow={t('eyebrow')} title={t('title')} />
      <Reveal className="space-y-8">
        <p className="text-xs text-mist">{t('intro')}</p>

        <Card>
          <p className="eyebrow text-mist">{t('airportsHeading')}</p>
          <p className="mt-1 text-xs text-mist">{t('airportsNotice')}</p>
          {airports.length === 0 ? (
            <p className="mt-2 text-sm text-mist">{t('noAirports')}</p>
          ) : (
            <Table className="mt-2">
              <thead>
                <TableHeaderRow>
                  <Th>{t('iataCode')}</Th>
                  <Th>{t('airportName')}</Th>
                  <Th>{t('city')}</Th>
                  <Th>{t('country')}</Th>
                  <Th>{t('active')}</Th>
                  <Th />
                </TableHeaderRow>
              </thead>
              <tbody>
                {airports.map((a) => (
                  <Tr key={a.id}>
                    <Td>
                      <span className="font-mono text-sm font-semibold text-navy">{a.iataCode}</span>
                    </Td>
                    <Td>{a.name}</Td>
                    <Td>{a.city}</Td>
                    <Td>
                      {flagEmoji(a.country)} {countryName(a.country, tCountries)}
                    </Td>
                    <Td>{a.active ? t('activeYes') : t('activeNo')}</Td>
                    <Td>
                      {canWrite && (
                        <>
                          <DeleteButton
                            action={deleteAirportAction.bind(null, a.id)}
                            removingLabel={t('removing')}
                            removeConfirm={t('removeConfirm')}
                            removeLabel={t('remove')}
                          />
                          <EditDisclosure label={t('edit')}>
                            <form action={updateAirportAction.bind(null, a.id)} className="flex flex-wrap items-end gap-2">
                              <input
                                name="iataCode"
                                defaultValue={a.iataCode}
                                maxLength={3}
                                minLength={3}
                                required
                                className="w-16 rounded-survey border border-rule px-2 py-2 text-sm uppercase"
                              />
                              <input
                                name="name"
                                defaultValue={a.name}
                                required
                                className="w-40 rounded-survey border border-rule px-2 py-2 text-sm"
                              />
                              <input
                                name="city"
                                defaultValue={a.city}
                                required
                                className="w-32 rounded-survey border border-rule px-2 py-2 text-sm"
                              />
                              <Select name="country" defaultValue={a.country} required className="text-sm">
                                {worldCountryOptions()}
                              </Select>
                              <label className="flex items-center gap-1 text-xs text-ink">
                                <input type="checkbox" name="active" defaultChecked={a.active} className="h-4 w-4" />
                                {t('active')}
                              </label>
                              <SubmitButton size="compact" pendingLabel={t('savingChanges')}>
                                {t('saveChanges')}
                              </SubmitButton>
                            </form>
                          </EditDisclosure>
                        </>
                      )}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
          {canWrite && (
            <form action={createAirportAction} className="mt-3 flex flex-wrap items-end gap-3">
              <FormField label={t('iataCode')} htmlFor="iataCode">
                <input
                  name="iataCode"
                  placeholder={t('iataCodePlaceholder')}
                  maxLength={3}
                  minLength={3}
                  required
                  className="w-16 rounded-survey border border-rule px-2 py-2 text-sm uppercase"
                />
              </FormField>
              <FormField label={t('airportName')} htmlFor="name">
                <input name="name" required className="w-40 rounded-survey border border-rule px-2 py-2 text-sm" />
              </FormField>
              <FormField label={t('city')} htmlFor="city">
                <input name="city" required className="w-32 rounded-survey border border-rule px-2 py-2 text-sm" />
              </FormField>
              <FormField label={t('country')} htmlFor="country">
                <Select name="country" required className="text-sm">
                  {worldCountryOptions()}
                </Select>
              </FormField>
              <label className="flex items-center gap-1 pb-2 text-xs text-ink">
                <input type="checkbox" name="active" defaultChecked className="h-4 w-4" />
                {t('active')}
              </label>
              <SubmitButton size="compact" pendingLabel={t('adding')}>
                {t('add')}
              </SubmitButton>
            </form>
          )}
        </Card>

        <Card>
          <p className="eyebrow text-mist">{t('flightFareRatesHeading')}</p>
          <p className="mt-1 text-xs text-mist">{t('flightFareRatesNotice')}</p>
          {flightFareRates.length === 0 ? (
            <p className="mt-2 text-sm text-mist">{t('noFlightFareRates')}</p>
          ) : (
            <Table className="mt-2">
              <thead>
                <TableHeaderRow>
                  <Th>{t('origin')}</Th>
                  <Th>{t('destination')}</Th>
                  <Th>{t('airline')}</Th>
                  <Th>{t('flightClass')}</Th>
                  <Th>{t('price')}</Th>
                  <Th>{t('validFrom')}</Th>
                  <Th>{t('validTo')}</Th>
                  <Th />
                </TableHeaderRow>
              </thead>
              <tbody>
                {flightFareRates.map((r) => (
                  <Tr key={r.id}>
                    <Td>{airportLabel(airportById.get(r.originAirportId))}</Td>
                    <Td>{airportLabel(airportById.get(r.destinationAirportId))}</Td>
                    <Td>{r.airline}</Td>
                    <Td>{classLabel[r.flightClass]}</Td>
                    <Td>
                      <span className="font-semibold text-navy">{format(money(r.priceMinor, r.currency))}</span>
                    </Td>
                    <Td>{r.validFrom.toLocaleDateString()}</Td>
                    <Td>{r.validTo ? r.validTo.toLocaleDateString() : '—'}</Td>
                    <Td>
                      {canWrite && (
                        <>
                          <DeleteButton
                            action={deleteFlightFareRateAction.bind(null, r.id)}
                            removingLabel={t('removing')}
                            removeConfirm={t('removeConfirm')}
                            removeLabel={t('remove')}
                          />
                          <EditDisclosure label={t('edit')}>
                            <form action={updateFlightFareRateAction.bind(null, r.id)} className="flex flex-wrap items-end gap-2">
                              <Select name="originAirportId" defaultValue={r.originAirportId} required className="text-sm">
                                {airports.map((a) => (
                                  <option key={a.id} value={a.id}>
                                    {airportLabel(a)}
                                  </option>
                                ))}
                              </Select>
                              <Select name="destinationAirportId" defaultValue={r.destinationAirportId} required className="text-sm">
                                {airports.map((a) => (
                                  <option key={a.id} value={a.id}>
                                    {airportLabel(a)}
                                  </option>
                                ))}
                              </Select>
                              <input
                                name="airline"
                                defaultValue={r.airline}
                                required
                                className="w-32 rounded-survey border border-rule px-2 py-2 text-sm"
                              />
                              <Select name="flightClass" defaultValue={r.flightClass} required className="text-sm">
                                <option value="ECONOMY">{t('classECONOMY')}</option>
                                <option value="BUSINESS">{t('classBUSINESS')}</option>
                                <option value="FIRST">{t('classFIRST')}</option>
                              </Select>
                              <input
                                name="price"
                                type="number"
                                step="0.01"
                                min="0"
                                defaultValue={(r.priceMinor / 100).toFixed(2)}
                                required
                                className="w-24 rounded-survey border border-rule px-2 py-2 text-sm"
                              />
                              <Select name="currency" defaultValue={r.currency} required className="text-sm">
                                {CURRENCY_OPTIONS}
                              </Select>
                              <SubmitButton size="compact" pendingLabel={t('savingChanges')}>
                                {t('saveChanges')}
                              </SubmitButton>
                            </form>
                          </EditDisclosure>
                        </>
                      )}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
          {canWrite && (
            <form action={createFlightFareRateAction} className="mt-3 flex flex-wrap items-end gap-3">
              <FormField label={t('origin')} htmlFor="originAirportId">
                <Select name="originAirportId" required className="text-sm">
                  {airports.map((a) => (
                    <option key={a.id} value={a.id}>
                      {airportLabel(a)}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label={t('destination')} htmlFor="destinationAirportId">
                <Select name="destinationAirportId" required className="text-sm">
                  {airports.map((a) => (
                    <option key={a.id} value={a.id}>
                      {airportLabel(a)}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label={t('airline')} htmlFor="airline">
                <input name="airline" placeholder={t('airlinePlaceholder')} required className="w-32 rounded-survey border border-rule px-2 py-2 text-sm" />
              </FormField>
              <FormField label={t('flightClass')} htmlFor="flightClass">
                <Select name="flightClass" required className="text-sm">
                  <option value="ECONOMY">{t('classECONOMY')}</option>
                  <option value="BUSINESS">{t('classBUSINESS')}</option>
                  <option value="FIRST">{t('classFIRST')}</option>
                </Select>
              </FormField>
              <FormField label={t('price')} htmlFor="price">
                <input name="price" type="number" step="0.01" min="0" required className="w-24 rounded-survey border border-rule px-2 py-2 text-sm" />
              </FormField>
              <FormField label={t('currency')} htmlFor="currency">
                <Select name="currency" defaultValue="USD" required className="text-sm">
                  {CURRENCY_OPTIONS}
                </Select>
              </FormField>
              <SubmitButton size="compact" pendingLabel={t('adding')}>
                {t('add')}
              </SubmitButton>
            </form>
          )}
          {canWrite && airports.length === 0 && <p className="mt-2 text-xs text-mist">{t('noAirportsAvailable')}</p>}
        </Card>
      </Reveal>
    </div>
  );
}

import { getTranslations } from 'next-intl/server';
import { flagEmoji, OPERATING_COUNTRY_CODES } from '@lib/country-codes';
import { requireStaffContext } from '@lib/staff-guard';
import { financeService } from '@modules/finance';
import { BackLink } from '@/components/ui/BackLink';
import { Card } from '@/components/ui/Card';
import { FormField } from '@/components/ui/FormField';
import { PageHeader } from '@/components/ui/PageHeader';
import { Reveal } from '@/components/ui/Reveal';
import { Select } from '@/components/ui/Select';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Table, TableHeaderRow, Td, Th, Tr } from '@/components/ui/Table';
import { format, money } from '@lib/money';
import { createEsimDataPlanRateAction, deleteEsimDataPlanRateAction, updateEsimDataPlanRateAction } from './actions';

// The eSIM add-on is priced per destination country, same "operating
// countries only" scope as every other Operational Rate's country field
// (StaffRate/HotelRate/TaxRate/etc.) -- unlike Airport (flights/page.tsx),
// which is genuinely worldwide reference data.
function countryOptions(tCountries: (code: string) => string) {
  return (
    <>
      {OPERATING_COUNTRY_CODES.map((code) => (
        <option key={code} value={code}>
          {flagEmoji(code)} {tCountries(code)}
        </option>
      ))}
    </>
  );
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

// Copied verbatim from finance/rates/page.tsx -- a page.tsx file may only
// export `default` plus Next's own well-known names, so this can't be
// shared via import (same reasoning settings/tax-rates/page.tsx's own copy
// documents).
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

// DR-222: staff CRUD for EsimDataPlanRate -- the ESIM add-on's price varies
// by country + data-plan tier (GB). Same read/write gating as
// finance/rates/page.tsx: finance_config.read for the page, finance_config
// .write (SUPERADMIN-only, requireRateWriter) for every create/edit/delete
// form -- hidden here entirely rather than left dangling to 403.
export default async function EsimDataPlanRatesPage() {
  const ctx = await requireStaffContext('finance_config.read');
  const canWrite = ctx.roles.includes('SUPERADMIN');
  const t = await getTranslations('StaffEsimRates');
  const tCountries = await getTranslations('Countries');

  const esimRates = await financeService.listEsimDataPlanRates(ctx);

  return (
    <div className="space-y-8">
      <BackLink href="/staff/settings/finance">{t('backToFinance')}</BackLink>
      <PageHeader eyebrow={t('eyebrow')} title={t('title')} />
      <Reveal className="space-y-8">
        <p className="text-xs text-mist">{t('intro')}</p>

        <Card>
          {esimRates.length === 0 ? (
            <p className="text-sm text-mist">{t('noneYet')}</p>
          ) : (
            <Table>
              <thead>
                <TableHeaderRow>
                  <Th>{t('country')}</Th>
                  <Th>{t('dataAllowance')}</Th>
                  <Th>{t('price')}</Th>
                  <Th>{t('validFrom')}</Th>
                  <Th>{t('validTo')}</Th>
                  <Th />
                </TableHeaderRow>
              </thead>
              <tbody>
                {esimRates.map((r) => (
                  <Tr key={r.id}>
                    <Td>
                      {flagEmoji(r.country)} {tCountries(r.country)}
                    </Td>
                    <Td>{t('gbValue', { gb: r.dataAllowanceGb })}</Td>
                    <Td>
                      <span className="font-semibold text-navy">{format(money(r.priceMinor, r.currency))}</span>
                    </Td>
                    <Td>{r.validFrom.toLocaleDateString()}</Td>
                    <Td>{r.validTo ? r.validTo.toLocaleDateString() : '—'}</Td>
                    <Td>
                      {canWrite && (
                        <>
                          <DeleteButton
                            action={deleteEsimDataPlanRateAction.bind(null, r.id)}
                            removingLabel={t('removing')}
                            removeConfirm={t('removeConfirm')}
                            removeLabel={t('remove')}
                          />
                          <EditDisclosure label={t('edit')}>
                            <form action={updateEsimDataPlanRateAction.bind(null, r.id)} className="flex flex-wrap items-end gap-2">
                              <Select name="country" defaultValue={r.country} required className="text-sm">
                                {countryOptions(tCountries)}
                              </Select>
                              <input
                                name="dataAllowanceGb"
                                type="number"
                                step="1"
                                min="1"
                                defaultValue={r.dataAllowanceGb}
                                required
                                className="w-20 rounded-survey border border-rule px-2 py-2 text-sm"
                              />
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
            <form action={createEsimDataPlanRateAction} className="mt-3 flex flex-wrap items-end gap-3">
              <FormField label={t('country')} htmlFor="country">
                <Select name="country" required className="text-sm">
                  {countryOptions(tCountries)}
                </Select>
              </FormField>
              <FormField label={t('dataAllowance')} htmlFor="dataAllowanceGb">
                <input
                  name="dataAllowanceGb"
                  type="number"
                  step="1"
                  min="1"
                  placeholder={t('dataAllowancePlaceholder')}
                  required
                  className="w-20 rounded-survey border border-rule px-2 py-2 text-sm"
                />
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
        </Card>
      </Reveal>
    </div>
  );
}

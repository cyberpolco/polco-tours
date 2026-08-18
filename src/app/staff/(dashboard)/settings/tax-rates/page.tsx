import { getTranslations } from 'next-intl/server';
import { requireStaffContext } from '@lib/staff-guard';
import { settingsService } from '@modules/settings';
import { BackLink } from '@/components/ui/BackLink';
import { Card } from '@/components/ui/Card';
import { FormField } from '@/components/ui/FormField';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/Select';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Table, TableHeaderRow, Td, Th, Tr } from '@/components/ui/Table';
import { createTaxRateAction, deleteTaxRateAction, updateTaxRateAction } from './actions';

function countryOptions(tCountries: (code: string) => string) {
  return (
    <>
      <option value="NA">🇳🇦 {tCountries('NA')}</option>
      <option value="CD">🇨🇩 {tCountries('CD')}</option>
      <option value="ZM">🇿🇲 {tCountries('ZM')}</option>
      <option value="ZW">🇿🇼 {tCountries('ZW')}</option>
    </>
  );
}

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

// Explicit user request: an in-place edit per row, same local
// dependency-free <details>-based convention as finance/rates/page.tsx's
// own EditDisclosure -- can't be imported from there directly, a page.tsx
// may only export `default` plus Next's well-known names.
function EditDisclosure({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <details className="mt-1">
      <summary className="cursor-pointer text-xs font-medium text-navy underline">{label}</summary>
      <div className="mt-2">{children}</div>
    </details>
  );
}

interface Props {
  searchParams: Promise<{
    reapplied?: string;
    packagesUpdated?: string;
    packagesSkipped?: string;
    bookingsUpdated?: string;
    bookingsSkipped?: string;
  }>;
}

// Settings module (DR-042) -- closes DR-035's parked "Configure system
// settings" item. TaxRate has existed since Phase 0 (DR-006) but had no
// staff UI until now -- only src/lib/tax.ts read it. Read is available to
// PLATFORM_ADMIN/TOUR_OPERATOR (they see the tax implications on every
// invoice); the add-row form, edit form, and delete buttons are
// SUPERADMIN-only, same "route passes, service rejects" pattern as
// Operational Rates. Editing in place (rather than only add-a-new-row)
// reapplies every existing package/booking cost breakdown, same as
// financeService's own updateXRate family (DR-136/DR-145).
export default async function TaxRatesPage({ searchParams }: Props) {
  const ctx = await requireStaffContext('platform_settings.read');
  const canWrite = ctx.roles.includes('SUPERADMIN');
  const taxRates = await settingsService.listTaxRates(ctx);
  const t = await getTranslations('StaffTaxRates');
  const tCountries = await getTranslations('Countries');
  const params = await searchParams;

  return (
    <div className="space-y-6">
      <BackLink href="/staff/settings/finance">{t('backToFinance')}</BackLink>
      <PageHeader eyebrow={t('eyebrow')} title={t('title')} />
      <p className="text-xs text-mist">{t('intro')}</p>

      {params.reapplied === '1' && (
        <Card className="border-forest/40 bg-forest/5">
          <p className="text-sm text-ink">
            {t('reapplyBanner', {
              packagesUpdated: Number(params.packagesUpdated ?? 0),
              packagesSkipped: Number(params.packagesSkipped ?? 0),
              bookingsUpdated: Number(params.bookingsUpdated ?? 0),
              bookingsSkipped: Number(params.bookingsSkipped ?? 0),
            })}
          </p>
        </Card>
      )}

      {taxRates.length === 0 ? (
        <p className="text-mist">{t('noneYet')}</p>
      ) : (
        <Table>
          <thead>
            <TableHeaderRow>
              <Th>{t('country')}</Th>
              <Th>{t('type')}</Th>
              <Th>{t('rate')}</Th>
              <Th>{t('validFrom')}</Th>
              <Th />
            </TableHeaderRow>
          </thead>
          <tbody>
            {taxRates.map((r) => (
              <Tr key={r.id}>
                <Td>{tCountries(r.country)}</Td>
                <Td>{r.taxType}</Td>
                <Td>{(r.rateBp / 100).toFixed(2)}%</Td>
                <Td>{r.validFrom.toLocaleDateString()}</Td>
                <Td>
                  {canWrite && (
                    <>
                      <DeleteButton
                        action={deleteTaxRateAction.bind(null, r.id)}
                        removingLabel={t('removing')}
                        removeConfirm={t('removeConfirm')}
                        removeLabel={t('remove')}
                      />
                      <EditDisclosure label={t('edit')}>
                        <form action={updateTaxRateAction.bind(null, r.id)} className="flex flex-wrap items-end gap-2">
                          <Select name="country" defaultValue={r.country} required className="text-sm">
                            {countryOptions(tCountries)}
                          </Select>
                          <input
                            name="taxType"
                            defaultValue={r.taxType}
                            placeholder={t('taxTypePlaceholder')}
                            className="w-28 rounded-survey border border-rule px-2 py-2 text-sm"
                          />
                          <input
                            name="ratePercent"
                            type="number"
                            step="0.01"
                            min="0"
                            defaultValue={(r.rateBp / 100).toFixed(2)}
                            required
                            className="w-24 rounded-survey border border-rule px-2 py-2 text-sm"
                          />
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
        <form action={createTaxRateAction} className="flex flex-wrap items-end gap-3">
          <FormField label={t('country')} htmlFor="country">
            <Select name="country" required className="text-sm">
              {countryOptions(tCountries)}
            </Select>
          </FormField>
          <FormField label={t('taxType')} htmlFor="taxType" optional>
            <input name="taxType" placeholder={t('taxTypePlaceholder')} className="w-28 rounded-survey border border-rule px-2 py-2 text-sm" />
          </FormField>
          <FormField label={t('ratePercent')} htmlFor="ratePercent">
            <input
              name="ratePercent"
              type="number"
              step="0.01"
              min="0"
              required
              className="w-24 rounded-survey border border-rule px-2 py-2 text-sm"
            />
          </FormField>
          <SubmitButton size="compact" pendingLabel={t('adding')}>
            {t('add')}
          </SubmitButton>
        </form>
      )}
    </div>
  );
}

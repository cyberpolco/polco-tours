import { getTranslations } from 'next-intl/server';
import { requireStaffContext } from '@lib/staff-guard';
import { settingsService } from '@modules/settings';
import { BackLink } from '@/components/ui/BackLink';
import { FormField } from '@/components/ui/FormField';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/Select';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Table, TableHeaderRow, Td, Th, Tr } from '@/components/ui/Table';
import { createTaxRateAction, deleteTaxRateAction } from './actions';

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

// Settings module (DR-042) -- closes DR-035's parked "Configure system
// settings" item. TaxRate has existed since Phase 0 (DR-006) but had no
// staff UI until now -- only src/lib/tax.ts read it. Read is available to
// PLATFORM_ADMIN/TOUR_OPERATOR (they see the tax implications on every
// invoice); the add-row form and delete buttons are SUPERADMIN-only, same
// "route passes, service rejects" pattern as Operational Rates.
export default async function TaxRatesPage() {
  const ctx = await requireStaffContext('platform_settings.read');
  const canWrite = ctx.roles.includes('SUPERADMIN');
  const taxRates = await settingsService.listTaxRates(ctx);
  const t = await getTranslations('StaffTaxRates');
  const tCountries = await getTranslations('Countries');

  return (
    <div className="space-y-6">
      <BackLink href="/staff/settings/finance">{t('backToFinance')}</BackLink>
      <PageHeader eyebrow={t('eyebrow')} title={t('title')} />
      <p className="text-xs text-mist">{t('intro')}</p>
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
              <Th>{t('validTo')}</Th>
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
                <Td>{r.validTo ? r.validTo.toLocaleDateString() : '—'}</Td>
                <Td>
                  {canWrite && (
                    <DeleteButton
                      action={deleteTaxRateAction.bind(null, r.id)}
                      removingLabel={t('removing')}
                      removeConfirm={t('removeConfirm')}
                      removeLabel={t('remove')}
                    />
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

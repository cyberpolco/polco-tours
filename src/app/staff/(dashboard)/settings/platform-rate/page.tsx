import { getTranslations } from 'next-intl/server';
import { requireStaffContext } from '@lib/staff-guard';
import { settingsService } from '@modules/settings';
import { BackLink } from '@/components/ui/BackLink';
import { FormField } from '@/components/ui/FormField';
import { PageHeader } from '@/components/ui/PageHeader';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Table, TableHeaderRow, Td, Th, Tr } from '@/components/ui/Table';
import { createPlatformRateAction, deletePlatformRateAction } from './actions';

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

// Settings module (DR-042) -- the platform's own commission on every online
// payment ("the cost to maintain the platform"), a single global rate (not
// per-country, unlike Tax Rates). Informational only: shown on the staff
// booking-detail invoice view as a split of the existing total, never added
// on top of what the customer pays -- see invoicingService's
// getOrCreateInvoiceForBooking. Effective-dated, same convention as Tax
// Rates -- add a new row rather than editing an old one.
export default async function PlatformRatePage() {
  const ctx = await requireStaffContext('platform_settings.read');
  const canWrite = ctx.roles.includes('SUPERADMIN');
  const platformRates = await settingsService.listPlatformRates(ctx);
  const t = await getTranslations('StaffPlatformRate');

  return (
    <div className="space-y-6">
      <BackLink href="/staff/settings/finance">{t('backToFinance')}</BackLink>
      <PageHeader eyebrow={t('eyebrow')} title={t('title')} />
      <p className="text-xs text-mist">{t('intro')}</p>
      {platformRates.length === 0 ? (
        <p className="text-mist">{t('noneYet')}</p>
      ) : (
        <Table>
          <thead>
            <TableHeaderRow>
              <Th>{t('rate')}</Th>
              <Th>{t('validFrom')}</Th>
              <Th />
            </TableHeaderRow>
          </thead>
          <tbody>
            {platformRates.map((r) => (
              <Tr key={r.id}>
                <Td>{(r.rateBp / 100).toFixed(2)}%</Td>
                <Td>{r.validFrom.toLocaleDateString()}</Td>
                <Td>
                  {canWrite && (
                    <DeleteButton
                      action={deletePlatformRateAction.bind(null, r.id)}
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
        <form action={createPlatformRateAction} className="flex flex-wrap items-end gap-3">
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

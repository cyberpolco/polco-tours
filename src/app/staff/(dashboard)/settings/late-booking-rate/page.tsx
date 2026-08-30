import { getTranslations } from 'next-intl/server';
import { requireStaffContext } from '@lib/staff-guard';
import { settingsService } from '@modules/settings';
import { BackLink } from '@/components/ui/BackLink';
import { FormField } from '@/components/ui/FormField';
import { PageHeader } from '@/components/ui/PageHeader';
import { Reveal } from '@/components/ui/Reveal';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Table, TableHeaderRow, Td, Th, Tr } from '@/components/ui/Table';
import { createLateBookingRateAction, deleteLateBookingRateAction, updateLateBookingRateAction } from './actions';

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

// Same local dependency-free <details>-based convention as
// platform-rate/page.tsx's own EditDisclosure -- can't be imported from
// there directly, a page.tsx may only export `default` plus Next's
// well-known names.
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

// Settings module (DR-198) -- a guest whose travel date is under
// thresholdDays away pays in full only, with a surchargeRateBp increase.
// Single global rate (not per-country), same shape as PlatformRate --
// unlike PlatformRate/TaxRate, editing in place does NOT reapply anything:
// this rate is only ever snapshotted onto a Booking at creation time, so a
// later change here must never retroactively touch an existing booking/
// invoice (see settingsService.updateLateBookingRate's own comment).
export default async function LateBookingRatePage() {
  const ctx = await requireStaffContext('platform_settings.read');
  const canWrite = ctx.roles.includes('SUPERADMIN');
  const rates = await settingsService.listLateBookingRates(ctx);
  const t = await getTranslations('StaffLateBookingRate');

  return (
    <div className="space-y-6">
      <BackLink href="/staff/settings/finance">{t('backToFinance')}</BackLink>
      <PageHeader eyebrow={t('eyebrow')} title={t('title')} />
      <Reveal className="space-y-6">
      <p className="text-xs text-mist">{t('intro')}</p>

      {rates.length === 0 ? (
        <p className="text-mist">{t('noneYet')}</p>
      ) : (
        <Table>
          <thead>
            <TableHeaderRow>
              <Th>{t('threshold')}</Th>
              <Th>{t('surcharge')}</Th>
              <Th>{t('validFrom')}</Th>
              <Th />
            </TableHeaderRow>
          </thead>
          <tbody>
            {rates.map((r) => (
              <Tr key={r.id}>
                <Td>{t('thresholdValue', { days: r.thresholdDays })}</Td>
                <Td>
                  <span className="text-base font-semibold text-navy">{(r.surchargeRateBp / 100).toFixed(2)}%</span>
                </Td>
                <Td>{r.validFrom.toLocaleDateString()}</Td>
                <Td>
                  {canWrite && (
                    <>
                      <DeleteButton
                        action={deleteLateBookingRateAction.bind(null, r.id)}
                        removingLabel={t('removing')}
                        removeConfirm={t('removeConfirm')}
                        removeLabel={t('remove')}
                      />
                      <EditDisclosure label={t('edit')}>
                        <form action={updateLateBookingRateAction.bind(null, r.id)} className="flex flex-wrap items-end gap-2">
                          <input
                            name="thresholdDays"
                            type="number"
                            step="1"
                            min="1"
                            defaultValue={r.thresholdDays}
                            required
                            className="w-20 rounded-survey border border-rule px-2 py-2 text-sm"
                          />
                          <input
                            name="surchargePercent"
                            type="number"
                            step="0.01"
                            min="0"
                            defaultValue={(r.surchargeRateBp / 100).toFixed(2)}
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
        <form action={createLateBookingRateAction} className="flex flex-wrap items-end gap-3">
          <FormField label={t('thresholdDays')} htmlFor="thresholdDays">
            <input
              name="thresholdDays"
              type="number"
              step="1"
              min="1"
              required
              className="w-20 rounded-survey border border-rule px-2 py-2 text-sm"
            />
          </FormField>
          <FormField label={t('surchargePercent')} htmlFor="surchargePercent">
            <input
              name="surchargePercent"
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
      </Reveal>
    </div>
  );
}

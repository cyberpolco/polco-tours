import { requireStaffContext } from '@lib/staff-guard';
import { settingsService } from '@modules/settings';
import { FormField } from '@/components/ui/FormField';
import { PageHeader } from '@/components/ui/PageHeader';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Table, TableHeaderRow, Td, Th, Tr } from '@/components/ui/Table';
import { SETTINGS_ITEMS } from '../../settings-items';
import { SidebarShell } from '../../sidebar-shell';
import { createPlatformRateAction, deletePlatformRateAction } from './actions';

function DeleteButton({ action }: { action: () => Promise<void> }) {
  return (
    <form action={action}>
      <SubmitButton variant="secondary" size="compact" pendingLabel="Removing…">
        Remove
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

  return (
    <SidebarShell items={SETTINGS_ITEMS} sectionTitle="Settings" roles={ctx.roles} permissions={[...ctx.permissions]}>
      <div className="space-y-6">
        <PageHeader eyebrow="Settings" title="Platform Rate" />
        <p className="text-xs text-mist">
          The platform&rsquo;s own commission on every online payment processed, shown as an informational split on
          each invoice -- it never changes what the customer pays. Effective-dated, same convention as Tax Rates.
        </p>
        {platformRates.length === 0 ? (
          <p className="text-mist">No platform rate configured yet.</p>
        ) : (
          <Table>
            <thead>
              <TableHeaderRow>
                <Th>Rate</Th>
                <Th>Valid from</Th>
                <Th>Valid to</Th>
                <Th />
              </TableHeaderRow>
            </thead>
            <tbody>
              {platformRates.map((r) => (
                <Tr key={r.id}>
                  <Td>{(r.rateBp / 100).toFixed(2)}%</Td>
                  <Td>{r.validFrom.toLocaleDateString()}</Td>
                  <Td>{r.validTo ? r.validTo.toLocaleDateString() : '—'}</Td>
                  <Td>{canWrite && <DeleteButton action={deletePlatformRateAction.bind(null, r.id)} />}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
        {canWrite && (
          <form action={createPlatformRateAction} className="flex flex-wrap items-end gap-3">
            <FormField label="Rate (%)" htmlFor="ratePercent">
              <input
                name="ratePercent"
                type="number"
                step="0.01"
                min="0"
                required
                className="w-24 rounded-survey border border-rule px-2 py-2 text-sm"
              />
            </FormField>
            <SubmitButton size="compact" pendingLabel="Adding…">
              Add
            </SubmitButton>
          </form>
        )}
      </div>
    </SidebarShell>
  );
}

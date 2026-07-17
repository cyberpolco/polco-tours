import { requireStaffContext } from '@lib/staff-guard';
import { settingsService } from '@modules/settings';
import { FormField } from '@/components/ui/FormField';
import { PageHeader } from '@/components/ui/PageHeader';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Table, TableHeaderRow, Td, Th, Tr } from '@/components/ui/Table';
import { SETTINGS_ITEMS } from '../../settings-items';
import { SidebarShell } from '../../sidebar-shell';
import { createTaxRateAction, deleteTaxRateAction } from './actions';

const COUNTRY_OPTIONS = (
  <>
    <option value="NA">🇳🇦 Namibia</option>
    <option value="CD">🇨🇩 DR Congo</option>
    <option value="ZM">🇿🇲 Zambia</option>
    <option value="ZW">🇿🇼 Zimbabwe</option>
  </>
);

function DeleteButton({ action }: { action: () => Promise<void> }) {
  return (
    <form action={action}>
      <SubmitButton variant="secondary" size="compact" pendingLabel="Removing…">
        Remove
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

  return (
    <SidebarShell items={SETTINGS_ITEMS} sectionTitle="Settings" roles={ctx.roles} permissions={[...ctx.permissions]}>
      <div className="space-y-6">
        <PageHeader eyebrow="Settings" title="Tax Rates" />
        <p className="text-xs text-mist">
          Per-country VAT/sales tax applied to every invoice (BR-01). Effective-dated -- add a new row rather than
          editing an old one when a rate changes; the most recent row still in its validity window wins.
        </p>
        {taxRates.length === 0 ? (
          <p className="text-mist">No tax rates configured yet.</p>
        ) : (
          <Table>
            <thead>
              <TableHeaderRow>
                <Th>Country</Th>
                <Th>Type</Th>
                <Th>Rate</Th>
                <Th>Valid from</Th>
                <Th>Valid to</Th>
                <Th />
              </TableHeaderRow>
            </thead>
            <tbody>
              {taxRates.map((r) => (
                <Tr key={r.id}>
                  <Td>{r.country}</Td>
                  <Td>{r.taxType}</Td>
                  <Td>{(r.rateBp / 100).toFixed(2)}%</Td>
                  <Td>{r.validFrom.toLocaleDateString()}</Td>
                  <Td>{r.validTo ? r.validTo.toLocaleDateString() : '—'}</Td>
                  <Td>{canWrite && <DeleteButton action={deleteTaxRateAction.bind(null, r.id)} />}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
        {canWrite && (
          <form action={createTaxRateAction} className="flex flex-wrap items-end gap-3">
            <FormField label="Country" htmlFor="country">
              <select name="country" required className="rounded-survey border border-rule px-2 py-2 text-sm">
                {COUNTRY_OPTIONS}
              </select>
            </FormField>
            <FormField label="Tax type" htmlFor="taxType" optional>
              <input name="taxType" placeholder="VAT" className="w-28 rounded-survey border border-rule px-2 py-2 text-sm" />
            </FormField>
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

import { requireStaffContext } from '@lib/staff-guard';
import { financeService } from '@modules/finance';
import { FormField } from '@/components/ui/FormField';
import { PageHeader } from '@/components/ui/PageHeader';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Table, TableHeaderRow, Td, Th, Tr } from '@/components/ui/Table';
import { format, money } from '@lib/money';
import { SETTINGS_ITEMS } from '../../settings-items';
import { SidebarShell } from '../../sidebar-shell';
import {
  createActivityFeeAction,
  createFoodBeverageRateAction,
  createHotelRateAction,
  createImmigrationCostRateAction,
  createStaffRateAction,
  createTransportRateAction,
  deleteActivityFeeAction,
  deleteFoodBeverageRateAction,
  deleteHotelRateAction,
  deleteImmigrationCostRateAction,
  deleteStaffRateAction,
  deleteTransportRateAction,
} from './actions';

const COUNTRY_OPTIONS = (
  <>
    <option value="NA">🇳🇦 Namibia</option>
    <option value="CD">🇨🇩 DR Congo</option>
    <option value="ZM">🇿🇲 Zambia</option>
    <option value="ZW">🇿🇼 Zimbabwe</option>
  </>
);

const CURRENCY_OPTIONS = (
  <>
    <option value="USD">USD</option>
    <option value="EUR">EUR</option>
    <option value="NAD">NAD</option>
    <option value="CDF">CDF</option>
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

// Finance Module (DR-039) -- "Operational Rates" configuration. Read is
// available to whoever builds a package's cost breakdown
// (finance_config.read); the add-row forms and delete buttons are
// SUPERADMIN-only -- PLATFORM_ADMIN passes the route-level permission gate
// but is rejected by financeService's explicit requireRateWriter check, so
// those controls are hidden here too rather than dangling ones that would
// 403 (same pattern as /staff/country-regulations).
export default async function FinanceRatesPage() {
  const ctx = await requireStaffContext('finance_config.read');
  const canWrite = ctx.roles.includes('SUPERADMIN');

  const [staffRates, hotelRates, transportRates, foodBeverageRates, activityFees, immigrationCostRates] = await Promise.all([
    financeService.listStaffRates(ctx),
    financeService.listHotelRates(ctx),
    financeService.listTransportRates(ctx),
    financeService.listFoodBeverageRates(ctx),
    financeService.listActivityFees(ctx),
    financeService.listImmigrationCostRates(ctx),
  ]);

  return (
    <SidebarShell items={SETTINGS_ITEMS} sectionTitle="Settings" roles={ctx.roles} permissions={[...ctx.permissions]}>
    <div className="space-y-10">
      <PageHeader eyebrow="Finance" title="Operational Rates" />
      <p className="text-xs text-mist">
        Feeds every package&rsquo;s cost breakdown (Base Cost + Agency Margin = Selling Price). Rates are effective-dated
        -- add a new row rather than editing an old one when a rate changes; the most recent row still in its validity
        window wins.
      </p>

      <section>
        <p className="eyebrow text-mist">Human Resources (staff daily rates)</p>
        {staffRates.length === 0 ? (
          <p className="mt-2 text-sm text-mist">No staff rates yet.</p>
        ) : (
          <Table className="mt-2">
            <thead>
              <TableHeaderRow>
                <Th>Country</Th>
                <Th>Role</Th>
                <Th>Daily rate</Th>
                <Th />
              </TableHeaderRow>
            </thead>
            <tbody>
              {staffRates.map((r) => (
                <Tr key={r.id}>
                  <Td>{r.country}</Td>
                  <Td>{r.role}</Td>
                  <Td>{format(money(r.dailyRateMinor, r.currency))}</Td>
                  <Td>{canWrite && <DeleteButton action={deleteStaffRateAction.bind(null, r.id)} />}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
        {canWrite && (
          <form action={createStaffRateAction} className="mt-3 flex flex-wrap items-end gap-3">
            <FormField label="Country" htmlFor="country">
              <select name="country" required className="rounded-survey border border-rule px-2 py-2 text-sm">
                {COUNTRY_OPTIONS}
              </select>
            </FormField>
            <FormField label="Role" htmlFor="role">
              <select name="role" required className="rounded-survey border border-rule px-2 py-2 text-sm">
                <option value="DRIVER">Driver</option>
                <option value="GUIDE">Tour Guide</option>
                <option value="PHOTOGRAPHER">Photographer</option>
                <option value="VIDEOGRAPHER">Videographer</option>
              </select>
            </FormField>
            <FormField label="Daily rate" htmlFor="dailyRate">
              <input name="dailyRate" type="number" step="0.01" min="0" required className="w-28 rounded-survey border border-rule px-2 py-2 text-sm" />
            </FormField>
            <FormField label="Currency" htmlFor="currency">
              <select name="currency" required className="rounded-survey border border-rule px-2 py-2 text-sm">
                {CURRENCY_OPTIONS}
              </select>
            </FormField>
            <SubmitButton size="compact" pendingLabel="Adding…">
              Add
            </SubmitButton>
          </form>
        )}
      </section>

      <section>
        <div className="survey-rule mb-4" />
        <p className="eyebrow text-mist">Accommodation (hotel nightly rates)</p>
        {hotelRates.length === 0 ? (
          <p className="mt-2 text-sm text-mist">No hotel rates yet.</p>
        ) : (
          <Table className="mt-2">
            <thead>
              <TableHeaderRow>
                <Th>Country</Th>
                <Th>Room category</Th>
                <Th>Nightly rate</Th>
                <Th />
              </TableHeaderRow>
            </thead>
            <tbody>
              {hotelRates.map((r) => (
                <Tr key={r.id}>
                  <Td>{r.country}</Td>
                  <Td>{r.roomCategory}</Td>
                  <Td>{format(money(r.nightlyRateMinor, r.currency))}</Td>
                  <Td>{canWrite && <DeleteButton action={deleteHotelRateAction.bind(null, r.id)} />}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
        {canWrite && (
          <form action={createHotelRateAction} className="mt-3 flex flex-wrap items-end gap-3">
            <FormField label="Country" htmlFor="country">
              <select name="country" required className="rounded-survey border border-rule px-2 py-2 text-sm">
                {COUNTRY_OPTIONS}
              </select>
            </FormField>
            <FormField label="Room category" htmlFor="roomCategory">
              <input name="roomCategory" placeholder="Standard" required className="w-36 rounded-survey border border-rule px-2 py-2 text-sm" />
            </FormField>
            <FormField label="Nightly rate" htmlFor="nightlyRate">
              <input name="nightlyRate" type="number" step="0.01" min="0" required className="w-28 rounded-survey border border-rule px-2 py-2 text-sm" />
            </FormField>
            <FormField label="Currency" htmlFor="currency">
              <select name="currency" required className="rounded-survey border border-rule px-2 py-2 text-sm">
                {CURRENCY_OPTIONS}
              </select>
            </FormField>
            <SubmitButton size="compact" pendingLabel="Adding…">
              Add
            </SubmitButton>
          </form>
        )}
      </section>

      <section>
        <div className="survey-rule mb-4" />
        <p className="eyebrow text-mist">Transportation (per-day estimates)</p>
        {transportRates.length === 0 ? (
          <p className="mt-2 text-sm text-mist">No transport rates yet.</p>
        ) : (
          <Table className="mt-2">
            <thead>
              <TableHeaderRow>
                <Th>Country</Th>
                <Th>Fuel</Th>
                <Th>Tolls</Th>
                <Th>Parking</Th>
                <Th>Vehicle operating</Th>
                <Th />
              </TableHeaderRow>
            </thead>
            <tbody>
              {transportRates.map((r) => (
                <Tr key={r.id}>
                  <Td>{r.country}</Td>
                  <Td>{format(money(r.fuelEstimateMinor, r.currency))}</Td>
                  <Td>{format(money(r.tollFeesMinor, r.currency))}</Td>
                  <Td>{format(money(r.parkingFeesMinor, r.currency))}</Td>
                  <Td>{format(money(r.vehicleOperatingCostMinor, r.currency))}</Td>
                  <Td>{canWrite && <DeleteButton action={deleteTransportRateAction.bind(null, r.id)} />}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
        {canWrite && (
          <form action={createTransportRateAction} className="mt-3 flex flex-wrap items-end gap-3">
            <FormField label="Country" htmlFor="country">
              <select name="country" required className="rounded-survey border border-rule px-2 py-2 text-sm">
                {COUNTRY_OPTIONS}
              </select>
            </FormField>
            <FormField label="Fuel/day" htmlFor="fuelEstimate">
              <input name="fuelEstimate" type="number" step="0.01" min="0" required className="w-24 rounded-survey border border-rule px-2 py-2 text-sm" />
            </FormField>
            <FormField label="Tolls/day" htmlFor="tollFees">
              <input name="tollFees" type="number" step="0.01" min="0" required className="w-24 rounded-survey border border-rule px-2 py-2 text-sm" />
            </FormField>
            <FormField label="Parking/day" htmlFor="parkingFees">
              <input name="parkingFees" type="number" step="0.01" min="0" required className="w-24 rounded-survey border border-rule px-2 py-2 text-sm" />
            </FormField>
            <FormField label="Vehicle op./day" htmlFor="vehicleOperatingCost">
              <input name="vehicleOperatingCost" type="number" step="0.01" min="0" required className="w-24 rounded-survey border border-rule px-2 py-2 text-sm" />
            </FormField>
            <FormField label="Currency" htmlFor="currency">
              <select name="currency" required className="rounded-survey border border-rule px-2 py-2 text-sm">
                {CURRENCY_OPTIONS}
              </select>
            </FormField>
            <SubmitButton size="compact" pendingLabel="Adding…">
              Add
            </SubmitButton>
          </form>
        )}
      </section>

      <section>
        <div className="survey-rule mb-4" />
        <p className="eyebrow text-mist">Food &amp; Beverage (per-person estimates)</p>
        {foodBeverageRates.length === 0 ? (
          <p className="mt-2 text-sm text-mist">No food/beverage rates yet.</p>
        ) : (
          <Table className="mt-2">
            <thead>
              <TableHeaderRow>
                <Th>Country</Th>
                <Th>Category</Th>
                <Th>Per unit</Th>
                <Th />
              </TableHeaderRow>
            </thead>
            <tbody>
              {foodBeverageRates.map((r) => (
                <Tr key={r.id}>
                  <Td>{r.country}</Td>
                  <Td>{r.category}</Td>
                  <Td>{format(money(r.perUnitMinor, r.currency))}</Td>
                  <Td>{canWrite && <DeleteButton action={deleteFoodBeverageRateAction.bind(null, r.id)} />}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
        {canWrite && (
          <form action={createFoodBeverageRateAction} className="mt-3 flex flex-wrap items-end gap-3">
            <FormField label="Country" htmlFor="country">
              <select name="country" required className="rounded-survey border border-rule px-2 py-2 text-sm">
                {COUNTRY_OPTIONS}
              </select>
            </FormField>
            <FormField label="Category" htmlFor="category">
              <select name="category" required className="rounded-survey border border-rule px-2 py-2 text-sm">
                <option value="BREAKFAST">Breakfast</option>
                <option value="LUNCH">Lunch</option>
                <option value="DINNER">Dinner</option>
                <option value="WATER">Water bottle</option>
                <option value="SOFT_DRINK">Soft drink</option>
                <option value="JUICE">Juice</option>
                <option value="LOCAL_BEVERAGE">Local beverage</option>
                <option value="ALCOHOLIC">Alcoholic beverage</option>
              </select>
            </FormField>
            <FormField label="Per unit" htmlFor="perUnit">
              <input name="perUnit" type="number" step="0.01" min="0" required className="w-28 rounded-survey border border-rule px-2 py-2 text-sm" />
            </FormField>
            <FormField label="Currency" htmlFor="currency">
              <select name="currency" required className="rounded-survey border border-rule px-2 py-2 text-sm">
                {CURRENCY_OPTIONS}
              </select>
            </FormField>
            <SubmitButton size="compact" pendingLabel="Adding…">
              Add
            </SubmitButton>
          </form>
        )}
      </section>

      <section>
        <div className="survey-rule mb-4" />
        <p className="eyebrow text-mist">Tourist Activities</p>
        {activityFees.length === 0 ? (
          <p className="mt-2 text-sm text-mist">No activity fees yet.</p>
        ) : (
          <Table className="mt-2">
            <thead>
              <TableHeaderRow>
                <Th>Country</Th>
                <Th>Activity</Th>
                <Th>Fee</Th>
                <Th />
              </TableHeaderRow>
            </thead>
            <tbody>
              {activityFees.map((r) => (
                <Tr key={r.id}>
                  <Td>{r.country}</Td>
                  <Td>{r.name}</Td>
                  <Td>{format(money(r.feeMinor, r.currency))}</Td>
                  <Td>{canWrite && <DeleteButton action={deleteActivityFeeAction.bind(null, r.id)} />}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
        {canWrite && (
          <form action={createActivityFeeAction} className="mt-3 flex flex-wrap items-end gap-3">
            <FormField label="Country" htmlFor="country">
              <select name="country" required className="rounded-survey border border-rule px-2 py-2 text-sm">
                {COUNTRY_OPTIONS}
              </select>
            </FormField>
            <FormField label="Activity name" htmlFor="name">
              <input name="name" placeholder="Etosha entrance" required className="w-48 rounded-survey border border-rule px-2 py-2 text-sm" />
            </FormField>
            <FormField label="Fee" htmlFor="fee">
              <input name="fee" type="number" step="0.01" min="0" required className="w-24 rounded-survey border border-rule px-2 py-2 text-sm" />
            </FormField>
            <FormField label="Currency" htmlFor="currency">
              <select name="currency" required className="rounded-survey border border-rule px-2 py-2 text-sm">
                {CURRENCY_OPTIONS}
              </select>
            </FormField>
            <SubmitButton size="compact" pendingLabel="Adding…">
              Add
            </SubmitButton>
          </form>
        )}
      </section>

      <section>
        <div className="survey-rule mb-4" />
        <p className="eyebrow text-mist">Immigration Costs</p>
        {immigrationCostRates.length === 0 ? (
          <p className="mt-2 text-sm text-mist">No immigration cost rates yet.</p>
        ) : (
          <Table className="mt-2">
            <thead>
              <TableHeaderRow>
                <Th>Country</Th>
                <Th>Visa fee</Th>
                <Th>Processing fee</Th>
                <Th>Invitation letter</Th>
                <Th>Border permit</Th>
                <Th />
              </TableHeaderRow>
            </thead>
            <tbody>
              {immigrationCostRates.map((r) => (
                <Tr key={r.id}>
                  <Td>{r.country}</Td>
                  <Td>{format(money(r.visaFeeMinor, r.currency))}</Td>
                  <Td>{format(money(r.processingFeeMinor, r.currency))}</Td>
                  <Td>{format(money(r.invitationLetterFeeMinor, r.currency))}</Td>
                  <Td>{format(money(r.borderPermitFeeMinor, r.currency))}</Td>
                  <Td>{canWrite && <DeleteButton action={deleteImmigrationCostRateAction.bind(null, r.id)} />}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
        {canWrite && (
          <form action={createImmigrationCostRateAction} className="mt-3 flex flex-wrap items-end gap-3">
            <FormField label="Country" htmlFor="country">
              <select name="country" required className="rounded-survey border border-rule px-2 py-2 text-sm">
                {COUNTRY_OPTIONS}
              </select>
            </FormField>
            <FormField label="Visa fee" htmlFor="visaFee">
              <input name="visaFee" type="number" step="0.01" min="0" required className="w-24 rounded-survey border border-rule px-2 py-2 text-sm" />
            </FormField>
            <FormField label="Processing fee" htmlFor="processingFee">
              <input name="processingFee" type="number" step="0.01" min="0" required className="w-24 rounded-survey border border-rule px-2 py-2 text-sm" />
            </FormField>
            <FormField label="Invitation letter" htmlFor="invitationLetterFee">
              <input name="invitationLetterFee" type="number" step="0.01" min="0" required className="w-24 rounded-survey border border-rule px-2 py-2 text-sm" />
            </FormField>
            <FormField label="Border permit" htmlFor="borderPermitFee">
              <input name="borderPermitFee" type="number" step="0.01" min="0" required className="w-24 rounded-survey border border-rule px-2 py-2 text-sm" />
            </FormField>
            <FormField label="Currency" htmlFor="currency">
              <select name="currency" required className="rounded-survey border border-rule px-2 py-2 text-sm">
                {CURRENCY_OPTIONS}
              </select>
            </FormField>
            <SubmitButton size="compact" pendingLabel="Adding…">
              Add
            </SubmitButton>
          </form>
        )}
      </section>
    </div>
    </SidebarShell>
  );
}

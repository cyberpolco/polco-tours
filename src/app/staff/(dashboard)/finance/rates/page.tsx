import { getTranslations } from 'next-intl/server';
import { requireStaffContext } from '@lib/staff-guard';
import { financeService } from '@modules/finance';
import { FormField } from '@/components/ui/FormField';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/Select';
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
  const t = await getTranslations('StaffFinanceRates');
  const tSidebar = await getTranslations('StaffSettingsSidebar');
  const tCountries = await getTranslations('Countries');

  const [staffRates, hotelRates, transportRates, foodBeverageRates, activityFees, immigrationCostRates] = await Promise.all([
    financeService.listStaffRates(ctx),
    financeService.listHotelRates(ctx),
    financeService.listTransportRates(ctx),
    financeService.listFoodBeverageRates(ctx),
    financeService.listActivityFees(ctx),
    financeService.listImmigrationCostRates(ctx),
  ]);

  return (
    <SidebarShell items={SETTINGS_ITEMS} sectionTitle={tSidebar('sectionTitle')} roles={ctx.roles} permissions={[...ctx.permissions]}>
    <div className="space-y-10">
      <PageHeader eyebrow={t('eyebrow')} title={t('title')} />
      <p className="text-xs text-mist">{t('intro')}</p>

      <section>
        <p className="eyebrow text-mist">{t('humanResources')}</p>
        {staffRates.length === 0 ? (
          <p className="mt-2 text-sm text-mist">{t('noStaffRates')}</p>
        ) : (
          <Table className="mt-2">
            <thead>
              <TableHeaderRow>
                <Th>{t('country')}</Th>
                <Th>{t('role')}</Th>
                <Th>{t('dailyRate')}</Th>
                <Th />
              </TableHeaderRow>
            </thead>
            <tbody>
              {staffRates.map((r) => (
                <Tr key={r.id}>
                  <Td>{tCountries(r.country)}</Td>
                  <Td>{r.role}</Td>
                  <Td>{format(money(r.dailyRateMinor, r.currency))}</Td>
                  <Td>
                    {canWrite && (
                      <DeleteButton
                        action={deleteStaffRateAction.bind(null, r.id)}
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
          <form action={createStaffRateAction} className="mt-3 flex flex-wrap items-end gap-3">
            <FormField label={t('country')} htmlFor="country">
              <Select name="country" required className="text-sm">
                {countryOptions(tCountries)}
              </Select>
            </FormField>
            <FormField label={t('role')} htmlFor="role">
              <Select name="role" required className="text-sm">
                <option value="DRIVER">{t('roleDriver')}</option>
                <option value="GUIDE">{t('roleGuide')}</option>
                <option value="PHOTOGRAPHER">{t('rolePhotographer')}</option>
                <option value="VIDEOGRAPHER">{t('roleVideographer')}</option>
              </Select>
            </FormField>
            <FormField label={t('dailyRate')} htmlFor="dailyRate">
              <input name="dailyRate" type="number" step="0.01" min="0" required className="w-28 rounded-survey border border-rule px-2 py-2 text-sm" />
            </FormField>
            <FormField label={t('currency')} htmlFor="currency">
              <Select name="currency" defaultValue="NAD" required className="text-sm">
                {CURRENCY_OPTIONS}
              </Select>
            </FormField>
            <SubmitButton size="compact" pendingLabel={t('adding')}>
              {t('add')}
            </SubmitButton>
          </form>
        )}
      </section>

      <section>
        <div className="survey-rule mb-4" />
        <p className="eyebrow text-mist">{t('accommodation')}</p>
        {hotelRates.length === 0 ? (
          <p className="mt-2 text-sm text-mist">{t('noHotelRates')}</p>
        ) : (
          <Table className="mt-2">
            <thead>
              <TableHeaderRow>
                <Th>{t('country')}</Th>
                <Th>{t('roomCategory')}</Th>
                <Th>{t('nightlyRate')}</Th>
                <Th />
              </TableHeaderRow>
            </thead>
            <tbody>
              {hotelRates.map((r) => (
                <Tr key={r.id}>
                  <Td>{tCountries(r.country)}</Td>
                  <Td>{r.roomCategory}</Td>
                  <Td>{format(money(r.nightlyRateMinor, r.currency))}</Td>
                  <Td>
                    {canWrite && (
                      <DeleteButton
                        action={deleteHotelRateAction.bind(null, r.id)}
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
          <form action={createHotelRateAction} className="mt-3 flex flex-wrap items-end gap-3">
            <FormField label={t('country')} htmlFor="country">
              <Select name="country" required className="text-sm">
                {countryOptions(tCountries)}
              </Select>
            </FormField>
            <FormField label={t('roomCategory')} htmlFor="roomCategory">
              <input name="roomCategory" placeholder={t('roomCategoryPlaceholder')} required className="w-36 rounded-survey border border-rule px-2 py-2 text-sm" />
            </FormField>
            <FormField label={t('nightlyRate')} htmlFor="nightlyRate">
              <input name="nightlyRate" type="number" step="0.01" min="0" required className="w-28 rounded-survey border border-rule px-2 py-2 text-sm" />
            </FormField>
            <FormField label={t('currency')} htmlFor="currency">
              <Select name="currency" defaultValue="NAD" required className="text-sm">
                {CURRENCY_OPTIONS}
              </Select>
            </FormField>
            <SubmitButton size="compact" pendingLabel={t('adding')}>
              {t('add')}
            </SubmitButton>
          </form>
        )}
      </section>

      <section>
        <div className="survey-rule mb-4" />
        <p className="eyebrow text-mist">{t('transportation')}</p>
        {transportRates.length === 0 ? (
          <p className="mt-2 text-sm text-mist">{t('noTransportRates')}</p>
        ) : (
          <Table className="mt-2">
            <thead>
              <TableHeaderRow>
                <Th>{t('country')}</Th>
                <Th>{t('fuel')}</Th>
                <Th>{t('tolls')}</Th>
                <Th>{t('parking')}</Th>
                <Th>{t('vehicleOperating')}</Th>
                <Th />
              </TableHeaderRow>
            </thead>
            <tbody>
              {transportRates.map((r) => (
                <Tr key={r.id}>
                  <Td>{tCountries(r.country)}</Td>
                  <Td>{format(money(r.fuelEstimateMinor, r.currency))}</Td>
                  <Td>{format(money(r.tollFeesMinor, r.currency))}</Td>
                  <Td>{format(money(r.parkingFeesMinor, r.currency))}</Td>
                  <Td>{format(money(r.vehicleOperatingCostMinor, r.currency))}</Td>
                  <Td>
                    {canWrite && (
                      <DeleteButton
                        action={deleteTransportRateAction.bind(null, r.id)}
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
          <form action={createTransportRateAction} className="mt-3 flex flex-wrap items-end gap-3">
            <FormField label={t('country')} htmlFor="country">
              <Select name="country" required className="text-sm">
                {countryOptions(tCountries)}
              </Select>
            </FormField>
            <FormField label={t('fuelPerDay')} htmlFor="fuelEstimate">
              <input name="fuelEstimate" type="number" step="0.01" min="0" required className="w-24 rounded-survey border border-rule px-2 py-2 text-sm" />
            </FormField>
            <FormField label={t('tollsPerDay')} htmlFor="tollFees">
              <input name="tollFees" type="number" step="0.01" min="0" required className="w-24 rounded-survey border border-rule px-2 py-2 text-sm" />
            </FormField>
            <FormField label={t('parkingPerDay')} htmlFor="parkingFees">
              <input name="parkingFees" type="number" step="0.01" min="0" required className="w-24 rounded-survey border border-rule px-2 py-2 text-sm" />
            </FormField>
            <FormField label={t('vehicleOpPerDay')} htmlFor="vehicleOperatingCost">
              <input name="vehicleOperatingCost" type="number" step="0.01" min="0" required className="w-24 rounded-survey border border-rule px-2 py-2 text-sm" />
            </FormField>
            <FormField label={t('currency')} htmlFor="currency">
              <Select name="currency" defaultValue="NAD" required className="text-sm">
                {CURRENCY_OPTIONS}
              </Select>
            </FormField>
            <SubmitButton size="compact" pendingLabel={t('adding')}>
              {t('add')}
            </SubmitButton>
          </form>
        )}
      </section>

      <section>
        <div className="survey-rule mb-4" />
        <p className="eyebrow text-mist">{t('foodBeverage')}</p>
        {foodBeverageRates.length === 0 ? (
          <p className="mt-2 text-sm text-mist">{t('noFoodBeverageRates')}</p>
        ) : (
          <Table className="mt-2">
            <thead>
              <TableHeaderRow>
                <Th>{t('country')}</Th>
                <Th>{t('category')}</Th>
                <Th>{t('perUnit')}</Th>
                <Th />
              </TableHeaderRow>
            </thead>
            <tbody>
              {foodBeverageRates.map((r) => (
                <Tr key={r.id}>
                  <Td>{tCountries(r.country)}</Td>
                  <Td>{r.category}</Td>
                  <Td>{format(money(r.perUnitMinor, r.currency))}</Td>
                  <Td>
                    {canWrite && (
                      <DeleteButton
                        action={deleteFoodBeverageRateAction.bind(null, r.id)}
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
          <form action={createFoodBeverageRateAction} className="mt-3 flex flex-wrap items-end gap-3">
            <FormField label={t('country')} htmlFor="country">
              <Select name="country" required className="text-sm">
                {countryOptions(tCountries)}
              </Select>
            </FormField>
            <FormField label={t('category')} htmlFor="category">
              <Select name="category" required className="text-sm">
                <option value="BREAKFAST">{t('categoryBreakfast')}</option>
                <option value="LUNCH">{t('categoryLunch')}</option>
                <option value="DINNER">{t('categoryDinner')}</option>
                <option value="WATER">{t('categoryWater')}</option>
                <option value="SOFT_DRINK">{t('categorySoftDrink')}</option>
                <option value="JUICE">{t('categoryJuice')}</option>
                <option value="LOCAL_BEVERAGE">{t('categoryLocalBeverage')}</option>
                <option value="ALCOHOLIC">{t('categoryAlcoholic')}</option>
              </Select>
            </FormField>
            <FormField label={t('perUnit')} htmlFor="perUnit">
              <input name="perUnit" type="number" step="0.01" min="0" required className="w-28 rounded-survey border border-rule px-2 py-2 text-sm" />
            </FormField>
            <FormField label={t('currency')} htmlFor="currency">
              <Select name="currency" defaultValue="NAD" required className="text-sm">
                {CURRENCY_OPTIONS}
              </Select>
            </FormField>
            <SubmitButton size="compact" pendingLabel={t('adding')}>
              {t('add')}
            </SubmitButton>
          </form>
        )}
      </section>

      <section>
        <div className="survey-rule mb-4" />
        <p className="eyebrow text-mist">{t('touristActivities')}</p>
        {activityFees.length === 0 ? (
          <p className="mt-2 text-sm text-mist">{t('noActivityFees')}</p>
        ) : (
          <Table className="mt-2">
            <thead>
              <TableHeaderRow>
                <Th>{t('country')}</Th>
                <Th>{t('activity')}</Th>
                <Th>{t('fee')}</Th>
                <Th />
              </TableHeaderRow>
            </thead>
            <tbody>
              {activityFees.map((r) => (
                <Tr key={r.id}>
                  <Td>{tCountries(r.country)}</Td>
                  <Td>{r.name}</Td>
                  <Td>{format(money(r.feeMinor, r.currency))}</Td>
                  <Td>
                    {canWrite && (
                      <DeleteButton
                        action={deleteActivityFeeAction.bind(null, r.id)}
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
          <form action={createActivityFeeAction} className="mt-3 flex flex-wrap items-end gap-3">
            <FormField label={t('country')} htmlFor="country">
              <Select name="country" required className="text-sm">
                {countryOptions(tCountries)}
              </Select>
            </FormField>
            <FormField label={t('activityName')} htmlFor="name">
              <input name="name" placeholder={t('activityNamePlaceholder')} required className="w-48 rounded-survey border border-rule px-2 py-2 text-sm" />
            </FormField>
            <FormField label={t('fee')} htmlFor="fee">
              <input name="fee" type="number" step="0.01" min="0" required className="w-24 rounded-survey border border-rule px-2 py-2 text-sm" />
            </FormField>
            <FormField label={t('currency')} htmlFor="currency">
              <Select name="currency" defaultValue="NAD" required className="text-sm">
                {CURRENCY_OPTIONS}
              </Select>
            </FormField>
            <SubmitButton size="compact" pendingLabel={t('adding')}>
              {t('add')}
            </SubmitButton>
          </form>
        )}
      </section>

      <section>
        <div className="survey-rule mb-4" />
        <p className="eyebrow text-mist">{t('immigrationCosts')}</p>
        {immigrationCostRates.length === 0 ? (
          <p className="mt-2 text-sm text-mist">{t('noImmigrationCostRates')}</p>
        ) : (
          <Table className="mt-2">
            <thead>
              <TableHeaderRow>
                <Th>{t('country')}</Th>
                <Th>{t('visaFee')}</Th>
                <Th>{t('processingFee')}</Th>
                <Th>{t('invitationLetter')}</Th>
                <Th>{t('borderPermit')}</Th>
                <Th />
              </TableHeaderRow>
            </thead>
            <tbody>
              {immigrationCostRates.map((r) => (
                <Tr key={r.id}>
                  <Td>{tCountries(r.country)}</Td>
                  <Td>{format(money(r.visaFeeMinor, r.currency))}</Td>
                  <Td>{format(money(r.processingFeeMinor, r.currency))}</Td>
                  <Td>{format(money(r.invitationLetterFeeMinor, r.currency))}</Td>
                  <Td>{format(money(r.borderPermitFeeMinor, r.currency))}</Td>
                  <Td>
                    {canWrite && (
                      <DeleteButton
                        action={deleteImmigrationCostRateAction.bind(null, r.id)}
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
          <form action={createImmigrationCostRateAction} className="mt-3 flex flex-wrap items-end gap-3">
            <FormField label={t('country')} htmlFor="country">
              <Select name="country" required className="text-sm">
                {countryOptions(tCountries)}
              </Select>
            </FormField>
            <FormField label={t('visaFee')} htmlFor="visaFee">
              <input name="visaFee" type="number" step="0.01" min="0" required className="w-24 rounded-survey border border-rule px-2 py-2 text-sm" />
            </FormField>
            <FormField label={t('processingFee')} htmlFor="processingFee">
              <input name="processingFee" type="number" step="0.01" min="0" required className="w-24 rounded-survey border border-rule px-2 py-2 text-sm" />
            </FormField>
            <FormField label={t('invitationLetter')} htmlFor="invitationLetterFee">
              <input name="invitationLetterFee" type="number" step="0.01" min="0" required className="w-24 rounded-survey border border-rule px-2 py-2 text-sm" />
            </FormField>
            <FormField label={t('borderPermit')} htmlFor="borderPermitFee">
              <input name="borderPermitFee" type="number" step="0.01" min="0" required className="w-24 rounded-survey border border-rule px-2 py-2 text-sm" />
            </FormField>
            <FormField label={t('currency')} htmlFor="currency">
              <Select name="currency" defaultValue="NAD" required className="text-sm">
                {CURRENCY_OPTIONS}
              </Select>
            </FormField>
            <SubmitButton size="compact" pendingLabel={t('adding')}>
              {t('add')}
            </SubmitButton>
          </form>
        )}
      </section>
    </div>
    </SidebarShell>
  );
}

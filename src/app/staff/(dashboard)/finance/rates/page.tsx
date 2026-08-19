import { getTranslations } from 'next-intl/server';
import { requireStaffContext } from '@lib/staff-guard';
import { financeService } from '@modules/finance';
import { itineraryService } from '@modules/itinerary';
import { BackLink } from '@/components/ui/BackLink';
import { Card } from '@/components/ui/Card';
import { FormField } from '@/components/ui/FormField';
import { PageHeader } from '@/components/ui/PageHeader';
import { Reveal } from '@/components/ui/Reveal';
import { SearchableSelect, type SearchableOption } from '@/components/ui/SearchableSelect';
import { Select } from '@/components/ui/Select';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Table, TableHeaderRow, Td, Th, Tr } from '@/components/ui/Table';
import { format, money } from '@lib/money';
import {
  createActivityFeeAction,
  createAddonRateAction,
  createAdminCostRateAction,
  createFoodBeverageRateAction,
  createHotelRateAction,
  createRestaurantRateAction,
  createStaffRateAction,
  createTransportRateAction,
  deleteActivityFeeAction,
  deleteAddonRateAction,
  deleteAdminCostRateAction,
  deleteFoodBeverageRateAction,
  deleteHotelRateAction,
  deleteRestaurantRateAction,
  deleteStaffRateAction,
  deleteTransportRateAction,
  updateActivityFeeAction,
  updateAddonRateAction,
  updateAdminCostRateAction,
  updateFoodBeverageRateAction,
  updateHotelRateAction,
  updateRestaurantRateAction,
  updateStaffRateAction,
  updateTransportRateAction,
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

// A dependency-free, JS-free inline edit toggle -- <details>/<summary> keeps
// this consistent with the rest of the page's plain-<form>-per-row
// convention (no client component needed just to show/hide an edit form).
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

// Finance Module (DR-039) -- "Operational Rates" configuration. Read is
// available to whoever builds a package's cost breakdown
// (finance_config.read); the add-row forms and delete buttons are
// SUPERADMIN-only -- PLATFORM_ADMIN passes the route-level permission gate
// but is rejected by financeService's explicit requireRateWriter check, so
// those controls are hidden here too rather than dangling ones that would
// 403 (same pattern as /staff/country-regulations).
interface Props {
  searchParams: Promise<{
    reapplied?: string;
    packagesUpdated?: string;
    packagesSkipped?: string;
    bookingsUpdated?: string;
    bookingsSkipped?: string;
  }>;
}

export default async function FinanceRatesPage({ searchParams }: Props) {
  const ctx = await requireStaffContext('finance_config.read');
  const canWrite = ctx.roles.includes('SUPERADMIN');
  const t = await getTranslations('StaffFinanceRates');
  const tCountries = await getTranslations('Countries');
  const tAddons = await getTranslations('TripAddons');
  const params = await searchParams;

  const [staffRates, hotelRates, restaurantRates, transportRates, foodBeverageRates, activityFees, adminCostRates, addonRates, hotels, restaurants, activities, sites] =
    await Promise.all([
      financeService.listStaffRates(ctx),
      financeService.listHotelRates(ctx),
      financeService.listRestaurantRates(ctx),
      financeService.listTransportRates(ctx),
      financeService.listFoodBeverageRates(ctx),
      financeService.listActivityFees(ctx),
      financeService.listAdminCostRates(ctx),
      financeService.listAddonRates(ctx),
      itineraryService.listHotels(ctx),
      itineraryService.listRestaurants(ctx),
      itineraryService.listActivities(ctx),
      itineraryService.listSites(ctx),
    ]);

  const hotelNameById = new Map(hotels.map((h) => [h.id, h.name]));
  const hotelOptions: SearchableOption[] = hotels.map((h) => ({
    value: h.id,
    label: `${h.name} (${tCountries(h.country)})`,
    searchText: `${h.name} ${h.country}`.toLowerCase(),
  }));

  const restaurantNameById = new Map(restaurants.map((r) => [r.id, r.name]));
  const restaurantOptions: SearchableOption[] = restaurants.map((r) => ({
    value: r.id,
    label: `${r.name} (${tCountries(r.country)})`,
    searchText: `${r.name} ${r.country}`.toLowerCase(),
  }));

  const siteById = new Map(sites.map((s) => [s.id, s]));
  // DR-122: every Activity is offered here regardless of its Fee flag --
  // staff decide per-country whether a given activity actually gets priced,
  // not this flag (which is purely informational on the Site detail page).
  const activityOptions: SearchableOption[] = activities.map((a) => {
    const site = siteById.get(a.siteId);
    const siteLabel = site ? `${site.name} (${tCountries(site.country)})` : '';
    return {
      value: a.id,
      label: siteLabel ? `${a.name} — ${siteLabel}` : a.name,
      searchText: `${a.name} ${site?.name ?? ''} ${site?.country ?? ''}`.toLowerCase(),
    };
  });

  return (
    <div className="space-y-8">
      <BackLink href="/staff/settings/finance">{t('backToFinance')}</BackLink>
      <PageHeader eyebrow={t('eyebrow')} title={t('title')} />
      <Reveal className="space-y-8">
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

      <Card>
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
                  <Td><span className="font-semibold text-navy">{format(money(r.dailyRateMinor, r.currency))}</span></Td>
                  <Td>
                    {canWrite && (
                      <>
                        <DeleteButton
                          action={deleteStaffRateAction.bind(null, r.id)}
                          removingLabel={t('removing')}
                          removeConfirm={t('removeConfirm')}
                          removeLabel={t('remove')}
                        />
                        <EditDisclosure label={t('edit')}>
                          <form action={updateStaffRateAction.bind(null, r.id)} className="flex flex-wrap items-end gap-2">
                            <Select name="country" defaultValue={r.country} required className="text-sm">
                              {countryOptions(tCountries)}
                            </Select>
                            <Select name="role" defaultValue={r.role} required className="text-sm">
                              <option value="DRIVER">{t('roleDriver')}</option>
                              <option value="GUIDE">{t('roleGuide')}</option>
                            </Select>
                            <input
                              name="dailyRate"
                              type="number"
                              step="0.01"
                              min="0"
                              defaultValue={(r.dailyRateMinor / 100).toFixed(2)}
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
      </Card>

      <Card>
        <p className="eyebrow text-mist">{t('accommodation')}</p>
        {hotelRates.length === 0 ? (
          <p className="mt-2 text-sm text-mist">{t('noHotelRates')}</p>
        ) : (
          <Table className="mt-2">
            <thead>
              <TableHeaderRow>
                <Th>{t('country')}</Th>
                <Th>{t('hotel')}</Th>
                <Th>{t('roomCategory')}</Th>
                <Th>{t('nightlyRate')}</Th>
                <Th />
              </TableHeaderRow>
            </thead>
            <tbody>
              {hotelRates.map((r) => (
                <Tr key={r.id}>
                  <Td>{tCountries(r.country)}</Td>
                  <Td>{r.hotelId ? (hotelNameById.get(r.hotelId) ?? '—') : '—'}</Td>
                  <Td>{r.roomCategory}</Td>
                  <Td><span className="font-semibold text-navy">{format(money(r.nightlyRateMinor, r.currency))}</span></Td>
                  <Td>
                    {canWrite && (
                      <>
                        <DeleteButton
                          action={deleteHotelRateAction.bind(null, r.id)}
                          removingLabel={t('removing')}
                          removeConfirm={t('removeConfirm')}
                          removeLabel={t('remove')}
                        />
                        <EditDisclosure label={t('edit')}>
                          <form action={updateHotelRateAction.bind(null, r.id)} className="flex flex-wrap items-end gap-2">
                            <Select name="country" defaultValue={r.country} required className="text-sm">
                              {countryOptions(tCountries)}
                            </Select>
                            <SearchableSelect
                              name="hotelId"
                              options={hotelOptions}
                              defaultValue={r.hotelId ?? undefined}
                              placeholder={t('hotelPlaceholder')}
                              className="w-56"
                              required
                            />
                            <input
                              name="roomCategory"
                              defaultValue={r.roomCategory}
                              required
                              className="w-36 rounded-survey border border-rule px-2 py-2 text-sm"
                            />
                            <input
                              name="nightlyRate"
                              type="number"
                              step="0.01"
                              min="0"
                              defaultValue={(r.nightlyRateMinor / 100).toFixed(2)}
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
          <form action={createHotelRateAction} className="mt-3 flex flex-wrap items-end gap-3">
            <FormField label={t('country')} htmlFor="country">
              <Select name="country" required className="text-sm">
                {countryOptions(tCountries)}
              </Select>
            </FormField>
            <FormField label={t('hotel')} htmlFor="hotelId">
              <SearchableSelect
                name="hotelId"
                options={hotelOptions}
                placeholder={t('hotelPlaceholder')}
                className="w-56"
                required
              />
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
        {canWrite && hotelOptions.length === 0 && <p className="mt-2 text-xs text-mist">{t('noHotelsAvailable')}</p>}
      </Card>

      <Card>
        <p className="eyebrow text-mist">{t('restaurantRates')}</p>
        <p className="mt-1 text-xs text-mist">{t('restaurantRatesNotice')}</p>
        {restaurantRates.length === 0 ? (
          <p className="mt-2 text-sm text-mist">{t('noRestaurantRates')}</p>
        ) : (
          <Table className="mt-2">
            <thead>
              <TableHeaderRow>
                <Th>{t('country')}</Th>
                <Th>{t('restaurant')}</Th>
                <Th>{t('dailyRate')}</Th>
                <Th />
              </TableHeaderRow>
            </thead>
            <tbody>
              {restaurantRates.map((r) => (
                <Tr key={r.id}>
                  <Td>{tCountries(r.country)}</Td>
                  <Td>{restaurantNameById.get(r.restaurantId) ?? '—'}</Td>
                  <Td><span className="font-semibold text-navy">{format(money(r.dailyRateMinor, r.currency))}</span></Td>
                  <Td>
                    {canWrite && (
                      <>
                        <DeleteButton
                          action={deleteRestaurantRateAction.bind(null, r.id)}
                          removingLabel={t('removing')}
                          removeConfirm={t('removeConfirm')}
                          removeLabel={t('remove')}
                        />
                        <EditDisclosure label={t('edit')}>
                          <form action={updateRestaurantRateAction.bind(null, r.id)} className="flex flex-wrap items-end gap-2">
                            <Select name="country" defaultValue={r.country} required className="text-sm">
                              {countryOptions(tCountries)}
                            </Select>
                            <SearchableSelect
                              name="restaurantId"
                              options={restaurantOptions}
                              defaultValue={r.restaurantId}
                              placeholder={t('restaurantPlaceholder')}
                              className="w-56"
                              required
                            />
                            <input
                              name="dailyRate"
                              type="number"
                              step="0.01"
                              min="0"
                              defaultValue={(r.dailyRateMinor / 100).toFixed(2)}
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
          <form action={createRestaurantRateAction} className="mt-3 flex flex-wrap items-end gap-3">
            <FormField label={t('country')} htmlFor="country">
              <Select name="country" required className="text-sm">
                {countryOptions(tCountries)}
              </Select>
            </FormField>
            <FormField label={t('restaurant')} htmlFor="restaurantId">
              <SearchableSelect
                name="restaurantId"
                options={restaurantOptions}
                placeholder={t('restaurantPlaceholder')}
                className="w-56"
                required
              />
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
        {canWrite && restaurantOptions.length === 0 && <p className="mt-2 text-xs text-mist">{t('noRestaurantsAvailable')}</p>}
      </Card>

      <Card>
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
                  <Td><span className="font-semibold text-navy">{format(money(r.fuelEstimateMinor, r.currency))}</span></Td>
                  <Td><span className="font-semibold text-navy">{format(money(r.tollFeesMinor, r.currency))}</span></Td>
                  <Td><span className="font-semibold text-navy">{format(money(r.parkingFeesMinor, r.currency))}</span></Td>
                  <Td><span className="font-semibold text-navy">{format(money(r.vehicleOperatingCostMinor, r.currency))}</span></Td>
                  <Td>
                    {canWrite && (
                      <>
                        <DeleteButton
                          action={deleteTransportRateAction.bind(null, r.id)}
                          removingLabel={t('removing')}
                          removeConfirm={t('removeConfirm')}
                          removeLabel={t('remove')}
                        />
                        <EditDisclosure label={t('edit')}>
                          <form action={updateTransportRateAction.bind(null, r.id)} className="flex flex-wrap items-end gap-2">
                            <Select name="country" defaultValue={r.country} required className="text-sm">
                              {countryOptions(tCountries)}
                            </Select>
                            <input
                              name="fuelEstimate"
                              type="number"
                              step="0.01"
                              min="0"
                              defaultValue={(r.fuelEstimateMinor / 100).toFixed(2)}
                              required
                              className="w-24 rounded-survey border border-rule px-2 py-2 text-sm"
                            />
                            <input
                              name="tollFees"
                              type="number"
                              step="0.01"
                              min="0"
                              defaultValue={(r.tollFeesMinor / 100).toFixed(2)}
                              required
                              className="w-24 rounded-survey border border-rule px-2 py-2 text-sm"
                            />
                            <input
                              name="parkingFees"
                              type="number"
                              step="0.01"
                              min="0"
                              defaultValue={(r.parkingFeesMinor / 100).toFixed(2)}
                              required
                              className="w-24 rounded-survey border border-rule px-2 py-2 text-sm"
                            />
                            <input
                              name="vehicleOperatingCost"
                              type="number"
                              step="0.01"
                              min="0"
                              defaultValue={(r.vehicleOperatingCostMinor / 100).toFixed(2)}
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
      </Card>

      <Card>
        <p className="eyebrow text-mist">{t('foodBeverage')}</p>
        <p className="mt-1 text-xs text-mist">{t('foodBeverageNotice')}</p>
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
                  <Td><span className="font-semibold text-navy">{format(money(r.perUnitMinor, r.currency))}</span></Td>
                  <Td>
                    {canWrite && (
                      <>
                        <DeleteButton
                          action={deleteFoodBeverageRateAction.bind(null, r.id)}
                          removingLabel={t('removing')}
                          removeConfirm={t('removeConfirm')}
                          removeLabel={t('remove')}
                        />
                        <EditDisclosure label={t('edit')}>
                          <form action={updateFoodBeverageRateAction.bind(null, r.id)} className="flex flex-wrap items-end gap-2">
                            <Select name="country" defaultValue={r.country} required className="text-sm">
                              {countryOptions(tCountries)}
                            </Select>
                            <Select name="category" defaultValue={r.category} required className="text-sm">
                              <option value="WATER">{t('categoryWater')}</option>
                              <option value="SOFT_DRINK">{t('categorySoftDrink')}</option>
                              <option value="JUICE">{t('categoryJuice')}</option>
                              <option value="LOCAL_BEVERAGE">{t('categoryLocalBeverage')}</option>
                              <option value="ALCOHOLIC">{t('categoryAlcoholic')}</option>
                            </Select>
                            <input
                              name="perUnit"
                              type="number"
                              step="0.01"
                              min="0"
                              defaultValue={(r.perUnitMinor / 100).toFixed(2)}
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
          <form action={createFoodBeverageRateAction} className="mt-3 flex flex-wrap items-end gap-3">
            <FormField label={t('country')} htmlFor="country">
              <Select name="country" required className="text-sm">
                {countryOptions(tCountries)}
              </Select>
            </FormField>
            <FormField label={t('category')} htmlFor="category">
              <Select name="category" required className="text-sm">
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
      </Card>

      <Card>
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
                  <Td><span className="font-semibold text-navy">{format(money(r.feeMinor, r.currency))}</span></Td>
                  <Td>
                    {canWrite && (
                      <>
                        <DeleteButton
                          action={deleteActivityFeeAction.bind(null, r.id)}
                          removingLabel={t('removing')}
                          removeConfirm={t('removeConfirm')}
                          removeLabel={t('remove')}
                        />
                        <EditDisclosure label={t('edit')}>
                          <form action={updateActivityFeeAction.bind(null, r.id)} className="flex flex-wrap items-end gap-2">
                            <Select name="country" defaultValue={r.country} required className="text-sm">
                              {countryOptions(tCountries)}
                            </Select>
                            <SearchableSelect
                              name="activityId"
                              options={activityOptions}
                              defaultValue={r.activityId ?? undefined}
                              placeholder={t('activityPlaceholder')}
                              className="w-64"
                              required
                            />
                            <input
                              name="fee"
                              type="number"
                              step="0.01"
                              min="0"
                              defaultValue={(r.feeMinor / 100).toFixed(2)}
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
          <form action={createActivityFeeAction} className="mt-3 flex flex-wrap items-end gap-3">
            <FormField label={t('country')} htmlFor="country">
              <Select name="country" required className="text-sm">
                {countryOptions(tCountries)}
              </Select>
            </FormField>
            <FormField label={t('activity')} htmlFor="activityId">
              <SearchableSelect
                name="activityId"
                options={activityOptions}
                placeholder={t('activityPlaceholder')}
                className="w-64"
                required
              />
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
        {canWrite && activityOptions.length === 0 && <p className="mt-2 text-xs text-mist">{t('noActivitiesAvailable')}</p>}
      </Card>

      <Card>
        <p className="eyebrow text-mist">{t('adminCosts')}</p>
        <p className="mt-1 text-xs text-mist">{t('adminCostsNotice')}</p>
        {adminCostRates.length === 0 ? (
          <p className="mt-2 text-sm text-mist">{t('noAdminCostRates')}</p>
        ) : (
          <Table className="mt-2">
            <thead>
              <TableHeaderRow>
                <Th>{t('country')}</Th>
                <Th>{t('dailyRate')}</Th>
                <Th />
              </TableHeaderRow>
            </thead>
            <tbody>
              {adminCostRates.map((r) => (
                <Tr key={r.id}>
                  <Td>{tCountries(r.country)}</Td>
                  <Td><span className="font-semibold text-navy">{format(money(r.dailyRateMinor, r.currency))}</span></Td>
                  <Td>
                    {canWrite && (
                      <>
                        <DeleteButton
                          action={deleteAdminCostRateAction.bind(null, r.id)}
                          removingLabel={t('removing')}
                          removeConfirm={t('removeConfirm')}
                          removeLabel={t('remove')}
                        />
                        <EditDisclosure label={t('edit')}>
                          <form action={updateAdminCostRateAction.bind(null, r.id)} className="flex flex-wrap items-end gap-2">
                            <Select name="country" defaultValue={r.country} required className="text-sm">
                              {countryOptions(tCountries)}
                            </Select>
                            <input
                              name="dailyRate"
                              type="number"
                              step="0.01"
                              min="0"
                              defaultValue={(r.dailyRateMinor / 100).toFixed(2)}
                              required
                              className="w-28 rounded-survey border border-rule px-2 py-2 text-sm"
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
          <form action={createAdminCostRateAction} className="mt-3 flex flex-wrap items-end gap-3">
            <FormField label={t('country')} htmlFor="country">
              <Select name="country" required className="text-sm">
                {countryOptions(tCountries)}
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
      </Card>

      <Card>
        <p className="eyebrow text-mist">{t('addonServices')}</p>
        <p className="mt-1 text-xs text-mist">{t('addonServicesNotice')}</p>
        {addonRates.length === 0 ? (
          <p className="mt-2 text-sm text-mist">{t('noAddonRates')}</p>
        ) : (
          <Table className="mt-2">
            <thead>
              <TableHeaderRow>
                <Th>{t('country')}</Th>
                <Th>{t('addonService')}</Th>
                <Th>{t('price')}</Th>
                <Th />
              </TableHeaderRow>
            </thead>
            <tbody>
              {addonRates.map((r) => (
                <Tr key={r.id}>
                  <Td>{tCountries(r.country)}</Td>
                  <Td>{tAddons(r.code)}</Td>
                  <Td><span className="font-semibold text-navy">{format(money(r.priceMinor, r.currency))}</span></Td>
                  <Td>
                    {canWrite && (
                      <>
                        <DeleteButton
                          action={deleteAddonRateAction.bind(null, r.id)}
                          removingLabel={t('removing')}
                          removeConfirm={t('removeConfirm')}
                          removeLabel={t('remove')}
                        />
                        <EditDisclosure label={t('edit')}>
                          <form action={updateAddonRateAction.bind(null, r.id)} className="flex flex-wrap items-end gap-2">
                            <Select name="country" defaultValue={r.country} required className="text-sm">
                              {countryOptions(tCountries)}
                            </Select>
                            <Select name="code" defaultValue={r.code} required className="text-sm">
                              <option value="PHOTOGRAPHY">{tAddons('PHOTOGRAPHY')}</option>
                              <option value="VIDEOGRAPHY">{tAddons('VIDEOGRAPHY')}</option>
                              <option value="TRANSLATOR">{tAddons('TRANSLATOR')}</option>
                              <option value="VISA_ASSISTANCE">{tAddons('VISA_ASSISTANCE')}</option>
                            </Select>
                            <input
                              name="price"
                              type="number"
                              step="0.01"
                              min="0"
                              defaultValue={(r.priceMinor / 100).toFixed(2)}
                              required
                              className="w-28 rounded-survey border border-rule px-2 py-2 text-sm"
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
          <form action={createAddonRateAction} className="mt-3 flex flex-wrap items-end gap-3">
            <FormField label={t('country')} htmlFor="country">
              <Select name="country" required className="text-sm">
                {countryOptions(tCountries)}
              </Select>
            </FormField>
            <FormField label={t('addonService')} htmlFor="code">
              <Select name="code" required className="text-sm">
                <option value="PHOTOGRAPHY">{tAddons('PHOTOGRAPHY')}</option>
                <option value="VIDEOGRAPHY">{tAddons('VIDEOGRAPHY')}</option>
                <option value="TRANSLATOR">{tAddons('TRANSLATOR')}</option>
                <option value="VISA_ASSISTANCE">{tAddons('VISA_ASSISTANCE')}</option>
              </Select>
            </FormField>
            <FormField label={t('price')} htmlFor="price">
              <input name="price" type="number" step="0.01" min="0" required className="w-28 rounded-survey border border-rule px-2 py-2 text-sm" />
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
      </Card>
      </Reveal>
    </div>
  );
}

import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { requireStaffContext } from '@lib/staff-guard';
import { bookingService } from '@modules/booking';
import { catalogService } from '@modules/catalog';
import { financeService } from '@modules/finance';
import { Alert } from '@/components/ui/Alert';
import { BackLink } from '@/components/ui/BackLink';
import { Card } from '@/components/ui/Card';
import { FormField } from '@/components/ui/FormField';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/Select';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { format, formatOrPending, money } from '@lib/money';
import { saveBookingCostBreakdownAction } from './actions';

interface Props {
  params: Promise<{ bookingId: string }>;
  searchParams: Promise<{ error?: string; detail?: string }>;
}

// Structural mirror of packages/[packageId]/cost-breakdown/page.tsx, adapted
// for a TAILOR_MADE booking: no reference-group-size input (booking.seats is
// fixed and shown read-only), no currency input (derived server-side, shown
// read-only or "not yet determined" -- see financeService.
// saveBookingCostBreakdown for the derivation rules).
export default async function BookingCostBreakdownPage({ params, searchParams }: Props) {
  const { bookingId } = await params;
  const { error, detail } = await searchParams;
  const ctx = await requireStaffContext('booking.confirm');

  let booking;
  try {
    booking = await bookingService.getById(ctx, bookingId);
  } catch {
    notFound();
  }
  if (booking.origin !== 'TAILOR_MADE' || !booking.customCountry) notFound();
  const country = booking.customCountry;
  const t = await getTranslations('StaffCostBreakdown');
  const tCountries = await getTranslations('Countries');

  const [breakdown, addons, transportRates, immigrationCostRates, foodBeverageRates, templateDays] = await Promise.all([
    financeService.getBookingCostBreakdown(ctx, bookingId),
    bookingService.listAddons(ctx, bookingId),
    financeService.listTransportRates(ctx),
    financeService.listImmigrationCostRates(ctx),
    financeService.listFoodBeverageRates(ctx),
    booking.customizedPackageId ? catalogService.listTemplateDaysForItineraryCopy(booking.organizationId, booking.customizedPackageId) : Promise.resolve([]),
  ]);

  const countryTransportRates = transportRates.filter((r) => r.country === country);
  const countryImmigrationRates = immigrationCostRates.filter((r) => r.country === country);
  const drinkRates = foodBeverageRates.filter(
    (r) => r.country === country && ['WATER', 'SOFT_DRINK', 'JUICE', 'LOCAL_BEVERAGE', 'ALCOHOLIC'].includes(r.category),
  );

  const lineItemQuantity = new Map<string, number>();
  for (const li of breakdown?.drinkLineItems ?? []) {
    lineItemQuantity.set(li.foodBeverageRateId, li.quantityPerPerson);
  }

  // DR-131: same Day-Template-derived accommodation/restaurant/activities as
  // the package flow, sourced from this booking's linked customized package
  // if one exists yet.
  const hotelDayCount = templateDays.filter((d) => d.hotelId).length;
  const restaurantDayCount = templateDays.filter((d) => d.restaurantId).length;
  const activityAssignmentCount = templateDays.reduce((sum, d) => sum + d.activityIds.length, 0);
  const hasCustomizedPackage = booking.customizedPackageId != null;

  const addonsTotalMinor = addons.reduce((sum, a) => sum + a.priceMinor, 0);
  const addonsCurrency = addons[0]?.currency ?? null;
  const defaultNights = breakdown?.nights ?? 1;
  const action = saveBookingCostBreakdownAction.bind(null, bookingId);

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <PageHeader eyebrow={t('eyebrow', { ref: booking.bookingReference })} title={t('title')} />
        <p className="mt-1 text-sm text-mist">
          <BackLink href={`/staff/bookings/${bookingId}`}>{t('backToBooking')}</BackLink>
        </p>
      </div>

      {error && <Alert tone="error">{t('saveError', { detail: detail || t('pleaseTryAgain') })}</Alert>}

      <Card>
        <p className="text-xs text-mist">{t('addonsAlreadySelected')}</p>
        <p className="text-sm font-semibold text-navy">
          {addons.length === 0
            ? t('noneYet')
            : t('addonsAcrossCount', {
                amount: format(money(addonsTotalMinor, addonsCurrency as NonNullable<typeof addonsCurrency>)),
                count: addons.length,
              })}
        </p>
        {breakdown && breakdown.addonsTotalMinor !== addonsTotalMinor && (
          <p className="mt-1 text-xs text-amber">
            {t('addonsChangedWarning', { amount: format(money(breakdown.addonsTotalMinor, breakdown.currency)) })}
          </p>
        )}
      </Card>

      {breakdown && (
        <Card className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs text-mist">{t('accommodation')}</p>
            <p className="text-sm font-semibold text-navy">{formatOrPending(breakdown.computedAccommodationMinor, breakdown.currency)}</p>
          </div>
          <div>
            <p className="text-xs text-mist">{t('restaurantCosts')}</p>
            <p className="text-sm font-semibold text-navy">{formatOrPending(breakdown.computedRestaurantMinor, breakdown.currency)}</p>
          </div>
          <div>
            <p className="text-xs text-mist">{t('activityFees')}</p>
            <p className="text-sm font-semibold text-navy">{formatOrPending(breakdown.computedActivitiesMinor, breakdown.currency)}</p>
          </div>
          <div>
            <p className="text-xs text-mist">{t('baseCost')}</p>
            <p className="text-sm font-semibold text-navy">{formatOrPending(breakdown.computedBaseCostMinor, breakdown.currency)}</p>
          </div>
          <div>
            <p className="text-xs text-mist">{t('sellingPrice')}</p>
            <p className="text-sm font-semibold text-navy">{formatOrPending(breakdown.computedSellingPriceMinor, breakdown.currency)}</p>
          </div>
          <div>
            <p className="text-xs text-mist">{t('suggestedTotal')}</p>
            <p className="text-lg font-semibold text-navy">
              {breakdown.suggestedTotalMinor != null ? format(money(breakdown.suggestedTotalMinor, breakdown.currency)) : '—'}
            </p>
          </div>
          {breakdown.overridePriceMinor != null && (
            <div className="col-span-full">
              <p className="text-xs text-amber">
                {t('manuallyOverridden', {
                  amount: format(money(breakdown.overridePriceMinor, breakdown.currency)),
                  reason: breakdown.overrideReason ?? '',
                })}
              </p>
            </div>
          )}
        </Card>
      )}

      <form action={action} className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <FormField label={t('guestsFromRequest')} htmlFor="seatsDisplay">
            <input id="seatsDisplay" value={booking.seats} disabled className="w-full rounded-survey border border-rule bg-bone px-3 py-2 text-mist" />
          </FormField>
          <FormField label={t('nights')} htmlFor="nights">
            <input name="nights" type="number" min={0} required defaultValue={defaultNights} className="w-full rounded-survey border border-rule px-3 py-2" />
          </FormField>
        </div>

        <div>
          <p className="eyebrow text-mist">{t('staffCosts')}</p>
          <p className="mt-1 text-xs text-mist">{t('ratesResolvedNotice', { country: tCountries(country) })}</p>
          <div className="mt-2 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <FormField label={t('driverDays')} htmlFor="driverDays">
              <input name="driverDays" type="number" min={0} defaultValue={breakdown?.driverDays ?? defaultNights} className="w-full rounded-survey border border-rule px-3 py-2" />
            </FormField>
            <FormField label={t('guideDays')} htmlFor="guideDays">
              <input name="guideDays" type="number" min={0} defaultValue={breakdown?.guideDays ?? defaultNights} className="w-full rounded-survey border border-rule px-3 py-2" />
            </FormField>
          </div>
        </div>

        {!hasCustomizedPackage && (
          <Alert tone="info">{t('noCustomizedPackageYet')}</Alert>
        )}

        <div>
          <p className="eyebrow text-mist">{t('accommodation')}</p>
          <p className="mt-1 text-xs text-mist">{t('derivedFromDayPlan', { count: hotelDayCount })}</p>
        </div>

        <div>
          <p className="eyebrow text-mist">{t('restaurantCosts')}</p>
          <p className="mt-1 text-xs text-mist">{t('derivedFromDayPlan', { count: restaurantDayCount })}</p>
        </div>

        <div>
          <p className="eyebrow text-mist">{t('activityFees')}</p>
          <p className="mt-1 text-xs text-mist">{t('derivedFromDayPlanActivities', { count: activityAssignmentCount })}</p>
        </div>

        {drinkRates.length > 0 && (
          <div>
            <p className="eyebrow text-mist">{t('drinks')}</p>
            <div className="mt-2 grid grid-cols-2 gap-4 sm:grid-cols-3">
              {drinkRates.map((r) => (
                <FormField key={r.id} label={`${r.category} (${format(money(r.perUnitMinor, r.currency))})`} htmlFor={`lineItem_food_${r.id}`} optional>
                  <input
                    name={`lineItem_food_${r.id}`}
                    type="number"
                    min={0}
                    defaultValue={lineItemQuantity.get(r.id) ?? ''}
                    className="w-full rounded-survey border border-rule px-3 py-2"
                  />
                </FormField>
              ))}
            </div>
          </div>
        )}

        <div>
          <p className="eyebrow text-mist">{t('transportation')}</p>
          <div className="mt-2 grid grid-cols-2 gap-4">
            <FormField label={t('transportRate')} htmlFor="transportRateId" optional>
              <Select name="transportRateId" defaultValue={breakdown?.transportRateId ?? ''}>
                <option value="">{t('none')}</option>
                {countryTransportRates.map((r) => (
                  <option key={r.id} value={r.id}>
                    {tCountries(r.country)} — {format(money(r.fuelEstimateMinor + r.tollFeesMinor + r.parkingFeesMinor + r.vehicleOperatingCostMinor, r.currency))}{t('perDay')}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label={t('transportDays')} htmlFor="transportDays">
              <input name="transportDays" type="number" min={0} defaultValue={breakdown?.transportDays ?? defaultNights} className="w-full rounded-survey border border-rule px-3 py-2" />
            </FormField>
          </div>
        </div>

        <div>
          <p className="eyebrow text-mist">{t('immigrationVisaCosts')}</p>
          <div className="mt-2 flex items-center gap-3">
            <input type="checkbox" name="requiresVisa" id="requiresVisa" defaultChecked={breakdown?.requiresVisa ?? false} className="h-4 w-4" />
            <label htmlFor="requiresVisa" className="text-sm">
              {t('requiresVisaLabel')}
            </label>
          </div>
          {countryImmigrationRates.length > 0 && (
            <div className="mt-2">
              <FormField label={t('immigrationCostRate')} htmlFor="immigrationCostRateId" optional>
                <Select name="immigrationCostRateId" defaultValue={breakdown?.immigrationCostRateId ?? ''}>
                  <option value="">{t('none')}</option>
                  {countryImmigrationRates.map((r) => (
                    <option key={r.id} value={r.id}>
                      {tCountries(r.country)} —{' '}
                      {format(money(r.visaFeeMinor + r.processingFeeMinor + r.invitationLetterFeeMinor + r.borderPermitFeeMinor, r.currency))}
                      {t('perPerson')}
                    </option>
                  ))}
                </Select>
              </FormField>
            </div>
          )}
        </div>

        <div>
          <p className="eyebrow text-mist">{t('adminCosts')}</p>
          <p className="mt-1 text-xs text-mist">{t('ratesResolvedNotice', { country: tCountries(country) })}</p>
          <div className="mt-2 grid grid-cols-2 gap-4">
            <FormField label={t('adminDays')} htmlFor="adminDays" optional>
              <input name="adminDays" type="number" min={0} defaultValue={breakdown?.adminDays ?? 0} className="w-full rounded-survey border border-rule px-3 py-2" />
            </FormField>
            <FormField label={t('adminCostBasisLabel')} htmlFor="adminCostBasis">
              <Select name="adminCostBasis" defaultValue={breakdown?.adminCostBasis ?? 'PER_GROUP'}>
                <option value="PER_GROUP">{t('basisPerGroup')}</option>
                <option value="PER_PERSON">{t('basisPerPerson')}</option>
              </Select>
            </FormField>
          </div>
        </div>

        <div>
          <p className="eyebrow text-mist">{t('agencyMargin')}</p>
          <FormField label={t('marginPercent')} htmlFor="agencyMarginPercent">
            <input
              name="agencyMarginPercent"
              type="number"
              step="0.01"
              min="0"
              required
              defaultValue={breakdown ? (breakdown.agencyMarginBp / 100).toFixed(2) : '20'}
              className="w-40 rounded-survey border border-rule px-3 py-2"
            />
          </FormField>
        </div>

        <div>
          <div className="survey-rule mb-4" />
          <p className="eyebrow text-mist">{t('overrideOptional')}</p>
          <p className="mt-1 text-xs text-mist">{t('overrideNotice')}</p>
          <div className="mt-2 grid grid-cols-2 gap-4">
            <FormField label={t('overrideTotalPrice')} htmlFor="overridePriceMinor" optional>
              <input
                name="overridePriceMinor"
                type="number"
                step="0.01"
                min="0"
                defaultValue={breakdown?.overridePriceMinor != null ? (breakdown.overridePriceMinor / 100).toFixed(2) : ''}
                className="w-full rounded-survey border border-rule px-3 py-2"
              />
            </FormField>
            <FormField label={t('reason')} htmlFor="overrideReason" optional>
              <input name="overrideReason" defaultValue={breakdown?.overrideReason ?? ''} className="w-full rounded-survey border border-rule px-3 py-2" />
            </FormField>
          </div>
        </div>

        <SubmitButton pendingLabel={t('saving')}>{t('saveCostBreakdown')}</SubmitButton>
      </form>
    </div>
  );
}

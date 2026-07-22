import { notFound } from 'next/navigation';
import { requireStaffContext } from '@lib/staff-guard';
import { catalogService } from '@modules/catalog';
import { financeService } from '@modules/finance';
import { BackLink } from '@/components/ui/BackLink';
import { Card } from '@/components/ui/Card';
import { FormField } from '@/components/ui/FormField';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/Select';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { format, formatOrPending, money } from '@lib/money';
import { saveCostBreakdownAction } from './actions';

interface Props {
  params: Promise<{ packageId: string }>;
}

export default async function CostBreakdownPage({ params }: Props) {
  const { packageId } = await params;
  const ctx = await requireStaffContext('catalog.write');

  let pkg;
  try {
    pkg = await catalogService.getPackage(ctx, packageId);
  } catch {
    notFound();
  }

  const [breakdown, hotelRates, transportRates, immigrationCostRates, foodBeverageRates, activityFees] = await Promise.all([
    financeService.getCostBreakdown(ctx, packageId),
    financeService.listHotelRates(ctx),
    financeService.listTransportRates(ctx),
    financeService.listImmigrationCostRates(ctx),
    financeService.listFoodBeverageRates(ctx),
    financeService.listActivityFees(ctx),
  ]);

  const countryHotelRates = hotelRates.filter((r) => r.country === pkg.country);
  const countryTransportRates = transportRates.filter((r) => r.country === pkg.country);
  const countryImmigrationRates = immigrationCostRates.filter((r) => r.country === pkg.country);
  const drinkRates = foodBeverageRates.filter(
    (r) => r.country === pkg.country && ['WATER', 'SOFT_DRINK', 'JUICE', 'LOCAL_BEVERAGE', 'ALCOHOLIC'].includes(r.category),
  );
  const countryActivityFees = activityFees.filter((r) => r.country === pkg.country);

  const lineItemQuantity = new Map<string, number>();
  for (const li of breakdown?.lineItems ?? []) {
    if (li.foodBeverageRateId) lineItemQuantity.set(`food_${li.foodBeverageRateId}`, li.quantityPerPerson);
    if (li.activityFeeId) lineItemQuantity.set(`activity_${li.activityFeeId}`, li.quantityPerPerson);
  }

  const defaultNights = breakdown?.nights ?? pkg.durationDays ?? 1;
  const action = saveCostBreakdownAction.bind(null, packageId);

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <PageHeader eyebrow={`Packages · ${pkg.packageReference}`} title={`${pkg.title} — Cost breakdown`} />
        <p className="mt-1 text-sm text-mist">
          <BackLink href={`/staff/packages/${packageId}`}>back to package</BackLink>
        </p>
      </div>

      {breakdown && (
        <Card className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs text-mist">Base cost (whole group)</p>
            <p className="text-sm font-semibold text-navy">{formatOrPending(breakdown.computedBaseCostMinor, breakdown.currency)}</p>
          </div>
          <div>
            <p className="text-xs text-mist">Selling price (whole group)</p>
            <p className="text-sm font-semibold text-navy">{formatOrPending(breakdown.computedSellingPriceMinor, breakdown.currency)}</p>
          </div>
          <div>
            <p className="text-xs text-mist">Current price per seat</p>
            <p className="text-lg font-semibold text-navy">{formatOrPending(pkg.priceMinor, pkg.currency)}</p>
          </div>
          {breakdown.overridePriceMinor != null && (
            <div className="col-span-full">
              <p className="text-xs text-amber">
                Manually overridden ({format(money(breakdown.overridePriceMinor, breakdown.currency))}) -- reason on file: &ldquo;
                {breakdown.overrideReason}&rdquo;
              </p>
            </div>
          )}
        </Card>
      )}

      <form action={action} className="space-y-6">
        <input type="hidden" name="currency" value={pkg.currency} />

        <div className="grid grid-cols-2 gap-4">
          <FormField label="Reference group size" htmlFor="referenceGroupSize">
            <input
              name="referenceGroupSize"
              type="number"
              min={1}
              required
              defaultValue={breakdown?.referenceGroupSize ?? 10}
              className="w-full rounded-survey border border-rule px-3 py-2"
            />
          </FormField>
          <FormField label="Nights" htmlFor="nights">
            <input name="nights" type="number" min={0} required defaultValue={defaultNights} className="w-full rounded-survey border border-rule px-3 py-2" />
          </FormField>
        </div>

        <div>
          <p className="eyebrow text-mist">Staff Costs</p>
          <p className="mt-1 text-xs text-mist">
            Rates are resolved automatically for {pkg.country} -- configure them under Operational Rates.
          </p>
          <div className="mt-2 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <FormField label="Driver days" htmlFor="driverDays">
              <input name="driverDays" type="number" min={0} defaultValue={breakdown?.driverDays ?? defaultNights} className="w-full rounded-survey border border-rule px-3 py-2" />
            </FormField>
            <FormField label="Guide days" htmlFor="guideDays">
              <input name="guideDays" type="number" min={0} defaultValue={breakdown?.guideDays ?? defaultNights} className="w-full rounded-survey border border-rule px-3 py-2" />
            </FormField>
            <FormField label="Photographer days" htmlFor="photographerDays" optional>
              <input name="photographerDays" type="number" min={0} defaultValue={breakdown?.photographerDays ?? 0} className="w-full rounded-survey border border-rule px-3 py-2" />
            </FormField>
            <FormField label="Videographer days" htmlFor="videographerDays" optional>
              <input name="videographerDays" type="number" min={0} defaultValue={breakdown?.videographerDays ?? 0} className="w-full rounded-survey border border-rule px-3 py-2" />
            </FormField>
          </div>
        </div>

        <div>
          <p className="eyebrow text-mist">Accommodation</p>
          <div className="mt-2 grid grid-cols-2 gap-4">
            <FormField label="Hotel / room category" htmlFor="hotelRateId" optional>
              <Select name="hotelRateId" defaultValue={breakdown?.hotelRateId ?? ''}>
                <option value="">None</option>
                {countryHotelRates.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.roomCategory} — {format(money(r.nightlyRateMinor, r.currency))}/night
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Rooms needed" htmlFor="roomsNeeded">
              <input name="roomsNeeded" type="number" min={1} defaultValue={breakdown?.roomsNeeded ?? 1} className="w-full rounded-survey border border-rule px-3 py-2" />
            </FormField>
          </div>
        </div>

        <div>
          <p className="eyebrow text-mist">Restaurant Costs (per person)</p>
          <div className="mt-2 grid grid-cols-3 gap-4">
            <FormField label="Breakfasts" htmlFor="breakfastCount">
              <input name="breakfastCount" type="number" min={0} defaultValue={breakdown?.breakfastCount ?? defaultNights} className="w-full rounded-survey border border-rule px-3 py-2" />
            </FormField>
            <FormField label="Lunches" htmlFor="lunchCount">
              <input name="lunchCount" type="number" min={0} defaultValue={breakdown?.lunchCount ?? defaultNights} className="w-full rounded-survey border border-rule px-3 py-2" />
            </FormField>
            <FormField label="Dinners" htmlFor="dinnerCount">
              <input name="dinnerCount" type="number" min={0} defaultValue={breakdown?.dinnerCount ?? defaultNights} className="w-full rounded-survey border border-rule px-3 py-2" />
            </FormField>
          </div>
        </div>

        {drinkRates.length > 0 && (
          <div>
            <p className="eyebrow text-mist">Drinks (quantity per person, leave blank to skip)</p>
            <div className="mt-2 grid grid-cols-2 gap-4 sm:grid-cols-3">
              {drinkRates.map((r) => (
                <FormField key={r.id} label={`${r.category} (${format(money(r.perUnitMinor, r.currency))})`} htmlFor={`lineItem_food_${r.id}`} optional>
                  <input
                    name={`lineItem_food_${r.id}`}
                    type="number"
                    min={0}
                    defaultValue={lineItemQuantity.get(`food_${r.id}`) ?? ''}
                    className="w-full rounded-survey border border-rule px-3 py-2"
                  />
                </FormField>
              ))}
            </div>
          </div>
        )}

        <div>
          <p className="eyebrow text-mist">Transportation</p>
          <div className="mt-2 grid grid-cols-2 gap-4">
            <FormField label="Transport rate" htmlFor="transportRateId" optional>
              <Select name="transportRateId" defaultValue={breakdown?.transportRateId ?? ''}>
                <option value="">None</option>
                {countryTransportRates.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.country} — {format(money(r.fuelEstimateMinor + r.tollFeesMinor + r.parkingFeesMinor + r.vehicleOperatingCostMinor, r.currency))}/day
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Transport days" htmlFor="transportDays">
              <input name="transportDays" type="number" min={0} defaultValue={breakdown?.transportDays ?? defaultNights} className="w-full rounded-survey border border-rule px-3 py-2" />
            </FormField>
          </div>
        </div>

        {countryActivityFees.length > 0 && (
          <div>
            <p className="eyebrow text-mist">Activity Fees (quantity per person, leave blank to skip)</p>
            <div className="mt-2 grid grid-cols-2 gap-4 sm:grid-cols-3">
              {countryActivityFees.map((r) => (
                <FormField key={r.id} label={`${r.name} (${format(money(r.feeMinor, r.currency))})`} htmlFor={`lineItem_activity_${r.id}`} optional>
                  <input
                    name={`lineItem_activity_${r.id}`}
                    type="number"
                    min={0}
                    defaultValue={lineItemQuantity.get(`activity_${r.id}`) ?? ''}
                    className="w-full rounded-survey border border-rule px-3 py-2"
                  />
                </FormField>
              ))}
            </div>
          </div>
        )}

        <div>
          <p className="eyebrow text-mist">Immigration / Visa Costs</p>
          <div className="mt-2 flex items-center gap-3">
            <input type="checkbox" name="requiresVisa" id="requiresVisa" defaultChecked={breakdown?.requiresVisa ?? false} className="h-4 w-4" />
            <label htmlFor="requiresVisa" className="text-sm">
              This package requires a visa
            </label>
          </div>
          {countryImmigrationRates.length > 0 && (
            <div className="mt-2">
              <FormField label="Immigration cost rate" htmlFor="immigrationCostRateId" optional>
                <Select name="immigrationCostRateId" defaultValue={breakdown?.immigrationCostRateId ?? ''}>
                  <option value="">None</option>
                  {countryImmigrationRates.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.country} —{' '}
                      {format(money(r.visaFeeMinor + r.processingFeeMinor + r.invitationLetterFeeMinor + r.borderPermitFeeMinor, r.currency))}
                      /person
                    </option>
                  ))}
                </Select>
              </FormField>
            </div>
          )}
        </div>

        <div>
          <p className="eyebrow text-mist">Agency Margin</p>
          <FormField label="Margin (%)" htmlFor="agencyMarginPercent">
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
          <p className="eyebrow text-mist">Override (optional)</p>
          <p className="mt-1 text-xs text-mist">
            Leave blank to use the computed price. Setting an override requires a reason and is recorded in the audit
            log.
          </p>
          <div className="mt-2 grid grid-cols-2 gap-4">
            <FormField label="Override price per seat" htmlFor="overridePriceMinor" optional>
              <input
                name="overridePriceMinor"
                type="number"
                step="0.01"
                min="0"
                defaultValue={breakdown?.overridePriceMinor != null ? (breakdown.overridePriceMinor / 100).toFixed(2) : ''}
                className="w-full rounded-survey border border-rule px-3 py-2"
              />
            </FormField>
            <FormField label="Reason" htmlFor="overrideReason" optional>
              <input name="overrideReason" defaultValue={breakdown?.overrideReason ?? ''} className="w-full rounded-survey border border-rule px-3 py-2" />
            </FormField>
          </div>
        </div>

        <SubmitButton pendingLabel="Saving…">Save cost breakdown</SubmitButton>
      </form>
    </div>
  );
}

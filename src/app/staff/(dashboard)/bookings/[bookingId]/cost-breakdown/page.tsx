import { notFound } from 'next/navigation';
import { requireStaffContext } from '@lib/staff-guard';
import { bookingService } from '@modules/booking';
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

  const [breakdown, addons, hotelRates, transportRates, immigrationCostRates, foodBeverageRates, activityFees] = await Promise.all([
    financeService.getBookingCostBreakdown(ctx, bookingId),
    bookingService.listAddons(ctx, bookingId),
    financeService.listHotelRates(ctx),
    financeService.listTransportRates(ctx),
    financeService.listImmigrationCostRates(ctx),
    financeService.listFoodBeverageRates(ctx),
    financeService.listActivityFees(ctx),
  ]);

  const countryHotelRates = hotelRates.filter((r) => r.country === country);
  const countryTransportRates = transportRates.filter((r) => r.country === country);
  const countryImmigrationRates = immigrationCostRates.filter((r) => r.country === country);
  const drinkRates = foodBeverageRates.filter(
    (r) => r.country === country && ['WATER', 'SOFT_DRINK', 'JUICE', 'LOCAL_BEVERAGE', 'ALCOHOLIC'].includes(r.category),
  );
  const countryActivityFees = activityFees.filter((r) => r.country === country);

  const lineItemQuantity = new Map<string, number>();
  for (const li of breakdown?.lineItems ?? []) {
    if (li.foodBeverageRateId) lineItemQuantity.set(`food_${li.foodBeverageRateId}`, li.quantityPerPerson);
    if (li.activityFeeId) lineItemQuantity.set(`activity_${li.activityFeeId}`, li.quantityPerPerson);
  }

  const addonsTotalMinor = addons.reduce((sum, a) => sum + a.priceMinor, 0);
  const addonsCurrency = addons[0]?.currency ?? null;
  const defaultNights = breakdown?.nights ?? 1;
  const action = saveBookingCostBreakdownAction.bind(null, bookingId);

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <PageHeader eyebrow={`Bookings · ${booking.bookingReference}`} title="Cost breakdown" />
        <p className="mt-1 text-sm text-mist">
          <BackLink href={`/staff/bookings/${bookingId}`}>back to booking</BackLink>
        </p>
      </div>

      {error && <Alert tone="error">Could not save this cost breakdown: {detail || 'please try again.'}</Alert>}

      <Card>
        <p className="text-xs text-mist">Add-ons already selected</p>
        <p className="text-sm font-semibold text-navy">
          {addons.length === 0 ? 'None yet' : `${format(money(addonsTotalMinor, addonsCurrency as NonNullable<typeof addonsCurrency>))} across ${addons.length} add-on${addons.length === 1 ? '' : 's'}`}
        </p>
        {breakdown && breakdown.addonsTotalMinor !== addonsTotalMinor && (
          <p className="mt-1 text-xs text-amber">
            Add-ons have changed since this breakdown was last saved (was{' '}
            {format(money(breakdown.addonsTotalMinor, breakdown.currency))}) -- resave below to refresh the suggested
            total.
          </p>
        )}
      </Card>

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
            <p className="text-xs text-mist">Suggested total (incl. add-ons)</p>
            <p className="text-lg font-semibold text-navy">
              {breakdown.suggestedTotalMinor != null ? format(money(breakdown.suggestedTotalMinor, breakdown.currency)) : '—'}
            </p>
          </div>
          {breakdown.overridePriceMinor != null && (
            <div className="col-span-full">
              <p className="text-xs text-amber">
                Manually overridden ({format(money(breakdown.overridePriceMinor, breakdown.currency))}) -- reason on
                file: &ldquo;{breakdown.overrideReason}&rdquo;
              </p>
            </div>
          )}
        </Card>
      )}

      <form action={action} className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Guests (from the request)" htmlFor="seatsDisplay">
            <input id="seatsDisplay" value={booking.seats} disabled className="w-full rounded-survey border border-rule bg-bone px-3 py-2 text-mist" />
          </FormField>
          <FormField label="Nights" htmlFor="nights">
            <input name="nights" type="number" min={0} required defaultValue={defaultNights} className="w-full rounded-survey border border-rule px-3 py-2" />
          </FormField>
        </div>

        <div>
          <p className="eyebrow text-mist">Staff Costs</p>
          <p className="mt-1 text-xs text-mist">Rates are resolved automatically for {country} -- configure them under Operational Rates.</p>
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
              This trip requires a visa
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
            Leave blank to use the computed total (base cost + margin + already-selected add-ons). Setting an override
            requires a reason and is recorded in the audit log.
          </p>
          <div className="mt-2 grid grid-cols-2 gap-4">
            <FormField label="Override total price" htmlFor="overridePriceMinor" optional>
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

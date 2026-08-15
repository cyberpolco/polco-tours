import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { requireStaffContext } from '@lib/staff-guard';
import { OPERATING_COUNTRY_CODES } from '@lib/country-codes';
import { can } from '@lib/rbac';
import { bookingService } from '@modules/booking';
import { catalogService, isPublishedStatus } from '@modules/catalog';
import { itineraryService } from '@modules/itinerary';
import { Alert } from '@/components/ui/Alert';
import { BackLink } from '@/components/ui/BackLink';
import { Badge } from '@/components/ui/Badge';
import { FormField } from '@/components/ui/FormField';
import { LinkButton } from '@/components/ui/Button';
import { MultiSearchableSelect } from '@/components/ui/MultiSearchableSelect';
import { PageHeader } from '@/components/ui/PageHeader';
import { SearchableSelect, type SearchableOption } from '@/components/ui/SearchableSelect';
import { Select } from '@/components/ui/Select';
import { SelectableCard } from '@/components/ui/SelectableCard';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { formatOrPending } from '@lib/money';
import { PACKAGE_STATUS_TONE } from '@lib/status-tones';
import {
  addTemplateDayAction,
  archivePackageAction,
  deletePackageAction,
  duplicatePackageAction,
  removeTemplateDayAction,
  updatePackageAction,
  updateTemplateDayAction,
} from './actions';

const PACKAGE_TAGS = ['WILDLIFE', 'ADVENTURE', 'RELAXATION', 'FAMILY', 'CULTURE', 'LUXURY', 'BUDGET'] as const;
const COUNTRY_FLAGS: Record<string, string> = { NA: '🇳🇦', CD: '🇨🇩', ZM: '🇿🇲', ZW: '🇿🇼' };

interface Props {
  params: Promise<{ packageId: string }>;
  searchParams: Promise<{ error?: string; detail?: string }>;
}

export default async function PackageDetailPage({ params, searchParams }: Props) {
  const { packageId } = await params;
  const { error, detail } = await searchParams;
  const ctx = await requireStaffContext('catalog.read');

  let pkg;
  try {
    pkg = await catalogService.getPackage(ctx, packageId);
  } catch {
    notFound();
  }
  const templateDays = await catalogService.listTemplateDays(ctx, packageId);
  // DR-108: reverse direction of Booking.customizedPackageId -- a package
  // created from a plan-my-trip request links back to it. can()-guarded
  // since not every catalog.read holder is guaranteed booking.read too.
  const sourceBooking = can(ctx, 'booking.read') ? await bookingService.getByCustomizedPackageId(ctx, packageId) : null;
  const tCountries = await getTranslations('Countries');
  // DR-116: the day-plan Activities picker (and its read-only chip display)
  // reuses itinerary's staff-managed Site > Activities reference list.
  // DR-119: same treatment for Hotels/Restaurants (single-select per day).
  const [activities, sites, hotels, restaurants] = await Promise.all([
    itineraryService.listActivities(ctx),
    itineraryService.listSites(ctx),
    itineraryService.listHotels(ctx),
    itineraryService.listRestaurants(ctx),
  ]);
  const siteById = new Map(sites.map((s) => [s.id, s]));
  const activityById = new Map(activities.map((a) => [a.id, a]));
  const activityOptions: SearchableOption[] = activities.map((a) => {
    const site = siteById.get(a.siteId);
    return {
      value: a.id,
      label: site ? `${a.name} — ${site.name}` : a.name,
      searchText: `${a.name} ${site?.name ?? ''}`.toLowerCase(),
    };
  });
  const hotelById = new Map(hotels.map((h) => [h.id, h]));
  const hotelOptions: SearchableOption[] = hotels.map((h) => ({
    value: h.id,
    label: `${h.name} (${tCountries(h.country)})`,
    searchText: `${h.name} ${h.country}`.toLowerCase(),
  }));
  const restaurantById = new Map(restaurants.map((r) => [r.id, r]));
  const restaurantOptions: SearchableOption[] = restaurants.map((r) => ({
    value: r.id,
    label: `${r.name} (${tCountries(r.country)})`,
    searchText: `${r.name} ${r.country}`.toLowerCase(),
  }));
  const t = await getTranslations('StaffPackageDetail');
  const tPackageStatus = await getTranslations('PackageStatusLabel');
  const tTags = await getTranslations('TripTags');

  // DR-115: catalogService.updatePackage's DR-039 publish gates (no
  // price/duration yet) throw a real, expected ApiError -- surfaced here via
  // ?error=&detail= (see actions.ts) rather than crashing to Next's generic
  // error page. Same convention as departures/[departureId]/page.tsx.
  // validation-failed/internal cover DR-114's uploadPackageImage call, now
  // wrapped in the same try/catch as updatePackage.
  const ERROR_MESSAGES: Record<string, string> = {
    conflict: t('errorConflict'),
    'validation-failed': t('errorValidation'),
    internal: t('errorInternal'),
  };

  return (
    <div className="max-w-md">
      {/* DR-097: back to wherever this package actually lives right now --
          either published sub-status (DR-117) came from the Public list,
          everything else (DRAFT/ARCHIVED) from Customized. Reflects live
          status, not however the user happened to arrive here. */}
      <BackLink href={isPublishedStatus(pkg.status) ? '/staff/packages/public' : '/staff/packages/customized'}>
        {isPublishedStatus(pkg.status) ? t('backToPublic') : t('backToCustomized')}
      </BackLink>
      <div className="mt-4 flex items-center gap-3">
        <PageHeader eyebrow={t('eyebrow', { ref: pkg.packageReference })} title={pkg.title} />
        <Badge tone={PACKAGE_STATUS_TONE[pkg.status]}>{tPackageStatus(pkg.status)}</Badge>
      </div>
      {sourceBooking && (
        <p className="mt-1 text-sm">
          <LinkButton variant="secondary" href={`/staff/bookings/${sourceBooking.id}`}>
            {t('createdFromBooking', { ref: sourceBooking.bookingReference })}
          </LinkButton>
        </p>
      )}

      {error && (
        <div className="mt-4">
          <Alert tone="error">
            {ERROR_MESSAGES[error] ?? t('errorGeneric')}
            {detail ? ` (${detail})` : ''}
          </Alert>
        </div>
      )}

      <div className="mt-4 flex gap-3">
        <form action={duplicatePackageAction.bind(null, packageId)}>
          <SubmitButton variant="secondary" pendingLabel={t('duplicating')}>
            {t('duplicate')}
          </SubmitButton>
        </form>
        {pkg.status !== 'ARCHIVED' && (
          <form action={archivePackageAction.bind(null, packageId)}>
            <SubmitButton variant="secondary" pendingLabel={t('archiving')}>
              {t('archive')}
            </SubmitButton>
          </form>
        )}
        <form action={deletePackageAction.bind(null, packageId)}>
          <SubmitButton variant="secondary" pendingLabel={t('deleting')} confirmMessage={t('deleteConfirm')}>
            {t('delete')}
          </SubmitButton>
        </form>
      </div>

      <div className="mt-6 rounded-survey border border-rule p-4">
        <p className="text-xs text-mist">{t('pricePerSeat')}</p>
        <p className="text-lg font-semibold text-navy">{formatOrPending(pkg.priceMinor, pkg.currency, t('notYetPriced'))}</p>
        <p className="mt-1 text-xs text-mist">{t('priceComputedNotice')}</p>
        <LinkButton href={`/staff/packages/${packageId}/cost-breakdown`} variant="secondary" size="compact" className="mt-2">
          {t('manageCostBreakdown')}
        </LinkButton>
      </div>

      <form action={updatePackageAction.bind(null, packageId)} className="mt-6 space-y-4">
        <FormField label={t('title')} htmlFor="title">
          <input name="title" defaultValue={pkg.title} required className="w-full rounded-survey border border-rule px-3 py-2" />
        </FormField>
        <FormField label={t('description')} htmlFor="description">
          <textarea
            name="description"
            defaultValue={pkg.description}
            required
            rows={4}
            className="w-full rounded-survey border border-rule px-3 py-2"
          />
        </FormField>
        <FormField label={t('country')} htmlFor="country">
          <Select name="country" defaultValue={pkg.country} required>
            <option value="NA">🇳🇦 {tCountries('NA')}</option>
            <option value="CD">🇨🇩 {tCountries('CD')}</option>
            <option value="ZM">🇿🇲 {tCountries('ZM')}</option>
            <option value="ZW">🇿🇼 {tCountries('ZW')}</option>
          </Select>
        </FormField>
        {/* DR-114: the primary country above still drives tax/finance-rate
            resolution unchanged -- this just adds any OTHER countries a
            combo package also visits (display/filtering only). */}
        <div>
          <p className="mb-1 text-sm text-mist">{t('alsoVisits')}</p>
          <div className="flex flex-wrap gap-2">
            {OPERATING_COUNTRY_CODES.map((code) => (
              <SelectableCard
                key={code}
                type="checkbox"
                name="additionalCountries"
                value={code}
                defaultChecked={pkg.countries.includes(code)}
              >
                {COUNTRY_FLAGS[code]} {tCountries(code)}
              </SelectableCard>
            ))}
          </div>
        </div>
        <FormField label={t('currency')} htmlFor="currency">
          <Select name="currency" defaultValue={pkg.currency} required>
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
            <option value="NAD">NAD</option>
            <option value="CDF">CDF</option>
          </Select>
        </FormField>
        <FormField label={t('durationDays')} htmlFor="durationDays" optional>
          <input
            name="durationDays"
            type="number"
            min={1}
            defaultValue={pkg.durationDays ?? ''}
            className="w-full rounded-survey border border-rule px-3 py-2"
          />
        </FormField>
        {/* DR-114: staff upload a real file (catalogService.uploadPackageImage,
            Vercel Blob public) instead of pasting a URL -- selecting a new
            file replaces the current one; leaving it empty keeps the
            existing image (or none) unchanged. */}
        {pkg.imageUrl && (
          /* eslint-disable-next-line @next/next/no-img-element -- a
             staff-only settings-form thumbnail, not the guest-facing
             PackageImage component (next/image) this same URL renders
             through elsewhere. */
          <img src={pkg.imageUrl} alt={t('currentImageAlt')} className="h-24 w-40 rounded-survey object-cover" />
        )}
        <FormField label={t('image')} htmlFor="image" optional>
          <input
            name="image"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="w-full rounded-survey border border-rule px-3 py-2 file:mr-3 file:rounded-pill file:border-0 file:bg-navy file:px-3 file:py-1 file:text-sm file:text-bone"
          />
        </FormField>
        <p className="text-xs text-mist">{t('durationNotice')}</p>
        <div>
          <p className="mb-1 text-sm text-mist">{t('tags')}</p>
          <div className="flex flex-wrap gap-2">
            {PACKAGE_TAGS.map((tag) => (
              <SelectableCard key={tag} type="checkbox" name="tags" value={tag} defaultChecked={pkg.tags.includes(tag)}>
                {tTags(tag)}
              </SelectableCard>
            ))}
          </div>
        </div>
        <FormField label={t('status')} htmlFor="status">
          <Select name="status" defaultValue={pkg.status} required>
            <option value="DRAFT">{tPackageStatus('DRAFT')}</option>
            <option value="PUBLISHED_AVAILABLE">{tPackageStatus('PUBLISHED_AVAILABLE')}</option>
            <option value="PUBLISHED_UNAVAILABLE">{tPackageStatus('PUBLISHED_UNAVAILABLE')}</option>
            <option value="ARCHIVED">{tPackageStatus('ARCHIVED')}</option>
          </Select>
        </FormField>
        <SubmitButton>{t('saveChanges')}</SubmitButton>
      </form>

      <div className="mt-8">
        <div className="survey-rule mb-6" />
        <p className="eyebrow text-mist">{t('itineraryTemplate')}</p>
        <p className="mt-2 text-sm text-mist">{t('itineraryTemplateNotice')}</p>
        {templateDays.length === 0 ? (
          <p className="mt-3 text-sm text-mist">{t('noTemplateDaysYet')}</p>
        ) : (
          <div className="mt-4 space-y-3">
            {templateDays.map((day) => (
              <div key={day.id} className="rounded-survey border border-rule p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-navy">
                    {t('dayLabel', { number: day.dayNumber })}
                    {(day.departureTime || day.arrivalTime) && (
                      <span className="ml-2 font-normal text-mist">
                        {day.departureTime && t('depart', { time: day.departureTime })}
                        {day.departureTime && day.arrivalTime && ' · '}
                        {day.arrivalTime && t('arrive', { time: day.arrivalTime })}
                      </span>
                    )}
                  </p>
                  <form action={removeTemplateDayAction.bind(null, packageId, day.id)}>
                    <SubmitButton
                      variant="secondary"
                      size="compact"
                      pendingLabel={t('removing')}
                      confirmMessage={t('removeDayConfirm')}
                    >
                      {t('remove')}
                    </SubmitButton>
                  </form>
                </div>
                <dl className="mt-2 grid grid-cols-2 gap-2 text-sm text-mist">
                  {day.hotelId && (
                    <div>
                      <dt className="text-xs">{t('hotel')}</dt>
                      <dd>{hotelById.get(day.hotelId)?.name ?? '—'}</dd>
                    </div>
                  )}
                  {day.restaurantId && (
                    <div>
                      <dt className="text-xs">{t('restaurant')}</dt>
                      <dd>{restaurantById.get(day.restaurantId)?.name ?? '—'}</dd>
                    </div>
                  )}
                  {day.activities && (
                    <div className="col-span-2">
                      <dt className="text-xs">{t('activities')}</dt>
                      <dd>{day.activities}</dd>
                    </div>
                  )}
                  {day.activityIds.length > 0 && (
                    <div className="col-span-2">
                      <dt className="text-xs">{t('activitiesSelected')}</dt>
                      <dd className="flex flex-wrap gap-1">
                        {day.activityIds.map((id) => {
                          const activity = activityById.get(id);
                          const site = activity ? siteById.get(activity.siteId) : undefined;
                          return (
                            <Badge key={id} tone="neutral">
                              {activity ? (site ? `${activity.name} — ${site.name}` : activity.name) : id}
                            </Badge>
                          );
                        })}
                      </dd>
                    </div>
                  )}
                </dl>
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs text-forest">{t('editDay')}</summary>
                  <form action={updateTemplateDayAction.bind(null, packageId, day.id)} className="mt-3 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <FormField label={t('departureTimeLabel')} htmlFor={`dep-${day.id}`} optional>
                        <input
                          name="departureTime"
                          defaultValue={day.departureTime ?? ''}
                          placeholder="08:00"
                          className="w-full rounded-survey border border-rule px-3 py-2"
                        />
                      </FormField>
                      <FormField label={t('arrivalTimeLabel')} htmlFor={`arr-${day.id}`} optional>
                        <input
                          name="arrivalTime"
                          defaultValue={day.arrivalTime ?? ''}
                          placeholder="17:00"
                          className="w-full rounded-survey border border-rule px-3 py-2"
                        />
                      </FormField>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <FormField label={t('pickupLocation')} htmlFor={`pickup-${day.id}`} optional>
                        <input
                          name="pickupLocation"
                          defaultValue={day.pickupLocation ?? ''}
                          className="w-full rounded-survey border border-rule px-3 py-2"
                        />
                      </FormField>
                      <FormField label={t('dropoffLocation')} htmlFor={`dropoff-${day.id}`} optional>
                        <input
                          name="dropoffLocation"
                          defaultValue={day.dropoffLocation ?? ''}
                          className="w-full rounded-survey border border-rule px-3 py-2"
                        />
                      </FormField>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <FormField label={t('hotel')} htmlFor={`hotelId-${day.id}`} optional>
                        <SearchableSelect
                          id={`hotelId-${day.id}`}
                          name="hotelId"
                          options={hotelOptions}
                          defaultValue={day.hotelId ?? undefined}
                          placeholder={t('searchHotelsPlaceholder')}
                          emptyLabel={t('none')}
                        />
                      </FormField>
                      <FormField label={t('restaurant')} htmlFor={`restaurantId-${day.id}`} optional>
                        <SearchableSelect
                          id={`restaurantId-${day.id}`}
                          name="restaurantId"
                          options={restaurantOptions}
                          defaultValue={day.restaurantId ?? undefined}
                          placeholder={t('searchRestaurantsPlaceholder')}
                          emptyLabel={t('none')}
                        />
                      </FormField>
                    </div>
                    <FormField label={t('activitiesSelected')} htmlFor={`activityIds-${day.id}`} optional>
                      <MultiSearchableSelect
                        id={`activityIds-${day.id}`}
                        name="activityIds"
                        options={activityOptions}
                        defaultValues={day.activityIds}
                        placeholder={t('searchActivitiesPlaceholder')}
                      />
                    </FormField>
                    <FormField label={t('notes')} htmlFor={`notes-${day.id}`} optional>
                      <textarea
                        name="notes"
                        defaultValue={day.notes ?? ''}
                        rows={2}
                        className="w-full rounded-survey border border-rule px-3 py-2"
                      />
                    </FormField>
                    <SubmitButton variant="secondary" size="compact" pendingLabel={t('saving')}>
                      {t('saveDay')}
                    </SubmitButton>
                  </form>
                </details>
              </div>
            ))}
          </div>
        )}

        <details className="mt-6">
          <summary className="cursor-pointer text-sm text-forest">{t('addTemplateDay')}</summary>
          <form action={addTemplateDayAction.bind(null, packageId)} className="mt-4 space-y-3">
            <FormField label={t('dayNumber')} htmlFor="dayNumber">
              <input
                name="dayNumber"
                type="number"
                min={1}
                defaultValue={templateDays.length + 1}
                required
                className="w-full rounded-survey border border-rule px-3 py-2"
              />
            </FormField>
            <div className="grid grid-cols-2 gap-3">
              <FormField label={t('departureTimeLabel')} htmlFor="departureTime" optional>
                <input name="departureTime" placeholder="08:00" className="w-full rounded-survey border border-rule px-3 py-2" />
              </FormField>
              <FormField label={t('arrivalTimeLabel')} htmlFor="arrivalTime" optional>
                <input name="arrivalTime" placeholder="17:00" className="w-full rounded-survey border border-rule px-3 py-2" />
              </FormField>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FormField label={t('pickupLocation')} htmlFor="pickupLocation" optional>
                <input name="pickupLocation" className="w-full rounded-survey border border-rule px-3 py-2" />
              </FormField>
              <FormField label={t('dropoffLocation')} htmlFor="dropoffLocation" optional>
                <input name="dropoffLocation" className="w-full rounded-survey border border-rule px-3 py-2" />
              </FormField>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FormField label={t('hotel')} htmlFor="hotelId" optional>
                <SearchableSelect
                  id="hotelId"
                  name="hotelId"
                  options={hotelOptions}
                  placeholder={t('searchHotelsPlaceholder')}
                  emptyLabel={t('none')}
                />
              </FormField>
              <FormField label={t('restaurant')} htmlFor="restaurantId" optional>
                <SearchableSelect
                  id="restaurantId"
                  name="restaurantId"
                  options={restaurantOptions}
                  placeholder={t('searchRestaurantsPlaceholder')}
                  emptyLabel={t('none')}
                />
              </FormField>
            </div>
            <FormField label={t('activitiesSelected')} htmlFor="activityIds" optional>
              <MultiSearchableSelect
                id="activityIds"
                name="activityIds"
                options={activityOptions}
                placeholder={t('searchActivitiesPlaceholder')}
              />
            </FormField>
            <FormField label={t('notes')} htmlFor="notes" optional>
              <textarea name="notes" rows={2} className="w-full rounded-survey border border-rule px-3 py-2" />
            </FormField>
            <SubmitButton pendingLabel={t('adding')}>{t('addDay')}</SubmitButton>
          </form>
        </details>
      </div>
    </div>
  );
}

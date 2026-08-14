import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { requireStaffContext } from '@lib/staff-guard';
import { can } from '@lib/rbac';
import { bookingService } from '@modules/booking';
import { catalogService } from '@modules/catalog';
import { BackLink } from '@/components/ui/BackLink';
import { Badge } from '@/components/ui/Badge';
import { FormField } from '@/components/ui/FormField';
import { LinkButton } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
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

interface Props {
  params: Promise<{ packageId: string }>;
}

export default async function PackageDetailPage({ params }: Props) {
  const { packageId } = await params;
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
  const t = await getTranslations('StaffPackageDetail');
  const tPackageStatus = await getTranslations('PackageStatusLabel');
  const tTags = await getTranslations('TripTags');
  const tCountries = await getTranslations('Countries');

  return (
    <div className="max-w-md">
      {/* DR-097: back to wherever this package actually lives right now --
          PUBLISHED ones came from the Public list, everything else (DRAFT/
          ARCHIVED) from Customized. Reflects live status, not however the
          user happened to arrive here. */}
      <BackLink href={pkg.status === 'PUBLISHED' ? '/staff/packages/public' : '/staff/packages/customized'}>
        {pkg.status === 'PUBLISHED' ? t('backToPublic') : t('backToCustomized')}
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
        {/* DR-068: local asset path only -- see next.config.mjs, no remote
            image host is allowlisted. */}
        <FormField label={t('imageUrl')} htmlFor="imageUrl" optional>
          <input
            name="imageUrl"
            type="text"
            defaultValue={pkg.imageUrl ?? ''}
            placeholder="/images/packages/example.jpg"
            className="w-full rounded-survey border border-rule px-3 py-2"
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
            <option value="PUBLISHED">{tPackageStatus('PUBLISHED')}</option>
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
                  {day.plannedSites && (
                    <div className="col-span-2">
                      <dt className="text-xs">{t('plannedSites')}</dt>
                      <dd>{day.plannedSites}</dd>
                    </div>
                  )}
                  {day.activities && (
                    <div className="col-span-2">
                      <dt className="text-xs">{t('activities')}</dt>
                      <dd>{day.activities}</dd>
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
                    <FormField label={t('plannedSitesAttractions')} htmlFor={`sites-${day.id}`} optional>
                      <textarea
                        name="plannedSites"
                        defaultValue={day.plannedSites ?? ''}
                        rows={2}
                        className="w-full rounded-survey border border-rule px-3 py-2"
                      />
                    </FormField>
                    <FormField label={t('activities')} htmlFor={`activities-${day.id}`} optional>
                      <textarea
                        name="activities"
                        defaultValue={day.activities ?? ''}
                        rows={2}
                        className="w-full rounded-survey border border-rule px-3 py-2"
                      />
                    </FormField>
                    <FormField label={t('estimatedTravelMinutes')} htmlFor={`travel-${day.id}`} optional>
                      <input
                        name="estimatedTravelMinutes"
                        type="number"
                        min={0}
                        defaultValue={day.estimatedTravelMinutes ?? undefined}
                        className="w-full rounded-survey border border-rule px-3 py-2"
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
            <FormField label={t('plannedSitesAttractions')} htmlFor="plannedSites" optional>
              <textarea name="plannedSites" rows={2} className="w-full rounded-survey border border-rule px-3 py-2" />
            </FormField>
            <FormField label={t('activities')} htmlFor="activities" optional>
              <textarea name="activities" rows={2} className="w-full rounded-survey border border-rule px-3 py-2" />
            </FormField>
            <FormField label={t('estimatedTravelMinutes')} htmlFor="estimatedTravelMinutes" optional>
              <input name="estimatedTravelMinutes" type="number" min={0} className="w-full rounded-survey border border-rule px-3 py-2" />
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

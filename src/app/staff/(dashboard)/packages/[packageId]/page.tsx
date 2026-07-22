import { notFound } from 'next/navigation';
import { requireStaffContext } from '@lib/staff-guard';
import { catalogService } from '@modules/catalog';
import { Badge } from '@/components/ui/Badge';
import { FormField } from '@/components/ui/FormField';
import { LinkButton } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
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

  return (
    <div className="max-w-md">
      <div className="flex items-center gap-3">
        <PageHeader eyebrow={`Packages · ${pkg.packageReference}`} title={pkg.title} />
        <Badge tone={PACKAGE_STATUS_TONE[pkg.status]}>{pkg.status}</Badge>
      </div>

      <div className="mt-4 flex gap-3">
        <form action={duplicatePackageAction.bind(null, packageId)}>
          <SubmitButton variant="secondary" pendingLabel="Duplicating…">
            Duplicate
          </SubmitButton>
        </form>
        {pkg.status !== 'ARCHIVED' && (
          <form action={archivePackageAction.bind(null, packageId)}>
            <SubmitButton variant="secondary" pendingLabel="Archiving…">
              Archive
            </SubmitButton>
          </form>
        )}
        <form action={deletePackageAction.bind(null, packageId)}>
          <SubmitButton variant="secondary" pendingLabel="Deleting…">
            Delete
          </SubmitButton>
        </form>
      </div>

      <div className="mt-6 rounded-survey border border-rule p-4">
        <p className="text-xs text-mist">Price per seat</p>
        <p className="text-lg font-semibold text-navy">{formatOrPending(pkg.priceMinor, pkg.currency, 'Not yet priced')}</p>
        <p className="mt-1 text-xs text-mist">
          Computed by the finance module&rsquo;s cost breakdown (DR-039) -- no longer typed directly here.
        </p>
        <LinkButton href={`/staff/packages/${packageId}/cost-breakdown`} variant="secondary" size="compact" className="mt-2">
          Manage cost breakdown
        </LinkButton>
      </div>

      <form action={updatePackageAction.bind(null, packageId)} className="mt-6 space-y-4">
        <FormField label="Title" htmlFor="title">
          <input name="title" defaultValue={pkg.title} required className="w-full rounded-survey border border-rule px-3 py-2" />
        </FormField>
        <FormField label="Description" htmlFor="description">
          <textarea
            name="description"
            defaultValue={pkg.description}
            required
            rows={4}
            className="w-full rounded-survey border border-rule px-3 py-2"
          />
        </FormField>
        <FormField label="Country" htmlFor="country">
          <select name="country" defaultValue={pkg.country} required className="w-full rounded-survey border border-rule px-3 py-2">
            <option value="NA">🇳🇦 Namibia</option>
            <option value="CD">🇨🇩 DR Congo</option>
            <option value="ZM">🇿🇲 Zambia</option>
            <option value="ZW">🇿🇼 Zimbabwe</option>
          </select>
        </FormField>
        <FormField label="Currency" htmlFor="currency">
          <select name="currency" defaultValue={pkg.currency} required className="w-full rounded-survey border border-rule px-3 py-2">
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
            <option value="NAD">NAD</option>
            <option value="CDF">CDF</option>
          </select>
        </FormField>
        <FormField label="Duration (days)" htmlFor="durationDays" optional>
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
        <FormField label="Image URL" htmlFor="imageUrl" optional>
          <input
            name="imageUrl"
            type="text"
            defaultValue={pkg.imageUrl ?? ''}
            placeholder="/images/packages/example.jpg"
            className="w-full rounded-survey border border-rule px-3 py-2"
          />
        </FormField>
        <p className="text-xs text-mist">
          Trip length -- guests pick their own travel start date but not how many days the trip runs; a package
          needs this set (along with a price) before it can be booked.
        </p>
        <div>
          <p className="mb-1 text-sm text-mist">Tags</p>
          <div className="flex flex-wrap gap-2">
            {PACKAGE_TAGS.map((tag) => (
              <SelectableCard key={tag} type="checkbox" name="tags" value={tag} defaultChecked={pkg.tags.includes(tag)}>
                {tag}
              </SelectableCard>
            ))}
          </div>
        </div>
        <FormField label="Status" htmlFor="status">
          <select name="status" defaultValue={pkg.status} required className="w-full rounded-survey border border-rule px-3 py-2">
            <option value="DRAFT">DRAFT</option>
            <option value="PUBLISHED">PUBLISHED</option>
            <option value="ARCHIVED">ARCHIVED</option>
          </select>
        </FormField>
        <SubmitButton>Save changes</SubmitButton>
      </form>

      <div className="mt-8">
        <div className="survey-rule mb-6" />
        <p className="eyebrow text-mist">Itinerary template</p>
        <p className="mt-2 text-sm text-mist">
          A reusable day-by-day plan for this package -- copied onto a fresh Itinerary the moment one is created for
          a booking against it (real dates computed from that booking&rsquo;s own travel start date), so staff review
          and adjust an already-populated plan instead of starting from scratch every time.
        </p>
        {templateDays.length === 0 ? (
          <p className="mt-3 text-sm text-mist">No template days yet.</p>
        ) : (
          <div className="mt-4 space-y-3">
            {templateDays.map((day) => (
              <div key={day.id} className="rounded-survey border border-rule p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-navy">
                    Day {day.dayNumber}
                    {(day.departureTime || day.arrivalTime) && (
                      <span className="ml-2 font-normal text-mist">
                        {day.departureTime && `Depart ${day.departureTime}`}
                        {day.departureTime && day.arrivalTime && ' · '}
                        {day.arrivalTime && `Arrive ${day.arrivalTime}`}
                      </span>
                    )}
                  </p>
                  <form action={removeTemplateDayAction.bind(null, packageId, day.id)}>
                    <SubmitButton variant="secondary" size="compact" pendingLabel="Removing…">
                      Remove
                    </SubmitButton>
                  </form>
                </div>
                <dl className="mt-2 grid grid-cols-2 gap-2 text-sm text-mist">
                  {day.plannedSites && (
                    <div className="col-span-2">
                      <dt className="text-xs">Planned sites</dt>
                      <dd>{day.plannedSites}</dd>
                    </div>
                  )}
                  {day.activities && (
                    <div className="col-span-2">
                      <dt className="text-xs">Activities</dt>
                      <dd>{day.activities}</dd>
                    </div>
                  )}
                </dl>
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs text-forest">Edit day</summary>
                  <form action={updateTemplateDayAction.bind(null, packageId, day.id)} className="mt-3 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <FormField label="Departure time (HH:MM)" htmlFor={`dep-${day.id}`} optional>
                        <input
                          name="departureTime"
                          defaultValue={day.departureTime ?? ''}
                          placeholder="08:00"
                          className="w-full rounded-survey border border-rule px-3 py-2"
                        />
                      </FormField>
                      <FormField label="Arrival time (HH:MM)" htmlFor={`arr-${day.id}`} optional>
                        <input
                          name="arrivalTime"
                          defaultValue={day.arrivalTime ?? ''}
                          placeholder="17:00"
                          className="w-full rounded-survey border border-rule px-3 py-2"
                        />
                      </FormField>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <FormField label="Pickup location" htmlFor={`pickup-${day.id}`} optional>
                        <input
                          name="pickupLocation"
                          defaultValue={day.pickupLocation ?? ''}
                          className="w-full rounded-survey border border-rule px-3 py-2"
                        />
                      </FormField>
                      <FormField label="Drop-off location" htmlFor={`dropoff-${day.id}`} optional>
                        <input
                          name="dropoffLocation"
                          defaultValue={day.dropoffLocation ?? ''}
                          className="w-full rounded-survey border border-rule px-3 py-2"
                        />
                      </FormField>
                    </div>
                    <FormField label="Planned sites / attractions" htmlFor={`sites-${day.id}`} optional>
                      <textarea
                        name="plannedSites"
                        defaultValue={day.plannedSites ?? ''}
                        rows={2}
                        className="w-full rounded-survey border border-rule px-3 py-2"
                      />
                    </FormField>
                    <FormField label="Activities" htmlFor={`activities-${day.id}`} optional>
                      <textarea
                        name="activities"
                        defaultValue={day.activities ?? ''}
                        rows={2}
                        className="w-full rounded-survey border border-rule px-3 py-2"
                      />
                    </FormField>
                    <FormField label="Estimated travel (minutes)" htmlFor={`travel-${day.id}`} optional>
                      <input
                        name="estimatedTravelMinutes"
                        type="number"
                        min={0}
                        defaultValue={day.estimatedTravelMinutes ?? undefined}
                        className="w-full rounded-survey border border-rule px-3 py-2"
                      />
                    </FormField>
                    <FormField label="Notes" htmlFor={`notes-${day.id}`} optional>
                      <textarea
                        name="notes"
                        defaultValue={day.notes ?? ''}
                        rows={2}
                        className="w-full rounded-survey border border-rule px-3 py-2"
                      />
                    </FormField>
                    <SubmitButton variant="secondary" size="compact" pendingLabel="Saving…">
                      Save day
                    </SubmitButton>
                  </form>
                </details>
              </div>
            ))}
          </div>
        )}

        <details className="mt-6">
          <summary className="cursor-pointer text-sm text-forest">Add a template day</summary>
          <form action={addTemplateDayAction.bind(null, packageId)} className="mt-4 space-y-3">
            <FormField label="Day number" htmlFor="dayNumber">
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
              <FormField label="Departure time (HH:MM)" htmlFor="departureTime" optional>
                <input name="departureTime" placeholder="08:00" className="w-full rounded-survey border border-rule px-3 py-2" />
              </FormField>
              <FormField label="Arrival time (HH:MM)" htmlFor="arrivalTime" optional>
                <input name="arrivalTime" placeholder="17:00" className="w-full rounded-survey border border-rule px-3 py-2" />
              </FormField>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Pickup location" htmlFor="pickupLocation" optional>
                <input name="pickupLocation" className="w-full rounded-survey border border-rule px-3 py-2" />
              </FormField>
              <FormField label="Drop-off location" htmlFor="dropoffLocation" optional>
                <input name="dropoffLocation" className="w-full rounded-survey border border-rule px-3 py-2" />
              </FormField>
            </div>
            <FormField label="Planned sites / attractions" htmlFor="plannedSites" optional>
              <textarea name="plannedSites" rows={2} className="w-full rounded-survey border border-rule px-3 py-2" />
            </FormField>
            <FormField label="Activities" htmlFor="activities" optional>
              <textarea name="activities" rows={2} className="w-full rounded-survey border border-rule px-3 py-2" />
            </FormField>
            <FormField label="Estimated travel (minutes)" htmlFor="estimatedTravelMinutes" optional>
              <input name="estimatedTravelMinutes" type="number" min={0} className="w-full rounded-survey border border-rule px-3 py-2" />
            </FormField>
            <FormField label="Notes" htmlFor="notes" optional>
              <textarea name="notes" rows={2} className="w-full rounded-survey border border-rule px-3 py-2" />
            </FormField>
            <SubmitButton pendingLabel="Adding…">Add day</SubmitButton>
          </form>
        </details>
      </div>
    </div>
  );
}

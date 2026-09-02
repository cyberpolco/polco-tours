import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { requireStaffContext } from '@lib/staff-guard';
import { can } from '@lib/rbac';
import { bookingService, isBookingLocked } from '@modules/booking';
import { catalogService } from '@modules/catalog';
import { itineraryService, type HotelView, type ItineraryDaySiteView, type RestaurantView } from '@modules/itinerary';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { BackLink } from '@/components/ui/BackLink';
import { LinkButton } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { FormField } from '@/components/ui/FormField';
import { MapLocationPicker } from '@/components/ui/MapLocationPicker';
import { MultiSearchableSelect } from '@/components/ui/MultiSearchableSelect';
import { PageHeader } from '@/components/ui/PageHeader';
import { Reveal, RevealGroup } from '@/components/ui/Reveal';
import type { SearchableOption } from '@/components/ui/SearchableSelect';
import { Select } from '@/components/ui/Select';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { ITINERARY_STATUS_TONE } from '@lib/status-tones';
import {
  addDayAction,
  addDaySiteAction,
  approveItineraryAction,
  moveDaySiteAction,
  removeDayAction,
  removeDaySiteAction,
  sendBackToDraftAction,
  submitForReviewAction,
  updateDayAction,
  updateItineraryAction,
} from './actions';

interface Props {
  params: Promise<{ itineraryId: string }>;
}

function notNull<T>(v: T | null): v is T {
  return v !== null;
}

// Itinerary Management (DR-033) -- "the single operational reference for
// everyone involved in delivering the tour". Deliberately composes booking/
// catalog data directly here (same convention as every other staff detail
// page this session, e.g. DR-021's schedule page) rather than a shared
// cross-module service method. Vehicle/driver/guide assignment stays on the
// existing /staff/departures/{departureId} page (unchanged, DR-018/029) --
// linked from here rather than duplicated, since Assignment is keyed by
// Departure (shared across every booking on a PREDEFINED_PACKAGE departure),
// not by Itinerary/Booking.
//
// DR-083: hotel/restaurant assignment moved from an itinerary-wide list to
// per-day (ItineraryDay.hotelId/restaurantId) -- a real multi-lodge safari
// stays at a different place each night. Rating moved off this page
// entirely, onto /staff/hotels/[hotelId] and /staff/restaurants/[id].
export default async function ItineraryDetailPage({ params }: Props) {
  const { itineraryId } = await params;
  const ctx = await requireStaffContext('itinerary.read');

  let itinerary;
  try {
    itinerary = await itineraryService.getItinerary(ctx, itineraryId);
  } catch {
    notFound();
  }

  const canWrite = can(ctx, 'itinerary.write');
  const canApprove = can(ctx, 'itinerary.approve');

  // DR-058: a soft-deleted Booking isn't hard-deleted until the retention
  // purge, so this itinerary's own bookingId can point at one for up to 90
  // days -- bookingService.getById throws for it (previously impossible,
  // before soft-delete existed). The rest of this page uses `booking.*`
  // unguarded throughout, so -- same as the itinerary fetch above -- treat
  // a gone booking as a clean 404 rather than letting the exception
  // propagate into an unhandled server error.
  let booking;
  try {
    booking = await bookingService.getById(ctx, itinerary.bookingId);
  } catch {
    notFound();
  }

  const days = await itineraryService.listDays(ctx, itineraryId);
  const t = await getTranslations('StaffItineraryDetail');
  const tCommon = await getTranslations('Common');
  const tItineraryStatus = await getTranslations('ItineraryStatusLabel');
  const tBookingStatus = await getTranslations('BookingStatusLabel');
  const tCountries = await getTranslations('Countries');

  // DR-105: once the parent booking is COMPLETED/CANCELLED/REFUNDED, the
  // day/site edit forms and notes/emergency-contact form all go read-only --
  // the itinerary's own workflow buttons (submit/send-back/approve) stay as
  // they are, gated only on canWrite/canApprove, since they're unrelated to
  // this lock (out of scope, see DR-105).
  const bookingLocked = isBookingLocked(booking.status);
  const canEdit = canWrite && !bookingLocked;

  let travelDates = t('notScheduledYet');
  // Falls back to the TAILOR_MADE booking's own custom country when there's
  // no real departure/package yet -- feeds the "planned sites" datalist
  // below, scoped to wherever this trip actually is.
  let tripCountry: string | null = booking.customCountry;
  if (booking.departureId) {
    try {
      const { departure, packageCountry } = await catalogService.getDepartureDetail(ctx, booking.departureId);
      travelDates = `${departure.startDate.toLocaleDateString()}${departure.endDate ? ` – ${departure.endDate.toLocaleDateString()}` : ''} ${tCommon('estimatedSuffix')}`;
      tripCountry = packageCountry;
    } catch {
      // departure no longer visible to this role -- fall through to the default text
    }
  } else if (booking.customTravelStart) {
    travelDates = `${booking.customTravelStart.toLocaleDateString()}${booking.customTravelEnd ? ` – ${booking.customTravelEnd.toLocaleDateString()}` : ''} ${tCommon('estimatedSuffix')}`;
  }

  // Batch name resolution for whatever hotels/restaurants the days already
  // reference (read-only view too, not just canWrite) -- separate from the
  // full org-wide lists below, which only the write forms need.
  const dayHotelIds = [...new Set(days.map((d) => d.hotelId).filter(notNull))];
  const dayRestaurantIds = [...new Set(days.map((d) => d.restaurantId).filter(notNull))];
  const [dayHotels, dayRestaurants]: [HotelView[], RestaurantView[]] = await Promise.all([
    itineraryService.listHotelsByIds(ctx, dayHotelIds),
    itineraryService.listRestaurantsByIds(ctx, dayRestaurantIds),
  ]);
  const hotelNameById = new Map(dayHotels.map((h) => [h.id, h.name]));
  const restaurantNameById = new Map(dayRestaurants.map((r) => [r.id, r.name]));

  // Ordered stops per day (replaces the old free-text plannedSites) --
  // fetched for every day regardless of canWrite, since the read-only
  // summary below shows them too.
  const daySitesLists = await Promise.all(days.map((day) => itineraryService.listDaySites(ctx, itineraryId, day.id)));
  const daySitesByDayId = new Map<string, ItineraryDaySiteView[]>(days.map((day, i) => [day.id, daySitesLists[i] ?? []]));

  // DR-120: batch-resolve whichever Activity ids the days already reference
  // (read-only view too, not just canWrite) -- same "used ids only" convention
  // as dayHotelIds/dayRestaurantIds above. Shares the site-name lookup below
  // with the planned-sites (ItineraryDaySite) display, since an Activity's
  // own site may not otherwise be among this itinerary's planned stops.
  const allUsedActivityIds = [...new Set(days.flatMap((d) => d.activityIds))];
  const usedActivities = await itineraryService.listActivitiesByIds(ctx, allUsedActivityIds);
  const activityById = new Map(usedActivities.map((a) => [a.id, a]));
  const allUsedSiteIds = [
    ...new Set([...daySitesLists.flat().map((s) => s.siteId), ...usedActivities.map((a) => a.siteId)]),
  ];
  const usedSites = await itineraryService.listSitesByIds(ctx, allUsedSiteIds);
  const siteNameById = new Map(usedSites.map((s) => [s.id, s.name]));

  const [allHotels, allRestaurants, siteOptions, allActivities, allSites] = canEdit
    ? await Promise.all([
        itineraryService.listHotels(ctx),
        itineraryService.listRestaurants(ctx),
        tripCountry ? itineraryService.listSitesForCountry(ctx, tripCountry) : Promise.resolve([]),
        itineraryService.listActivities(ctx),
        itineraryService.listSites(ctx),
      ])
    : [[], [], [], [], []];
  const siteByIdForActivities = new Map(allSites.map((s) => [s.id, s]));
  const activityOptions: SearchableOption[] = allActivities.map((a) => {
    const site = siteByIdForActivities.get(a.siteId);
    return {
      value: a.id,
      label: site ? `${a.name} — ${site.name}` : a.name,
      searchText: `${a.name} ${site?.name ?? ''}`.toLowerCase(),
    };
  });

  return (
    <div className="max-w-3xl space-y-8">
      <BackLink href="/staff/itineraries">{t('backToItineraries')}</BackLink>
      <div>
        <PageHeader eyebrow={t('itineraryEyebrow')} title={booking.bookingReference} />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="rounded-pill bg-mist/10 px-2.5 py-1 text-xs font-semibold text-mist">{travelDates}</span>
          <Badge tone={ITINERARY_STATUS_TONE[itinerary.status]}>{tItineraryStatus(itinerary.status)}</Badge>
        </div>
        {booking.departureId && (
          <p className="mt-2 text-sm">
            <LinkButton href={`/staff/departures/${booking.departureId}`}>{t('assignVehicleDriverGuide')}</LinkButton>
          </p>
        )}

        {itinerary.status === 'APPROVED' && (
          <p className="mt-2 text-sm">
            <LinkButton href={`/api/v1/itineraries/${itineraryId}/summary-pdf`} prefetch={false} variant="secondary" size="compact">
              {t('downloadItineraryPdf')}
            </LinkButton>
          </p>
        )}

        {bookingLocked && (
          <div className="mt-4">
            <Alert tone="info">{t('bookingLocked', { status: tBookingStatus(booking.status) })}</Alert>
          </div>
        )}

        {canWrite && (
          <div className="mt-4 flex gap-3">
            {itinerary.status === 'DRAFT' && (
              <form action={submitForReviewAction.bind(null, itineraryId)}>
                <SubmitButton variant="secondary" pendingLabel={t('submitting')}>
                  {t('submitForReview')}
                </SubmitButton>
              </form>
            )}
            {itinerary.status === 'IN_REVIEW' && (
              <form action={sendBackToDraftAction.bind(null, itineraryId)}>
                <SubmitButton variant="secondary" pendingLabel={t('sendingBack')}>
                  {t('sendBackToDraft')}
                </SubmitButton>
              </form>
            )}
            {canApprove && itinerary.status !== 'APPROVED' && (
              <form action={approveItineraryAction.bind(null, itineraryId)}>
                <SubmitButton variant="success" pendingLabel={t('approving')}>
                  {t('approve')}
                </SubmitButton>
              </form>
            )}
          </div>
        )}
      </div>

      <Reveal>
      <div className="space-y-8">
      <div>
        <div className="survey-rule mb-6" />
        <p className="eyebrow text-mist">{t('notesAndEmergencyContact')}</p>
        {canEdit ? (
          <form action={updateItineraryAction.bind(null, itineraryId)} className="mt-3 space-y-4">
            <FormField label={t('notesLabel')} htmlFor="notes" optional>
              <textarea
                name="notes"
                defaultValue={itinerary.notes ?? ''}
                rows={3}
                className="w-full rounded-survey border border-rule px-3 py-2"
              />
            </FormField>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <FormField label={t('emergencyContactName')} htmlFor="emergencyContactName" optional>
                <input
                  name="emergencyContactName"
                  defaultValue={itinerary.emergencyContactName ?? ''}
                  className="w-full rounded-survey border border-rule px-3 py-2"
                />
              </FormField>
              <FormField label={t('phone')} htmlFor="emergencyContactPhone" optional>
                <input
                  name="emergencyContactPhone"
                  defaultValue={itinerary.emergencyContactPhone ?? ''}
                  className="w-full rounded-survey border border-rule px-3 py-2"
                />
              </FormField>
              <FormField label={t('relation')} htmlFor="emergencyContactRelation" optional>
                <input
                  name="emergencyContactRelation"
                  defaultValue={itinerary.emergencyContactRelation ?? ''}
                  placeholder={t('relationPlaceholder')}
                  className="w-full rounded-survey border border-rule px-3 py-2"
                />
              </FormField>
            </div>
            <SubmitButton variant="secondary" size="compact" pendingLabel={t('saving')}>
              {t('save')}
            </SubmitButton>
          </form>
        ) : (
          <div className="mt-2 text-sm text-mist">
            <p>{itinerary.notes || t('noNotes')}</p>
            <p className="mt-1">
              {t('emergencyContactPrefix')}{' '}
              {itinerary.emergencyContactName
                ? `${itinerary.emergencyContactName}${itinerary.emergencyContactRelation ? ` (${itinerary.emergencyContactRelation})` : ''}${itinerary.emergencyContactPhone ? ` · ${itinerary.emergencyContactPhone}` : ''}`
                : t('noneOnFile')}
            </p>
          </div>
        )}
      </div>

      <div>
        <div className="survey-rule mb-6" />
        <p className="eyebrow text-mist">{t('dailySchedule')}</p>
        {days.length === 0 ? (
          <p className="mt-2 text-sm text-mist">{t('noDaysYet')}</p>
        ) : (
          <RevealGroup as="div" itemAs="div" className="mt-3 space-y-4">
            {days.map((day) => (
              <Card key={day.id}>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-navy">
                    {t('dayLabel', { number: day.dayNumber, date: day.date.toLocaleDateString() })}
                    {(day.departureTime || day.arrivalTime) && (
                      <span className="ml-2 font-normal text-mist">
                        {day.departureTime && t('depart', { time: day.departureTime })}
                        {day.departureTime && day.arrivalTime && ' · '}
                        {day.arrivalTime && t('arrive', { time: day.arrivalTime })}
                      </span>
                    )}
                  </p>
                  {canEdit && (
                    <form action={removeDayAction.bind(null, itineraryId, day.id)}>
                      <SubmitButton
                        variant="secondary"
                        size="compact"
                        pendingLabel={t('removing')}
                        confirmMessage={t('removeDayConfirm', { number: day.dayNumber })}
                      >
                        {t('remove')}
                      </SubmitButton>
                    </form>
                  )}
                </div>
                <dl className="mt-2 grid grid-cols-2 gap-2 text-sm text-mist">
                  {day.hotelId && (
                    <div>
                      <dt className="text-xs">{t('hotel')}</dt>
                      <dd>{hotelNameById.get(day.hotelId) ?? '—'}</dd>
                    </div>
                  )}
                  {day.restaurantId && (
                    <div>
                      <dt className="text-xs">{t('restaurant')}</dt>
                      <dd>{restaurantNameById.get(day.restaurantId) ?? '—'}</dd>
                    </div>
                  )}
                  {day.pickupLocation && (
                    <div>
                      <dt className="text-xs">{t('pickup')}</dt>
                      <dd>{day.pickupLocation}</dd>
                    </div>
                  )}
                  {day.dropoffLocation && (
                    <div>
                      <dt className="text-xs">{t('dropoff')}</dt>
                      <dd>{day.dropoffLocation}</dd>
                    </div>
                  )}
                  {(daySitesByDayId.get(day.id) ?? []).length > 0 && (
                    <div className="col-span-2">
                      <dt className="text-xs">{t('plannedSites')}</dt>
                      <dd>
                        {(daySitesByDayId.get(day.id) ?? [])
                          .map((ds) => siteNameById.get(ds.siteId) ?? '—')
                          .join(' → ')}
                      </dd>
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
                          const siteName = activity ? siteNameById.get(activity.siteId) : undefined;
                          return (
                            <Badge key={id} tone="neutral">
                              {activity ? (siteName ? `${activity.name} — ${siteName}` : activity.name) : id}
                            </Badge>
                          );
                        })}
                      </dd>
                    </div>
                  )}
                  {day.estimatedTravelMinutes != null && (
                    <div>
                      <dt className="text-xs">{t('estimatedTravel')}</dt>
                      <dd>{t('minutesSuffix', { minutes: day.estimatedTravelMinutes })}</dd>
                    </div>
                  )}
                  {day.notes && (
                    <div className="col-span-2">
                      <dt className="text-xs">{t('notes')}</dt>
                      <dd>{day.notes}</dd>
                    </div>
                  )}
                </dl>
                {canEdit && (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs text-forest">{t('editDay')}</summary>
                    <form action={updateDayAction.bind(null, itineraryId, day.id)} className="mt-3 space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <FormField label={t('date')} htmlFor={`date-${day.id}`}>
                          <input
                            name="date"
                            type="date"
                            defaultValue={day.date.toISOString().slice(0, 10)}
                            className="w-full rounded-survey border border-rule px-3 py-2"
                          />
                        </FormField>
                        <FormField label={t('estimatedTravelMin')} htmlFor={`travel-${day.id}`} optional>
                          <input
                            name="estimatedTravelMinutes"
                            type="number"
                            min={0}
                            defaultValue={day.estimatedTravelMinutes ?? undefined}
                            className="w-full rounded-survey border border-rule px-3 py-2"
                          />
                        </FormField>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <FormField label={t('departureTime')} htmlFor={`dep-${day.id}`} optional>
                          <input
                            name="departureTime"
                            type="time"
                            defaultValue={day.departureTime ?? ''}
                            className="w-full rounded-survey border border-rule px-3 py-2"
                          />
                        </FormField>
                        <FormField label={t('arrivalTime')} htmlFor={`arr-${day.id}`} optional>
                          <input
                            name="arrivalTime"
                            type="time"
                            defaultValue={day.arrivalTime ?? ''}
                            className="w-full rounded-survey border border-rule px-3 py-2"
                          />
                        </FormField>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <FormField label={t('hotel')} htmlFor={`hotel-${day.id}`} optional>
                          <Select name="hotelId" defaultValue={day.hotelId ?? ''}>
                            <option value="">{t('none')}</option>
                            {allHotels.map((h) => (
                              <option key={h.id} value={h.id}>
                                {h.name} ({tCountries(h.country)})
                              </option>
                            ))}
                          </Select>
                        </FormField>
                        <FormField label={t('restaurant')} htmlFor={`restaurant-${day.id}`} optional>
                          <Select name="restaurantId" defaultValue={day.restaurantId ?? ''}>
                            <option value="">{t('none')}</option>
                            {allRestaurants.map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.name} ({tCountries(r.country)})
                              </option>
                            ))}
                          </Select>
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
                        <div>
                          <p className="mb-1 text-xs text-mist">{t('pickupPin')}</p>
                          <MapLocationPicker
                            latitudeName="pickupLatitude"
                            longitudeName="pickupLongitude"
                            initialLatitude={day.pickupLatitude}
                            initialLongitude={day.pickupLongitude}
                            optional
                          />
                        </div>
                        <div>
                          <p className="mb-1 text-xs text-mist">{t('dropoffPin')}</p>
                          <MapLocationPicker
                            latitudeName="dropoffLatitude"
                            longitudeName="dropoffLongitude"
                            initialLatitude={day.dropoffLatitude}
                            initialLongitude={day.dropoffLongitude}
                            optional
                          />
                        </div>
                      </div>
                      <FormField label={t('activities')} htmlFor={`activities-${day.id}`} optional>
                        <textarea
                          name="activities"
                          defaultValue={day.activities ?? ''}
                          rows={2}
                          className="w-full rounded-survey border border-rule px-3 py-2"
                        />
                      </FormField>
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

                    <div className="mt-4">
                      <p className="text-xs text-mist">{t('plannedSitesAttractions')}</p>
                      {(daySitesByDayId.get(day.id) ?? []).length > 0 && (
                        <ul className="mt-2 space-y-1">
                          {(daySitesByDayId.get(day.id) ?? []).map((ds, index, all) => (
                            <li key={ds.id} className="flex items-center gap-2 text-sm">
                              <span className="flex-1">{siteNameById.get(ds.siteId) ?? '—'}</span>
                              {index > 0 && (
                                <form action={moveDaySiteAction.bind(null, itineraryId, day.id, ds.siteId, 'up')}>
                                  <SubmitButton variant="secondary" size="compact" pendingLabel="…">
                                    ▲
                                  </SubmitButton>
                                </form>
                              )}
                              {index < all.length - 1 && (
                                <form action={moveDaySiteAction.bind(null, itineraryId, day.id, ds.siteId, 'down')}>
                                  <SubmitButton variant="secondary" size="compact" pendingLabel="…">
                                    ▼
                                  </SubmitButton>
                                </form>
                              )}
                              <form action={removeDaySiteAction.bind(null, itineraryId, day.id, ds.siteId)}>
                                <SubmitButton variant="secondary" size="compact" pendingLabel={t('removing')}>
                                  {t('remove')}
                                </SubmitButton>
                              </form>
                            </li>
                          ))}
                        </ul>
                      )}
                      <form action={addDaySiteAction.bind(null, itineraryId, day.id)} className="mt-2 flex items-end gap-2">
                        <div className="flex-1">
                          <Select name="siteId" defaultValue="">
                            <option value="">{t('chooseSiteToAdd')}</option>
                            {siteOptions.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.name} ({tCountries(s.country)})
                              </option>
                            ))}
                          </Select>
                        </div>
                        <SubmitButton variant="secondary" size="compact" pendingLabel={t('adding')}>
                          {t('addSite')}
                        </SubmitButton>
                      </form>
                    </div>
                  </details>
                )}
              </Card>
            ))}
          </RevealGroup>
        )}

        {canEdit && (
          <>
            <details className="mt-6">
              <summary className="cursor-pointer text-sm text-forest">{t('addADay')}</summary>
              <form action={addDayAction.bind(null, itineraryId)} className="mt-4 space-y-3">
                {/* Day number is computed server-side from this date relative to
                    the trip's own start date (DR-083) -- no longer a form field. */}
                <FormField label={t('date')} htmlFor="date">
                  <input name="date" type="date" required className="w-full rounded-survey border border-rule px-3 py-2" />
                </FormField>
                <div className="grid grid-cols-2 gap-3">
                  <FormField label={t('departureTime')} htmlFor="departureTime" optional>
                    <input name="departureTime" type="time" className="w-full rounded-survey border border-rule px-3 py-2" />
                  </FormField>
                  <FormField label={t('arrivalTime')} htmlFor="arrivalTime" optional>
                    <input name="arrivalTime" type="time" className="w-full rounded-survey border border-rule px-3 py-2" />
                  </FormField>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <FormField label={t('hotel')} htmlFor="hotelId" optional>
                    <Select name="hotelId" defaultValue="">
                      <option value="">{t('none')}</option>
                      {allHotels.map((h) => (
                        <option key={h.id} value={h.id}>
                          {h.name} ({tCountries(h.country)})
                        </option>
                      ))}
                    </Select>
                  </FormField>
                  <FormField label={t('restaurant')} htmlFor="restaurantId" optional>
                    <Select name="restaurantId" defaultValue="">
                      <option value="">{t('none')}</option>
                      {allRestaurants.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name} ({tCountries(r.country)})
                        </option>
                      ))}
                    </Select>
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
                <p className="text-xs text-mist">{t('plannedSitesAfterCreateNotice')}</p>
                <FormField label={t('activities')} htmlFor="activities" optional>
                  <textarea name="activities" rows={2} className="w-full rounded-survey border border-rule px-3 py-2" />
                </FormField>
                <FormField label={t('activitiesSelected')} htmlFor="activityIds" optional>
                  <MultiSearchableSelect
                    id="activityIds"
                    name="activityIds"
                    options={activityOptions}
                    placeholder={t('searchActivitiesPlaceholder')}
                  />
                </FormField>
                <FormField label={t('estimatedTravelMinutesLabel')} htmlFor="estimatedTravelMinutes" optional>
                  <input name="estimatedTravelMinutes" type="number" min={0} className="w-full rounded-survey border border-rule px-3 py-2" />
                </FormField>
                <FormField label={t('notes')} htmlFor="notes" optional>
                  <textarea name="notes" rows={2} className="w-full rounded-survey border border-rule px-3 py-2" />
                </FormField>
                <SubmitButton pendingLabel={t('adding')}>{t('addDay')}</SubmitButton>
              </form>
            </details>
          </>
        )}
      </div>
      </div>
      </Reveal>
    </div>
  );
}

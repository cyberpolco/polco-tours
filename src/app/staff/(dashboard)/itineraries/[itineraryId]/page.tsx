import { notFound } from 'next/navigation';
import { requireStaffContext } from '@lib/staff-guard';
import { can } from '@lib/rbac';
import { bookingService } from '@modules/booking';
import { catalogService } from '@modules/catalog';
import { itineraryService, type HotelView, type RestaurantView } from '@modules/itinerary';
import { Badge } from '@/components/ui/Badge';
import { LinkButton } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/Select';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { ITINERARY_STATUS_TONE } from '@lib/status-tones';
import {
  addDayAction,
  approveItineraryAction,
  removeDayAction,
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

  let travelDates = 'Not scheduled yet';
  // Falls back to the TAILOR_MADE booking's own custom country when there's
  // no real departure/package yet -- feeds the "planned sites" datalist
  // below, scoped to wherever this trip actually is.
  let tripCountry: string | null = booking.customCountry;
  if (booking.departureId) {
    try {
      const { departure, packageCountry } = await catalogService.getDepartureDetail(ctx, booking.departureId);
      travelDates = `${departure.startDate.toLocaleDateString()}${departure.endDate ? ` – ${departure.endDate.toLocaleDateString()}` : ''}`;
      tripCountry = packageCountry;
    } catch {
      // departure no longer visible to this role -- fall through to the default text
    }
  } else if (booking.customTravelStart) {
    travelDates = `${booking.customTravelStart.toLocaleDateString()}${booking.customTravelEnd ? ` – ${booking.customTravelEnd.toLocaleDateString()}` : ''}`;
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

  const [allHotels, allRestaurants, siteOptions] = canWrite
    ? await Promise.all([
        itineraryService.listHotels(ctx),
        itineraryService.listRestaurants(ctx),
        tripCountry ? itineraryService.listSitesForCountry(ctx, tripCountry) : Promise.resolve([]),
      ])
    : [[], [], []];

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <PageHeader eyebrow="Itinerary" title={booking.bookingReference} />
        <p className="mt-1 flex items-center gap-2 text-mist">
          {travelDates} · <Badge tone={ITINERARY_STATUS_TONE[itinerary.status]}>{itinerary.status}</Badge>
        </p>
        {booking.departureId && (
          <p className="mt-2 text-sm">
            <LinkButton href={`/staff/departures/${booking.departureId}`}>Assign vehicle/driver/guide</LinkButton>
          </p>
        )}

        {canWrite && (
          <div className="mt-4 flex gap-3">
            {itinerary.status === 'DRAFT' && (
              <form action={submitForReviewAction.bind(null, itineraryId)}>
                <SubmitButton variant="secondary" pendingLabel="Submitting…">
                  Submit for review
                </SubmitButton>
              </form>
            )}
            {itinerary.status === 'IN_REVIEW' && (
              <form action={sendBackToDraftAction.bind(null, itineraryId)}>
                <SubmitButton variant="secondary" pendingLabel="Sending back…">
                  Send back to draft
                </SubmitButton>
              </form>
            )}
            {canApprove && itinerary.status !== 'APPROVED' && (
              <form action={approveItineraryAction.bind(null, itineraryId)}>
                <SubmitButton variant="success" pendingLabel="Approving…">
                  Approve
                </SubmitButton>
              </form>
            )}
          </div>
        )}
      </div>

      <div>
        <div className="survey-rule mb-6" />
        <p className="eyebrow text-mist">Notes &amp; emergency contact</p>
        {canWrite ? (
          <form action={updateItineraryAction.bind(null, itineraryId)} className="mt-3 space-y-4">
            <FormField label="Notes / special instructions" htmlFor="notes" optional>
              <textarea
                name="notes"
                defaultValue={itinerary.notes ?? ''}
                rows={3}
                className="w-full rounded-survey border border-rule px-3 py-2"
              />
            </FormField>
            <div className="grid grid-cols-3 gap-4">
              <FormField label="Emergency contact name" htmlFor="emergencyContactName" optional>
                <input
                  name="emergencyContactName"
                  defaultValue={itinerary.emergencyContactName ?? ''}
                  className="w-full rounded-survey border border-rule px-3 py-2"
                />
              </FormField>
              <FormField label="Phone" htmlFor="emergencyContactPhone" optional>
                <input
                  name="emergencyContactPhone"
                  defaultValue={itinerary.emergencyContactPhone ?? ''}
                  className="w-full rounded-survey border border-rule px-3 py-2"
                />
              </FormField>
              <FormField label="Relation" htmlFor="emergencyContactRelation" optional>
                <input
                  name="emergencyContactRelation"
                  defaultValue={itinerary.emergencyContactRelation ?? ''}
                  placeholder="e.g. local ranger station"
                  className="w-full rounded-survey border border-rule px-3 py-2"
                />
              </FormField>
            </div>
            <SubmitButton variant="secondary" size="compact" pendingLabel="Saving…">
              Save
            </SubmitButton>
          </form>
        ) : (
          <div className="mt-2 text-sm text-mist">
            <p>{itinerary.notes || 'No notes.'}</p>
            <p className="mt-1">
              Emergency contact:{' '}
              {itinerary.emergencyContactName
                ? `${itinerary.emergencyContactName}${itinerary.emergencyContactRelation ? ` (${itinerary.emergencyContactRelation})` : ''}${itinerary.emergencyContactPhone ? ` · ${itinerary.emergencyContactPhone}` : ''}`
                : 'None on file'}
            </p>
          </div>
        )}
      </div>

      <div>
        <div className="survey-rule mb-6" />
        <p className="eyebrow text-mist">Daily schedule</p>
        {days.length === 0 ? (
          <p className="mt-2 text-sm text-mist">No days added yet.</p>
        ) : (
          <div className="mt-3 space-y-4">
            {days.map((day) => (
              <div key={day.id} className="rounded-survey border border-rule p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-navy">
                    Day {day.dayNumber} · {day.date.toLocaleDateString()}
                    {(day.departureTime || day.arrivalTime) && (
                      <span className="ml-2 font-normal text-mist">
                        {day.departureTime && `Depart ${day.departureTime}`}
                        {day.departureTime && day.arrivalTime && ' · '}
                        {day.arrivalTime && `Arrive ${day.arrivalTime}`}
                      </span>
                    )}
                  </p>
                  {canWrite && (
                    <form action={removeDayAction.bind(null, itineraryId, day.id)}>
                      <SubmitButton variant="secondary" size="compact" pendingLabel="Removing…">
                        Remove
                      </SubmitButton>
                    </form>
                  )}
                </div>
                <dl className="mt-2 grid grid-cols-2 gap-2 text-sm text-mist">
                  {day.hotelId && (
                    <div>
                      <dt className="text-xs">Hotel</dt>
                      <dd>{hotelNameById.get(day.hotelId) ?? '—'}</dd>
                    </div>
                  )}
                  {day.restaurantId && (
                    <div>
                      <dt className="text-xs">Restaurant</dt>
                      <dd>{restaurantNameById.get(day.restaurantId) ?? '—'}</dd>
                    </div>
                  )}
                  {day.pickupLocation && (
                    <div>
                      <dt className="text-xs">Pickup</dt>
                      <dd>{day.pickupLocation}</dd>
                    </div>
                  )}
                  {day.dropoffLocation && (
                    <div>
                      <dt className="text-xs">Drop-off</dt>
                      <dd>{day.dropoffLocation}</dd>
                    </div>
                  )}
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
                  {day.estimatedTravelMinutes != null && (
                    <div>
                      <dt className="text-xs">Estimated travel</dt>
                      <dd>{day.estimatedTravelMinutes} min</dd>
                    </div>
                  )}
                  {day.notes && (
                    <div className="col-span-2">
                      <dt className="text-xs">Notes</dt>
                      <dd>{day.notes}</dd>
                    </div>
                  )}
                </dl>
                {canWrite && (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs text-forest">Edit day</summary>
                    <form action={updateDayAction.bind(null, itineraryId, day.id)} className="mt-3 space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <FormField label="Date" htmlFor={`date-${day.id}`}>
                          <input
                            name="date"
                            type="date"
                            defaultValue={day.date.toISOString().slice(0, 10)}
                            className="w-full rounded-survey border border-rule px-3 py-2"
                          />
                        </FormField>
                        <FormField label="Estimated travel (min)" htmlFor={`travel-${day.id}`} optional>
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
                        <FormField label="Departure time" htmlFor={`dep-${day.id}`} optional>
                          <input
                            name="departureTime"
                            type="time"
                            defaultValue={day.departureTime ?? ''}
                            className="w-full rounded-survey border border-rule px-3 py-2"
                          />
                        </FormField>
                        <FormField label="Arrival time" htmlFor={`arr-${day.id}`} optional>
                          <input
                            name="arrivalTime"
                            type="time"
                            defaultValue={day.arrivalTime ?? ''}
                            className="w-full rounded-survey border border-rule px-3 py-2"
                          />
                        </FormField>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <FormField label="Hotel" htmlFor={`hotel-${day.id}`} optional>
                          <Select name="hotelId" defaultValue={day.hotelId ?? ''}>
                            <option value="">— none —</option>
                            {allHotels.map((h) => (
                              <option key={h.id} value={h.id}>
                                {h.name} ({h.country})
                              </option>
                            ))}
                          </Select>
                        </FormField>
                        <FormField label="Restaurant" htmlFor={`restaurant-${day.id}`} optional>
                          <Select name="restaurantId" defaultValue={day.restaurantId ?? ''}>
                            <option value="">— none —</option>
                            {allRestaurants.map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.name} ({r.country})
                              </option>
                            ))}
                          </Select>
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
                        <input
                          name="plannedSites"
                          list="site-options"
                          defaultValue={day.plannedSites ?? ''}
                          placeholder="Start typing for known sites…"
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
                )}
              </div>
            ))}
          </div>
        )}

        {canWrite && (
          <>
            {/* Shared by both the add-day and edit-day "planned sites" inputs. */}
            <datalist id="site-options">
              {siteOptions.map((s) => (
                <option key={s.id} value={s.name} />
              ))}
            </datalist>
            <details className="mt-6">
              <summary className="cursor-pointer text-sm text-forest">Add a day</summary>
              <form action={addDayAction.bind(null, itineraryId)} className="mt-4 space-y-3">
                {/* Day number is computed server-side from this date relative to
                    the trip's own start date (DR-083) -- no longer a form field. */}
                <FormField label="Date" htmlFor="date">
                  <input name="date" type="date" required className="w-full rounded-survey border border-rule px-3 py-2" />
                </FormField>
                <div className="grid grid-cols-2 gap-3">
                  <FormField label="Departure time" htmlFor="departureTime" optional>
                    <input name="departureTime" type="time" className="w-full rounded-survey border border-rule px-3 py-2" />
                  </FormField>
                  <FormField label="Arrival time" htmlFor="arrivalTime" optional>
                    <input name="arrivalTime" type="time" className="w-full rounded-survey border border-rule px-3 py-2" />
                  </FormField>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <FormField label="Hotel" htmlFor="hotelId" optional>
                    <Select name="hotelId" defaultValue="">
                      <option value="">— none —</option>
                      {allHotels.map((h) => (
                        <option key={h.id} value={h.id}>
                          {h.name} ({h.country})
                        </option>
                      ))}
                    </Select>
                  </FormField>
                  <FormField label="Restaurant" htmlFor="restaurantId" optional>
                    <Select name="restaurantId" defaultValue="">
                      <option value="">— none —</option>
                      {allRestaurants.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name} ({r.country})
                        </option>
                      ))}
                    </Select>
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
                  <input
                    name="plannedSites"
                    list="site-options"
                    placeholder="Start typing for known sites…"
                    className="w-full rounded-survey border border-rule px-3 py-2"
                  />
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
          </>
        )}
      </div>
    </div>
  );
}

import { notFound } from 'next/navigation';
import { requireStaffContext } from '@lib/staff-guard';
import { can } from '@lib/rbac';
import { bookingService } from '@modules/booking';
import { catalogService } from '@modules/catalog';
import { itineraryService } from '@modules/itinerary';
import { Badge } from '@/components/ui/Badge';
import { LinkButton } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { PageHeader } from '@/components/ui/PageHeader';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Table, TableHeaderRow, Td, Th, Tr } from '@/components/ui/Table';
import { ITINERARY_STATUS_TONE } from '@lib/status-tones';
import {
  addDayAction,
  approveItineraryAction,
  assignHotelAction,
  assignRestaurantAction,
  removeDayAction,
  sendBackToDraftAction,
  submitForReviewAction,
  unassignHotelAction,
  unassignRestaurantAction,
  updateDayAction,
  updateItineraryAction,
} from './actions';

interface Props {
  params: Promise<{ itineraryId: string }>;
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

  const [booking, days, assignedHotels, assignedRestaurants] = await Promise.all([
    bookingService.getById(ctx, itinerary.bookingId),
    itineraryService.listDays(ctx, itineraryId),
    itineraryService.listAssignedHotels(ctx, itineraryId),
    itineraryService.listAssignedRestaurants(ctx, itineraryId),
  ]);

  let travelDates = 'Not scheduled yet';
  if (booking.departureId) {
    try {
      const { departure } = await catalogService.getDepartureDetail(ctx, booking.departureId);
      travelDates = `${departure.startDate.toLocaleDateString()}${departure.endDate ? ` – ${departure.endDate.toLocaleDateString()}` : ''}`;
    } catch {
      // departure no longer visible to this role -- fall through to the default text
    }
  } else if (booking.customTravelStart) {
    travelDates = `${booking.customTravelStart.toLocaleDateString()}${booking.customTravelEnd ? ` – ${booking.customTravelEnd.toLocaleDateString()}` : ''}`;
  }

  const [allHotels, allRestaurants] = canWrite
    ? await Promise.all([itineraryService.listHotels(ctx), itineraryService.listRestaurants(ctx)])
    : [[], []];
  const assignedHotelIds = new Set(assignedHotels.map((h) => h.id));
  const assignedRestaurantIds = new Set(assignedRestaurants.map((r) => r.id));
  const availableHotels = allHotels.filter((h) => !assignedHotelIds.has(h.id));
  const availableRestaurants = allRestaurants.filter((r) => !assignedRestaurantIds.has(r.id));

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
          <details className="mt-6">
            <summary className="cursor-pointer text-sm text-forest">Add a day</summary>
            <form action={addDayAction.bind(null, itineraryId)} className="mt-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Day number" htmlFor="dayNumber">
                  <input
                    name="dayNumber"
                    type="number"
                    min={1}
                    defaultValue={days.length + 1}
                    required
                    className="w-full rounded-survey border border-rule px-3 py-2"
                  />
                </FormField>
                <FormField label="Date" htmlFor="date">
                  <input name="date" type="date" required className="w-full rounded-survey border border-rule px-3 py-2" />
                </FormField>
              </div>
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
        )}
      </div>

      <div>
        <div className="survey-rule mb-6" />
        <p className="eyebrow text-mist">Assigned hotels</p>
        {assignedHotels.length === 0 ? (
          <p className="mt-2 text-sm text-mist">None assigned.</p>
        ) : (
          <Table className="mt-3">
            <thead>
              <TableHeaderRow>
                <Th>Name</Th>
                <Th>Country</Th>
                <Th>Contact</Th>
                <Th />
              </TableHeaderRow>
            </thead>
            <tbody>
              {assignedHotels.map((h) => (
                <Tr key={h.id}>
                  <Td>{h.name}</Td>
                  <Td>{h.country}</Td>
                  <Td>{h.contactPhone ?? h.contactEmail ?? '—'}</Td>
                  <Td>
                    {canWrite && (
                      <form action={unassignHotelAction.bind(null, itineraryId, h.id)}>
                        <SubmitButton variant="secondary" size="compact" pendingLabel="Removing…">
                          Remove
                        </SubmitButton>
                      </form>
                    )}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
        {canWrite && availableHotels.length > 0 && (
          <form action={assignHotelAction.bind(null, itineraryId)} className="mt-4 flex items-end gap-3">
            <FormField label="Assign a hotel" htmlFor="hotelId">
              <select name="hotelId" required className="w-full rounded-survey border border-rule px-3 py-2">
                {availableHotels.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name} ({h.country})
                  </option>
                ))}
              </select>
            </FormField>
            <SubmitButton variant="secondary" size="compact" pendingLabel="Assigning…">
              Assign
            </SubmitButton>
          </form>
        )}
      </div>

      <div>
        <div className="survey-rule mb-6" />
        <p className="eyebrow text-mist">Assigned restaurants</p>
        {assignedRestaurants.length === 0 ? (
          <p className="mt-2 text-sm text-mist">None assigned.</p>
        ) : (
          <Table className="mt-3">
            <thead>
              <TableHeaderRow>
                <Th>Name</Th>
                <Th>Country</Th>
                <Th>Contact</Th>
                <Th />
              </TableHeaderRow>
            </thead>
            <tbody>
              {assignedRestaurants.map((r) => (
                <Tr key={r.id}>
                  <Td>{r.name}</Td>
                  <Td>{r.country}</Td>
                  <Td>{r.contactPhone ?? r.contactEmail ?? '—'}</Td>
                  <Td>
                    {canWrite && (
                      <form action={unassignRestaurantAction.bind(null, itineraryId, r.id)}>
                        <SubmitButton variant="secondary" size="compact" pendingLabel="Removing…">
                          Remove
                        </SubmitButton>
                      </form>
                    )}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
        {canWrite && availableRestaurants.length > 0 && (
          <form action={assignRestaurantAction.bind(null, itineraryId)} className="mt-4 flex items-end gap-3">
            <FormField label="Assign a restaurant" htmlFor="restaurantId">
              <select name="restaurantId" required className="w-full rounded-survey border border-rule px-3 py-2">
                {availableRestaurants.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.country})
                  </option>
                ))}
              </select>
            </FormField>
            <SubmitButton variant="secondary" size="compact" pendingLabel="Assigning…">
              Assign
            </SubmitButton>
          </form>
        )}
      </div>
    </div>
  );
}

import { notFound } from 'next/navigation';
import { requireStaffContext } from '@lib/staff-guard';
import { can } from '@lib/rbac';
import { COUNTRY_CODES, flagEmoji } from '@lib/country-codes';
import { itineraryService } from '@modules/itinerary';
import { FormField } from '@/components/ui/FormField';
import { MapLocationPicker } from '@/components/ui/MapLocationPicker';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/Select';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { deleteHotelAction, rateHotelAction, updateHotelAction } from './actions';

interface Props {
  params: Promise<{ hotelId: string }>;
}

// DR-083: rating moved here from the itinerary page (was per-itinerary,
// now scoped to the hotel directly). Managers (itinerary.write) get the
// full edit form; TOUR_GUIDE/DRIVER (hotel_restaurant_rating.write only)
// get a read-only summary + rating form, restricted to a hotel they've
// actually toured (anti-BOLA via listMyRateableHotelIds, mirroring what
// rateHotel itself re-checks) -- anyone else 404s, same as before.
export default async function HotelDetailPage({ params }: Props) {
  const { hotelId } = await params;
  const ctx = await requireStaffContext('itinerary.read');
  const canWrite = can(ctx, 'itinerary.write');
  const canRate = can(ctx, 'hotel_restaurant_rating.write');

  if (!canWrite) {
    if (!canRate) notFound();
    const rateableIds = await itineraryService.listMyRateableHotelIds(ctx);
    if (!rateableIds.includes(hotelId)) notFound();
  }

  let hotel;
  try {
    hotel = await itineraryService.getHotel(ctx, hotelId);
  } catch {
    notFound();
  }

  const myRating = canRate ? await itineraryService.getMyHotelRating(ctx, hotelId) : null;

  return (
    <div className="max-w-md space-y-8">
      <PageHeader eyebrow="Hotel" title={hotel.name} />
      {canWrite ? (
        <form action={updateHotelAction.bind(null, hotelId)} className="space-y-4">
          <FormField label="Name" htmlFor="name">
            <input name="name" defaultValue={hotel.name} required className="w-full rounded-survey border border-rule px-3 py-2" />
          </FormField>
          <FormField label="Country" htmlFor="country">
            <Select name="country" defaultValue={hotel.country} required>
              {COUNTRY_CODES.map((c) => (
                <option key={c.alpha2} value={c.alpha2}>
                  {flagEmoji(c.alpha2)} {c.name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Address" htmlFor="address" optional>
            <input name="address" defaultValue={hotel.address ?? ''} className="w-full rounded-survey border border-rule px-3 py-2" />
          </FormField>
          <FormField label="Contact name" htmlFor="contactName" optional>
            <input name="contactName" defaultValue={hotel.contactName ?? ''} className="w-full rounded-survey border border-rule px-3 py-2" />
          </FormField>
          <FormField label="Contact phone" htmlFor="contactPhone" optional>
            <input name="contactPhone" defaultValue={hotel.contactPhone ?? ''} className="w-full rounded-survey border border-rule px-3 py-2" />
          </FormField>
          <FormField label="Contact email" htmlFor="contactEmail" optional>
            <input name="contactEmail" type="email" defaultValue={hotel.contactEmail ?? ''} className="w-full rounded-survey border border-rule px-3 py-2" />
          </FormField>
          <MapLocationPicker initialLatitude={hotel.latitude} initialLongitude={hotel.longitude} optional />
          <SubmitButton>Save changes</SubmitButton>
        </form>
      ) : (
        <div className="space-y-1 text-sm text-mist">
          <p>
            {flagEmoji(hotel.country)} {COUNTRY_CODES.find((c) => c.alpha2 === hotel.country)?.name ?? hotel.country}
          </p>
          {hotel.address && <p>{hotel.address}</p>}
          <p>{hotel.contactPhone ?? hotel.contactEmail ?? 'No contact on file'}</p>
          <p>{hotel.averageRating != null ? `${hotel.averageRating.toFixed(1)} ★ (${hotel.ratingCount} ratings)` : 'Not yet rated'}</p>
        </div>
      )}
      {canWrite && (
        <form action={deleteHotelAction.bind(null, hotelId)}>
          <SubmitButton variant="secondary" pendingLabel="Removing…" confirmMessage="Delete this hotel? This cannot be undone.">
            Delete hotel
          </SubmitButton>
        </form>
      )}
      {canRate && (
        <div>
          <div className="survey-rule mb-4" />
          <p className="eyebrow text-mist">Your rating</p>
          <form action={rateHotelAction.bind(null, hotelId)} className="mt-3 flex items-end gap-3">
            <FormField label="Rating" htmlFor="rating">
              <Select name="rating" defaultValue={myRating?.rating ?? ''} required>
                <option value="" disabled>
                  Rate…
                </option>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n} ★
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Comment" htmlFor="comment" optional>
              <input
                name="comment"
                defaultValue={myRating?.comment ?? ''}
                className="w-full rounded-survey border border-rule px-3 py-2"
              />
            </FormField>
            <SubmitButton pendingLabel="Saving…">{myRating ? 'Update' : 'Rate'}</SubmitButton>
          </form>
        </div>
      )}
    </div>
  );
}

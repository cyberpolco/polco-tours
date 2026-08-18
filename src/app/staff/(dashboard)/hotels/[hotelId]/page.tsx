import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { requireStaffContext } from '@lib/staff-guard';
import { can } from '@lib/rbac';
import { COUNTRY_CODES, flagEmoji } from '@lib/country-codes';
import { itineraryService } from '@modules/itinerary';
import { BackLink } from '@/components/ui/BackLink';
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
  const t = await getTranslations('StaffHotels');
  const tFields = await getTranslations('PlaceFields');
  const tCountries = await getTranslations('Countries');

  return (
    <div className="max-w-md space-y-8">
      <BackLink href="/staff/hotels">{t('backToHotels')}</BackLink>
      <PageHeader eyebrow={t('detailEyebrow')} title={hotel.name} />
      {canWrite ? (
        <form action={updateHotelAction.bind(null, hotelId)} className="space-y-4">
          <FormField label={tFields('name')} htmlFor="name">
            <input name="name" defaultValue={hotel.name} required className="w-full rounded-survey border border-rule px-3 py-2" />
          </FormField>
          <FormField label={tFields('country')} htmlFor="country">
            <Select name="country" defaultValue={hotel.country} required>
              {COUNTRY_CODES.map((c) => (
                <option key={c.alpha2} value={c.alpha2}>
                  {flagEmoji(c.alpha2)} {c.name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label={tFields('address')} htmlFor="address" optional>
            <input name="address" defaultValue={hotel.address ?? ''} className="w-full rounded-survey border border-rule px-3 py-2" />
          </FormField>
          <FormField label={tFields('contactName')} htmlFor="contactName" optional>
            <input name="contactName" defaultValue={hotel.contactName ?? ''} className="w-full rounded-survey border border-rule px-3 py-2" />
          </FormField>
          <FormField label={tFields('contactPhone')} htmlFor="contactPhone" optional>
            <input name="contactPhone" defaultValue={hotel.contactPhone ?? ''} className="w-full rounded-survey border border-rule px-3 py-2" />
          </FormField>
          <FormField label={tFields('contactEmail')} htmlFor="contactEmail" optional>
            <input name="contactEmail" type="email" defaultValue={hotel.contactEmail ?? ''} className="w-full rounded-survey border border-rule px-3 py-2" />
          </FormField>
          <MapLocationPicker initialLatitude={hotel.latitude} initialLongitude={hotel.longitude} optional />
          <SubmitButton>{tFields('saveChanges')}</SubmitButton>
        </form>
      ) : (
        <div className="space-y-1 text-sm text-mist">
          <p>
            {flagEmoji(hotel.country)} {tCountries(hotel.country)}
          </p>
          {hotel.address && <p>{hotel.address}</p>}
          <p>{hotel.contactPhone ?? hotel.contactEmail ?? tFields('noContactOnFile')}</p>
          <p>
            {hotel.averageRating != null
              ? tFields('ratedSummary', { rating: hotel.averageRating.toFixed(1), count: hotel.ratingCount })
              : tFields('notYetRated')}
          </p>
        </div>
      )}
      {canWrite && (
        <form action={deleteHotelAction.bind(null, hotelId)}>
          <SubmitButton variant="secondary" pendingLabel={tFields('removing')} confirmMessage={t('deleteConfirm')}>
            {t('deleteHotel')}
          </SubmitButton>
        </form>
      )}
      {canRate && (
        <div>
          <div className="survey-rule mb-4" />
          <p className="eyebrow text-mist">{tFields('yourRating')}</p>
          <form action={rateHotelAction.bind(null, hotelId)} className="mt-3 flex flex-wrap items-end gap-3">
            <FormField label={tFields('rating')} htmlFor="rating">
              <Select name="rating" defaultValue={myRating?.rating ?? ''} required>
                <option value="" disabled>
                  {tFields('ratePlaceholder')}
                </option>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n} ★
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label={tFields('comment')} htmlFor="comment" optional>
              <input
                name="comment"
                defaultValue={myRating?.comment ?? ''}
                className="w-full rounded-survey border border-rule px-3 py-2"
              />
            </FormField>
            <SubmitButton pendingLabel={tFields('saving')}>{myRating ? tFields('update') : tFields('rate')}</SubmitButton>
          </form>
        </div>
      )}
    </div>
  );
}

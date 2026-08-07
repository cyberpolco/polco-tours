import { notFound } from 'next/navigation';
import { requireStaffContext } from '@lib/staff-guard';
import { can } from '@lib/rbac';
import { COUNTRY_CODES, flagEmoji } from '@lib/country-codes';
import { itineraryService } from '@modules/itinerary';
import { FormField } from '@/components/ui/FormField';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/Select';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { deleteRestaurantAction, rateRestaurantAction, updateRestaurantAction } from './actions';

interface Props {
  params: Promise<{ restaurantId: string }>;
}

// DR-083: restaurant counterpart to hotels/[hotelId]/page.tsx -- identical
// shape/rules (rating moved here from the itinerary page).
export default async function RestaurantDetailPage({ params }: Props) {
  const { restaurantId } = await params;
  const ctx = await requireStaffContext('itinerary.read');
  const canWrite = can(ctx, 'itinerary.write');
  const canRate = can(ctx, 'hotel_restaurant_rating.write');

  if (!canWrite) {
    if (!canRate) notFound();
    const rateableIds = await itineraryService.listMyRateableRestaurantIds(ctx);
    if (!rateableIds.includes(restaurantId)) notFound();
  }

  let restaurant;
  try {
    restaurant = await itineraryService.getRestaurant(ctx, restaurantId);
  } catch {
    notFound();
  }

  const myRating = canRate ? await itineraryService.getMyRestaurantRating(ctx, restaurantId) : null;

  return (
    <div className="max-w-md space-y-8">
      <PageHeader eyebrow="Restaurant" title={restaurant.name} />
      {canWrite ? (
        <form action={updateRestaurantAction.bind(null, restaurantId)} className="space-y-4">
          <FormField label="Name" htmlFor="name">
            <input name="name" defaultValue={restaurant.name} required className="w-full rounded-survey border border-rule px-3 py-2" />
          </FormField>
          <FormField label="Country" htmlFor="country">
            <Select name="country" defaultValue={restaurant.country} required>
              {COUNTRY_CODES.map((c) => (
                <option key={c.alpha2} value={c.alpha2}>
                  {flagEmoji(c.alpha2)} {c.name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Address" htmlFor="address" optional>
            <input name="address" defaultValue={restaurant.address ?? ''} className="w-full rounded-survey border border-rule px-3 py-2" />
          </FormField>
          <FormField label="Contact name" htmlFor="contactName" optional>
            <input name="contactName" defaultValue={restaurant.contactName ?? ''} className="w-full rounded-survey border border-rule px-3 py-2" />
          </FormField>
          <FormField label="Contact phone" htmlFor="contactPhone" optional>
            <input name="contactPhone" defaultValue={restaurant.contactPhone ?? ''} className="w-full rounded-survey border border-rule px-3 py-2" />
          </FormField>
          <FormField label="Contact email" htmlFor="contactEmail" optional>
            <input
              name="contactEmail"
              type="email"
              defaultValue={restaurant.contactEmail ?? ''}
              className="w-full rounded-survey border border-rule px-3 py-2"
            />
          </FormField>
          <SubmitButton>Save changes</SubmitButton>
        </form>
      ) : (
        <div className="space-y-1 text-sm text-mist">
          <p>
            {flagEmoji(restaurant.country)} {COUNTRY_CODES.find((c) => c.alpha2 === restaurant.country)?.name ?? restaurant.country}
          </p>
          {restaurant.address && <p>{restaurant.address}</p>}
          <p>{restaurant.contactPhone ?? restaurant.contactEmail ?? 'No contact on file'}</p>
          <p>
            {restaurant.averageRating != null ? `${restaurant.averageRating.toFixed(1)} ★ (${restaurant.ratingCount} ratings)` : 'Not yet rated'}
          </p>
        </div>
      )}
      {canWrite && (
        <form action={deleteRestaurantAction.bind(null, restaurantId)}>
          <SubmitButton variant="secondary" pendingLabel="Removing…">
            Delete restaurant
          </SubmitButton>
        </form>
      )}
      {canRate && (
        <div>
          <div className="survey-rule mb-4" />
          <p className="eyebrow text-mist">Your rating</p>
          <form action={rateRestaurantAction.bind(null, restaurantId)} className="mt-3 flex items-end gap-3">
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

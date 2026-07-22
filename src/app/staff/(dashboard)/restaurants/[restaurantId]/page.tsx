import { notFound } from 'next/navigation';
import { requireStaffContext } from '@lib/staff-guard';
import { COUNTRY_CODES, flagEmoji } from '@lib/country-codes';
import { itineraryService } from '@modules/itinerary';
import { FormField } from '@/components/ui/FormField';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/Select';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { deleteRestaurantAction, updateRestaurantAction } from './actions';

interface Props {
  params: Promise<{ restaurantId: string }>;
}

export default async function RestaurantDetailPage({ params }: Props) {
  const { restaurantId } = await params;
  const ctx = await requireStaffContext('itinerary.write');

  let restaurant;
  try {
    restaurant = await itineraryService.getRestaurant(ctx, restaurantId);
  } catch {
    notFound();
  }

  return (
    <div className="max-w-md space-y-8">
      <PageHeader eyebrow="Restaurant" title={restaurant.name} />
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
          <input name="contactEmail" type="email" defaultValue={restaurant.contactEmail ?? ''} className="w-full rounded-survey border border-rule px-3 py-2" />
        </FormField>
        <SubmitButton>Save changes</SubmitButton>
      </form>
      <form action={deleteRestaurantAction.bind(null, restaurantId)}>
        <SubmitButton variant="secondary" pendingLabel="Removing…">
          Delete restaurant
        </SubmitButton>
      </form>
    </div>
  );
}

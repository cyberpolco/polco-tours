import { notFound } from 'next/navigation';
import { requireStaffContext } from '@lib/staff-guard';
import { COUNTRY_CODES, flagEmoji } from '@lib/country-codes';
import { itineraryService } from '@modules/itinerary';
import { FormField } from '@/components/ui/FormField';
import { PageHeader } from '@/components/ui/PageHeader';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { deleteHotelAction, updateHotelAction } from './actions';

interface Props {
  params: Promise<{ hotelId: string }>;
}

export default async function HotelDetailPage({ params }: Props) {
  const { hotelId } = await params;
  const ctx = await requireStaffContext('itinerary.write');

  let hotel;
  try {
    hotel = await itineraryService.getHotel(ctx, hotelId);
  } catch {
    notFound();
  }

  return (
    <div className="max-w-md space-y-8">
      <PageHeader eyebrow="Hotel" title={hotel.name} />
      <form action={updateHotelAction.bind(null, hotelId)} className="space-y-4">
        <FormField label="Name" htmlFor="name">
          <input name="name" defaultValue={hotel.name} required className="w-full rounded-survey border border-rule px-3 py-2" />
        </FormField>
        <FormField label="Country" htmlFor="country">
          <select name="country" defaultValue={hotel.country} required className="w-full rounded-survey border border-rule px-3 py-2">
            {COUNTRY_CODES.map((c) => (
              <option key={c.alpha2} value={c.alpha2}>
                {flagEmoji(c.alpha2)} {c.name}
              </option>
            ))}
          </select>
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
        <SubmitButton>Save changes</SubmitButton>
      </form>
      <form action={deleteHotelAction.bind(null, hotelId)}>
        <SubmitButton variant="secondary" pendingLabel="Removing…">
          Delete hotel
        </SubmitButton>
      </form>
    </div>
  );
}

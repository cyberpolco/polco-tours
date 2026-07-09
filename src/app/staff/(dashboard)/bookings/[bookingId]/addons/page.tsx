import { redirect } from 'next/navigation';
import { requireStaffContext } from '@lib/staff-guard';
import { format, money } from '@lib/money';
import { bookingService } from '@modules/booking';
import { catalogService } from '@modules/catalog';
import { finalizeAddonsAction } from './actions';

interface Props {
  params: Promise<{ bookingId: string }>;
}

export default async function AddonsPage({ params }: Props) {
  const { bookingId } = await params;
  const ctx = await requireStaffContext('booking.create');
  const [booking, travelers] = await Promise.all([
    bookingService.getById(ctx, bookingId),
    bookingService.listTravelers(ctx, bookingId),
  ]);

  const lead = travelers.find((t) => t.isTourLead);
  if (travelers.length < booking.seats || !lead?.passportDocumentId) {
    redirect(`/staff/bookings/${bookingId}/travelers/new`);
  }
  if (booking.addonsFinalizedAt) {
    redirect(`/staff/bookings/${bookingId}`);
  }

  const addons = await catalogService.listActiveAddonServices(ctx);

  return (
    <div className="max-w-md">
      <p className="text-xs tracking-survey text-mist">BOOKING SETUP · ADD-ONS</p>
      <h1 className="mt-1 text-2xl font-bold text-navy">Optional add-on services</h1>
      <p className="mt-1 text-sm text-mist">Selecting none is fine -- just finish setup to continue.</p>

      <form action={finalizeAddonsAction.bind(null, bookingId)} className="mt-6 space-y-3">
        {addons.length === 0 ? (
          <p className="text-sm text-mist">No add-on services configured.</p>
        ) : (
          addons.map((a) => (
            <label
              key={a.id}
              className="flex items-center justify-between gap-3 rounded-survey border border-rule px-3 py-2 text-sm"
            >
              <span className="flex items-center gap-2">
                <input type="checkbox" name="addonServiceId" value={a.id} />
                {a.name}
              </span>
              <span className="text-mist">{format(money(a.priceMinor, a.currency))}</span>
            </label>
          ))
        )}
        <button type="submit" className="rounded-survey bg-amber px-4 py-2 text-sm font-semibold text-navy">
          Finish setup
        </button>
      </form>
    </div>
  );
}

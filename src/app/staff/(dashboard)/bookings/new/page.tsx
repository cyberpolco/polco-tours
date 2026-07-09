import Link from 'next/link';
import { requireStaffContext } from '@lib/staff-guard';
import { catalogService } from '@modules/catalog';
import { format, money } from '@lib/money';
import { createBookingForClientAction } from './actions';

interface Props {
  searchParams: Promise<{ packageId?: string; departureId?: string; error?: string }>;
}

// Server-rendered, query-param-driven wizard (no client-side cascading
// selects): choose a package -> choose a departure -> enter the client's
// email + seats. Kept this way deliberately for a "bare-bones" first cut.
export default async function NewBookingPage({ searchParams }: Props) {
  const ctx = await requireStaffContext('booking.create');
  const { packageId, departureId, error } = await searchParams;

  if (departureId) {
    const detail = await catalogService.getDepartureDetail(ctx, departureId);
    return (
      <div className="max-w-md">
        <p className="text-xs tracking-survey text-mist">NEW BOOKING</p>
        <h1 className="mt-1 text-2xl font-bold text-navy">
          {detail.departure.startDate.toLocaleDateString()} · {format(detail.effectiveUnitPrice)}/seat
        </h1>
        {error === 'client_not_found' && (
          <p className="mt-3 text-sm text-amber">
            No account found for that email. The client needs to sign up before staff can book on their behalf.
          </p>
        )}
        <form action={createBookingForClientAction} className="mt-6 space-y-4">
          <input type="hidden" name="departureId" value={departureId} />
          <div>
            <label htmlFor="email" className="mb-1 block text-sm text-mist">
              Client email (must already have an account)
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              className="w-full rounded-survey border border-rule px-3 py-2"
            />
          </div>
          <div>
            <label htmlFor="seats" className="mb-1 block text-sm text-mist">
              Seats
            </label>
            <input
              id="seats"
              name="seats"
              type="number"
              min={1}
              defaultValue={1}
              required
              className="w-full rounded-survey border border-rule px-3 py-2"
            />
          </div>
          <button type="submit" className="rounded-survey bg-amber px-4 py-2 text-sm font-semibold text-navy">
            Create booking
          </button>
        </form>
        <Link
          href={packageId ? `/staff/bookings/new?packageId=${packageId}` : '/staff/bookings/new'}
          className="mt-4 inline-block text-sm text-forest hover:underline"
        >
          ← back
        </Link>
      </div>
    );
  }

  if (packageId) {
    const departures = await catalogService.listDepartures(ctx, packageId);
    return (
      <div>
        <p className="text-xs tracking-survey text-mist">NEW BOOKING · CHOOSE DEPARTURE</p>
        {departures.length === 0 ? (
          <p className="mt-4 text-mist">No departures scheduled for this package.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {departures.map((d) => (
              <li key={d.id}>
                <Link
                  href={`/staff/bookings/new?packageId=${packageId}&departureId=${d.id}`}
                  className="text-forest hover:underline"
                >
                  {d.startDate.toLocaleDateString()} · capacity {d.capacity} · {d.status}
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Link href="/staff/bookings/new" className="mt-4 inline-block text-sm text-forest hover:underline">
          ← back
        </Link>
      </div>
    );
  }

  const packages = await catalogService.listPackages(ctx);
  return (
    <div>
      <p className="text-xs tracking-survey text-mist">NEW BOOKING · CHOOSE PACKAGE</p>
      {packages.length === 0 ? (
        <p className="mt-4 text-mist">No packages yet.</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {packages.map((p) => (
            <li key={p.id}>
              <Link href={`/staff/bookings/new?packageId=${p.id}`} className="text-forest hover:underline">
                {p.title} · {p.country} · {format(money(p.priceMinor, p.currency))}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

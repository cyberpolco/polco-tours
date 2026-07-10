import Link from 'next/link';
import { requireStaffContext } from '@lib/staff-guard';
import { catalogService } from '@modules/catalog';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { FormField } from '@/components/ui/FormField';
import { PageHeader } from '@/components/ui/PageHeader';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { format, money } from '@lib/money';
import { DEPARTURE_STATUS_TONE } from '@lib/status-tones';
import { createBookingForClientAction } from './actions';

interface Props {
  searchParams: Promise<{ packageId?: string; departureId?: string; error?: string }>;
}

export default async function NewBookingPage({ searchParams }: Props) {
  const ctx = await requireStaffContext('booking.create');
  const { packageId, departureId, error } = await searchParams;

  if (departureId) {
    const detail = await catalogService.getDepartureDetail(ctx, departureId);
    return (
      <div className="max-w-md">
        <PageHeader
          eyebrow="New booking"
          title={`${detail.departure.startDate.toLocaleDateString()} · ${format(detail.effectiveUnitPrice)}/seat`}
        />
        {error === 'client_not_found' && (
          <div className="mt-3">
            <Alert tone="error">
              No account found for that email. The client needs to sign up before staff can book on their behalf.
            </Alert>
          </div>
        )}
        <form action={createBookingForClientAction} className="mt-6 space-y-4">
          <input type="hidden" name="departureId" value={departureId} />
          <FormField label="Client email (must already have an account)" htmlFor="email">
            <input name="email" type="email" required className="w-full rounded-survey border border-rule px-3 py-2" />
          </FormField>
          <FormField label="Seats" htmlFor="seats">
            <input
              name="seats"
              type="number"
              min={1}
              defaultValue={1}
              required
              className="w-full rounded-survey border border-rule px-3 py-2"
            />
          </FormField>
          <SubmitButton>Create booking</SubmitButton>
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
        <PageHeader eyebrow="New booking" title="Choose a departure" />
        {departures.length === 0 ? (
          <p className="mt-4 text-mist">No departures scheduled for this package.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {departures.map((d) => (
              <Card as="li" key={d.id}>
                <Link
                  href={`/staff/bookings/new?packageId=${packageId}&departureId=${d.id}`}
                  className="flex items-center justify-between text-forest hover:underline"
                >
                  <span>
                    {d.startDate.toLocaleDateString()} · capacity {d.capacity}
                  </span>
                  <Badge tone={DEPARTURE_STATUS_TONE[d.status]}>{d.status}</Badge>
                </Link>
              </Card>
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
      <PageHeader eyebrow="New booking" title="Choose a package" />
      {packages.length === 0 ? (
        <p className="mt-4 text-mist">No packages yet.</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {packages.map((p) => (
            <Card as="li" key={p.id}>
              <Link href={`/staff/bookings/new?packageId=${p.id}`} className="block text-forest hover:underline">
                {p.title} · {p.country} · {format(money(p.priceMinor, p.currency))}
              </Link>
            </Card>
          ))}
        </ul>
      )}
    </div>
  );
}

import Link from 'next/link';
import { requireStaffContext } from '@lib/staff-guard';
import { bookingService } from '@modules/booking';
import { FILTERABLE_BOOKING_STATUSES } from '@lib/booking-statuses';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';

// DR-098: same card-hub-plus-list-pages shape as DR-095 (fleet) and DR-097
// (packages).
export default async function BookingsPage() {
  const ctx = await requireStaffContext('booking.read');
  const allBookings = await bookingService.list(ctx);

  const sections = [
    { href: '/staff/bookings/all', title: 'All', count: allBookings.length, description: 'Every booking, any status.' },
    ...FILTERABLE_BOOKING_STATUSES.map((s) => ({
      href: `/staff/bookings/status/${s}`,
      title: s,
      count: allBookings.filter((b) => b.status === s).length,
      description: null,
    })),
  ];

  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Dashboard" title="Bookings" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {sections.map((s) => (
          <Card key={s.href} interactive className="p-0">
            <Link href={s.href} className="block p-5">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="text-sm font-semibold text-navy">{s.title}</h2>
                <span className="text-2xl font-bold text-navy">{s.count}</span>
              </div>
              {s.description && <p className="mt-1 text-sm text-mist">{s.description}</p>}
            </Link>
          </Card>
        ))}
      </div>
    </div>
  );
}

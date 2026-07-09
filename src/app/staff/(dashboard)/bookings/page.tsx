import Link from 'next/link';
import { requireStaffContext } from '@lib/staff-guard';
import { bookingService } from '@modules/booking';
import { format, money } from '@lib/money';

export default async function BookingsPage() {
  const ctx = await requireStaffContext('booking.read');
  const bookings = await bookingService.list(ctx); // staff -> full org manifest

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-navy">Bookings</h1>
      {bookings.length === 0 ? (
        <p className="text-mist">No bookings yet.</p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-rule text-mist">
              <th className="py-2">Status</th>
              <th className="py-2">Seats</th>
              <th className="py-2">Price</th>
              <th className="py-2">Created</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {bookings.map((b) => (
              <tr key={b.id} className="border-b border-rule">
                <td className="py-2">{b.status}</td>
                <td className="py-2">{b.seats}</td>
                <td className="py-2">{format(money(b.priceMinor, b.currency))}</td>
                <td className="py-2">{b.createdAt.toLocaleDateString()}</td>
                <td className="py-2">
                  <Link href={`/staff/bookings/${b.id}`} className="text-forest hover:underline">
                    View
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

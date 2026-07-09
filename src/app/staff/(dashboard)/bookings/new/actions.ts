'use server';

import { redirect } from 'next/navigation';
import { requireStaffContext } from '@lib/staff-guard';
import { authService } from '@modules/auth';
import { bookingService, CreateBookingInput } from '@modules/booking';

// Staff may only book for a tourist who already has an account this
// increment (found by email) -- creating an account for a brand-new,
// never-signed-up client is explicitly deferred (DR-014).
export async function createBookingForClientAction(formData: FormData): Promise<void> {
  const ctx = await requireStaffContext('booking.create');
  const departureId = String(formData.get('departureId'));
  const email = String(formData.get('email')).trim();

  const client = await authService.getUserByEmail(email);
  if (!client) {
    redirect(`/staff/bookings/new?departureId=${departureId}&error=client_not_found`);
  }

  const input = CreateBookingInput.parse({
    departureId,
    seats: Number(formData.get('seats')),
    touristUserId: client.id,
  });
  const booking = await bookingService.createHold(ctx, input);
  redirect(`/staff/bookings/${booking.id}`);
}

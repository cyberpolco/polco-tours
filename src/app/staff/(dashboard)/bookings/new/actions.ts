'use server';

import { redirect } from 'next/navigation';
import { requireStaffContext } from '@lib/staff-guard';
import { authService } from '@modules/auth';
import { bookingService, CreateBookingInput, CreateTailorMadeInput } from '@modules/booking';

function optionalString(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

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
    specialRequests: optionalString(formData, 'specialRequests'),
  });
  const booking = await bookingService.createHold(ctx, input);
  redirect(`/staff/bookings/${booking.id}`);
}

// Same already-has-an-account constraint as createBookingForClientAction.
export async function createTailorMadeBookingAction(formData: FormData): Promise<void> {
  const ctx = await requireStaffContext('booking.create');
  const email = String(formData.get('email')).trim();

  const client = await authService.getUserByEmail(email);
  if (!client) {
    redirect('/staff/bookings/new?tailorMade=1&error=client_not_found');
  }

  const input = CreateTailorMadeInput.parse({
    customCountry: String(formData.get('customCountry')).trim().toUpperCase(),
    customTravelStart: String(formData.get('customTravelStart')),
    customTravelEnd: String(formData.get('customTravelEnd')),
    seats: Number(formData.get('seats')),
    customDescription: String(formData.get('customDescription')),
    touristUserId: client.id,
    specialRequests: optionalString(formData, 'specialRequests'),
  });
  const booking = await bookingService.createTailorMadeRequest(ctx, input);
  redirect(`/staff/bookings/${booking.id}`);
}

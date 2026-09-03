'use server';

import { revalidatePath } from 'next/cache';
import { requireStaffContext } from '@lib/staff-guard';
import { CreateAirportInput, CreateFlightFareRateInput, financeService } from '@modules/finance';

function decimalToMinor(formData: FormData, key: string): number {
  return Math.round(Number(formData.get(key)) * 100);
}

// DR-222: Airport is a small staff-curated reference list (IATA code, name,
// city, country, active) -- exists solely to give FlightFareRate a real
// FK-able route identity, same "no reapply sweep needed" shape as AddonRate
// (nothing here is ever snapshotted into a cost breakdown).
export async function createAirportAction(formData: FormData): Promise<void> {
  const ctx = await requireStaffContext('finance_config.write');
  const input = CreateAirportInput.parse({
    iataCode: String(formData.get('iataCode') ?? ''),
    name: String(formData.get('name') ?? '').trim(),
    city: String(formData.get('city') ?? '').trim(),
    country: String(formData.get('country') ?? ''),
    active: formData.get('active') === 'on',
  });
  await financeService.createAirport(ctx, input);
  revalidatePath('/staff/finance/rates/flights');
}

export async function updateAirportAction(id: string, formData: FormData): Promise<void> {
  const ctx = await requireStaffContext('finance_config.write');
  const input = CreateAirportInput.parse({
    iataCode: String(formData.get('iataCode') ?? ''),
    name: String(formData.get('name') ?? '').trim(),
    city: String(formData.get('city') ?? '').trim(),
    country: String(formData.get('country') ?? ''),
    active: formData.get('active') === 'on',
  });
  await financeService.updateAirport(ctx, id, input);
  revalidatePath('/staff/finance/rates/flights');
}

export async function deleteAirportAction(id: string): Promise<void> {
  const ctx = await requireStaffContext('finance_config.write');
  await financeService.deleteAirport(ctx, id);
  revalidatePath('/staff/finance/rates/flights');
}

// No reapply summary on the two actions below, same reasoning as
// AddonRate's own update action -- a FlightFareRate is resolved live at
// add-on selection time (src/lib/flight-fare-rate.ts), never snapshotted
// into a cost breakdown, so there's nothing to recompute.
export async function createFlightFareRateAction(formData: FormData): Promise<void> {
  const ctx = await requireStaffContext('finance_config.write');
  const input = CreateFlightFareRateInput.parse({
    originAirportId: String(formData.get('originAirportId') ?? ''),
    destinationAirportId: String(formData.get('destinationAirportId') ?? ''),
    airline: String(formData.get('airline') ?? '').trim(),
    flightClass: String(formData.get('flightClass') ?? ''),
    priceMinor: decimalToMinor(formData, 'price'),
    currency: String(formData.get('currency') ?? ''),
  });
  await financeService.createFlightFareRate(ctx, input);
  revalidatePath('/staff/finance/rates/flights');
}

export async function updateFlightFareRateAction(id: string, formData: FormData): Promise<void> {
  const ctx = await requireStaffContext('finance_config.write');
  const input = CreateFlightFareRateInput.parse({
    originAirportId: String(formData.get('originAirportId') ?? ''),
    destinationAirportId: String(formData.get('destinationAirportId') ?? ''),
    airline: String(formData.get('airline') ?? '').trim(),
    flightClass: String(formData.get('flightClass') ?? ''),
    priceMinor: decimalToMinor(formData, 'price'),
    currency: String(formData.get('currency') ?? ''),
  });
  await financeService.updateFlightFareRate(ctx, id, input);
  revalidatePath('/staff/finance/rates/flights');
}

export async function deleteFlightFareRateAction(id: string): Promise<void> {
  const ctx = await requireStaffContext('finance_config.write');
  await financeService.deleteFlightFareRate(ctx, id);
  revalidatePath('/staff/finance/rates/flights');
}

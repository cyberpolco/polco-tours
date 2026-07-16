'use server';

import { revalidatePath } from 'next/cache';
import { requireStaffContext } from '@lib/staff-guard';
import { visaService } from '@modules/visa';

export async function contactTravelerAction(bookingId: string, travelerId: string, formData: FormData): Promise<void> {
  const ctx = await requireStaffContext('visa.process');
  const message = String(formData.get('message') ?? '').trim();
  await visaService.contactTraveler(ctx, bookingId, travelerId, { message });
  revalidatePath('/staff/visa-queue');
}

export async function requestMissingDocumentsAction(bookingId: string, travelerId: string): Promise<void> {
  const ctx = await requireStaffContext('visa.process');
  await visaService.requestMissingDocuments(ctx, bookingId, travelerId);
  revalidatePath('/staff/visa-queue');
}

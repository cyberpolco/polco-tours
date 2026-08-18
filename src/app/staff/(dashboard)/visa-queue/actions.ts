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

// DR-060: manually starts an application for a row in the "Needs
// application" reconciliation section -- the same visaService.submitApplication
// that already existed but, before this DR, had no UI anywhere calling it.
export async function startApplicationAction(bookingId: string, travelerId: string): Promise<void> {
  const ctx = await requireStaffContext('visa.process');
  await visaService.submitApplication(ctx, bookingId, travelerId);
  revalidatePath('/staff/visa-queue');
}

// DR-151 (explicit user request): SUPERADMIN-only genuine delete of an
// individual visa application. requireStaffContext('visa.delete') redirects
// to /staff/forbidden for anyone else -- visa.delete is never seeded to any
// role, so only SUPERADMIN's hardcoded wildcard ever passes this gate.
export async function deleteApplicationAction(applicationId: string): Promise<void> {
  const ctx = await requireStaffContext('visa.delete');
  await visaService.deleteApplication(ctx, applicationId);
  revalidatePath('/staff/visa-queue');
}

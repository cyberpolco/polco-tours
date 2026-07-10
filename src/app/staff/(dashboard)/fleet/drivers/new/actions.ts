'use server';

import { redirect } from 'next/navigation';
import { requireStaffContext } from '@lib/staff-guard';
import { authService } from '@modules/auth';
import { CreateDriverProfileInput, fleetService } from '@modules/fleet';

// Same convention as staff booking-on-behalf-of-a-client (DR-014): the
// DRIVER-role user must already have an account, found by email.
export async function createDriverProfileAction(formData: FormData): Promise<void> {
  const ctx = await requireStaffContext('fleet.write');

  const email = String(formData.get('email') ?? '').trim();
  const user = await authService.getUserByEmail(email);
  if (!user || user.role !== 'DRIVER') {
    redirect('/staff/fleet/drivers/new?error=driver_not_found');
  }

  const licenseExpiresAtRaw = String(formData.get('licenseExpiresAt') ?? '');
  const input = CreateDriverProfileInput.parse({
    userId: user.id,
    licenseNumber: String(formData.get('licenseNumber') ?? '').trim(),
    licenseExpiresAt: licenseExpiresAtRaw || undefined,
  });

  const driver = await fleetService.createDriverProfile(ctx, input);
  redirect(`/staff/fleet/drivers/${driver.id}`);
}

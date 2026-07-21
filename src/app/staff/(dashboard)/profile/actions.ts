'use server';

import { revalidatePath } from 'next/cache';
import { requireStaffContext } from '@lib/staff-guard';
import { authService, UpdateProfileInput } from '@modules/auth';
import { toE164 } from '@lib/country-codes';

// Any staff role can edit their own name/phone -- authService.updateProfile
// already re-checks profile.write itself (held by every staff role, see
// rbac.ts's DEFAULT_PERMISSIONS), so this action doesn't gate on any
// narrower permission, same "voluntary self-service, no extra gate"
// precedent as /staff/change-password.
export async function updateMyProfileAction(formData: FormData): Promise<void> {
  const ctx = await requireStaffContext('profile.write');

  const name = String(formData.get('name') ?? '').trim();
  const dialCode = String(formData.get('dialCode') ?? '');
  const localNumber = String(formData.get('localNumber') ?? '').trim();

  const input = UpdateProfileInput.parse({
    name: name || undefined,
    phone: localNumber ? toE164(dialCode, localNumber) : undefined,
  });
  await authService.updateProfile(ctx, input);
  revalidatePath('/staff/profile');
}

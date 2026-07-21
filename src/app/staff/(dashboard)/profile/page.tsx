import { redirect } from 'next/navigation';
import { requireStaffContext } from '@lib/staff-guard';
import { authService } from '@modules/auth';
import { FormField } from '@/components/ui/FormField';
import { PageHeader } from '@/components/ui/PageHeader';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { COUNTRY_CODES, flagEmoji, parseE164 } from '@lib/country-codes';
import { SETTINGS_ITEMS } from '../settings-items';
import { SidebarShell } from '../sidebar-shell';
import { updateMyProfileAction } from './actions';
import { PasswordSection } from './password-section';

// SUPERADMIN's own self-service "edit my name/phone" page -- reached via the
// Settings sidebar (settings-items.ts). Explicit user correction: this was
// originally "any staff role" (DR-059); every other staff role's name/phone
// is instead edited by an admin via /staff/admin/users/{userId}. Same
// "route passes a broad gate, service/page still narrows to SUPERADMIN"
// pattern as /staff/admin/permissions -- profile.write itself is still held
// by every role (authService.updateProfile's own check), so the narrowing
// happens here, not in rbac.ts. Distinct from /staff/admin/users/{userId}
// (SUPERADMIN editing SOMEONE ELSE'S row) -- this is always the signed-in
// user's own row, and that page now redirects here for a SUPERADMIN's own.
export default async function MyProfilePage() {
  const ctx = await requireStaffContext('profile.write');
  if (!ctx.roles.includes('SUPERADMIN')) redirect('/staff/forbidden');
  const user = await authService.getUser(ctx.userId);
  const parsedPhone = user?.phone ? parseE164(user.phone) : null;

  return (
    <SidebarShell items={SETTINGS_ITEMS} sectionTitle="Settings" roles={ctx.roles} permissions={[...ctx.permissions]}>
      <div className="max-w-md">
        <PageHeader eyebrow="Settings" title="My Profile" />
        <form action={updateMyProfileAction} className="mt-6 space-y-4">
          <FormField label="Name" htmlFor="name">
            <input
              name="name"
              defaultValue={user?.name ?? ''}
              required
              className="w-full rounded-survey border border-rule px-3 py-2"
            />
          </FormField>
          <p className="text-xs text-mist">{user?.email}</p>
          <div>
            <p className="mb-1 text-sm text-mist">Phone</p>
            <div className="flex gap-2">
              <select
                name="dialCode"
                defaultValue={parsedPhone?.dialCode ?? '264'}
                className="rounded-survey border border-rule px-2 py-2"
              >
                {COUNTRY_CODES.map((c) => (
                  <option key={c.alpha2} value={c.dialCode}>
                    {flagEmoji(c.alpha2)} +{c.dialCode}
                  </option>
                ))}
              </select>
              <input
                name="localNumber"
                type="tel"
                defaultValue={parsedPhone?.localNumber ?? ''}
                placeholder="81 234 5678"
                className="flex-1 rounded-survey border border-rule px-3 py-2"
              />
            </div>
          </div>
          <SubmitButton pendingLabel="Saving…">Save changes</SubmitButton>
        </form>

        <div className="survey-rule my-8" />
        <h2 className="text-lg font-semibold text-navy">Password</h2>
        <PasswordSection />
      </div>
    </SidebarShell>
  );
}

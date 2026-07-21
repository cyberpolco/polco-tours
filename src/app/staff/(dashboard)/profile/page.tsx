import { requireStaffContext } from '@lib/staff-guard';
import { authService } from '@modules/auth';
import { FormField } from '@/components/ui/FormField';
import { PageHeader } from '@/components/ui/PageHeader';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { COUNTRY_CODES, flagEmoji, parseE164 } from '@lib/country-codes';
import { SETTINGS_ITEMS } from '../settings-items';
import { SidebarShell } from '../sidebar-shell';
import { updateMyProfileAction } from './actions';

// Any staff role's own self-service "edit my name/phone" page -- reached via
// the Settings sidebar (settings-items.ts), no permission gate beyond
// ordinary staff-session access, same convention as /staff/change-password.
// Distinct from /staff/admin/users/{userId} (SUPERADMIN editing SOMEONE
// ELSE'S row) -- this is always the signed-in user's own row.
export default async function MyProfilePage() {
  const ctx = await requireStaffContext('profile.write');
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
      </div>
    </SidebarShell>
  );
}

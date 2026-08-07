import { requireStaffContext } from '@lib/staff-guard';
import { PageHeader } from '@/components/ui/PageHeader';
import { SETTINGS_ITEMS } from '../../settings-items';
import { SidebarShell } from '../../sidebar-shell';
import { SiteForm } from '../site-form';
import { createSiteAction } from './actions';

export default async function NewSitePage() {
  const ctx = await requireStaffContext('itinerary.write');

  return (
    <SidebarShell items={SETTINGS_ITEMS} sectionTitle="Settings" roles={ctx.roles} permissions={[...ctx.permissions]}>
      <div className="max-w-md">
        <PageHeader eyebrow="Itinerary Management · New site" title="Add a site" />
        <div className="mt-6">
          <SiteForm action={createSiteAction} submitLabel="Add site" pendingLabel="Adding…" />
        </div>
      </div>
    </SidebarShell>
  );
}

import { getTranslations } from 'next-intl/server';
import { requireStaffContext } from '@lib/staff-guard';
import { PageHeader } from '@/components/ui/PageHeader';
import { SETTINGS_ITEMS } from '../../settings-items';
import { SidebarShell } from '../../sidebar-shell';
import { SiteForm } from '../site-form';
import { createSiteAction } from './actions';

export default async function NewSitePage() {
  const ctx = await requireStaffContext('itinerary.write');
  const t = await getTranslations('StaffSites');
  const tSidebar = await getTranslations('StaffSettingsSidebar');

  return (
    <SidebarShell items={SETTINGS_ITEMS} sectionTitle={tSidebar('sectionTitle')} roles={ctx.roles} permissions={[...ctx.permissions]}>
      <div className="max-w-md">
        <PageHeader eyebrow={t('newEyebrow')} title={t('newTitle')} />
        <div className="mt-6">
          <SiteForm action={createSiteAction} submitLabel={t('addSite')} pendingLabel={t('adding')} />
        </div>
      </div>
    </SidebarShell>
  );
}

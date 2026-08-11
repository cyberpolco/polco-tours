import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { requireStaffContext } from '@lib/staff-guard';
import { itineraryService } from '@modules/itinerary';
import { PageHeader } from '@/components/ui/PageHeader';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { SETTINGS_ITEMS } from '../../settings-items';
import { SidebarShell } from '../../sidebar-shell';
import { SiteForm } from '../site-form';
import { deleteSiteAction, updateSiteAction } from './actions';

interface Props {
  params: Promise<{ siteId: string }>;
}

export default async function SiteDetailPage({ params }: Props) {
  const { siteId } = await params;
  const ctx = await requireStaffContext('itinerary.write');

  let site;
  try {
    site = await itineraryService.getSite(ctx, siteId);
  } catch {
    notFound();
  }
  const t = await getTranslations('StaffSites');
  const tSidebar = await getTranslations('StaffSettingsSidebar');

  return (
    <SidebarShell items={SETTINGS_ITEMS} sectionTitle={tSidebar('sectionTitle')} roles={ctx.roles} permissions={[...ctx.permissions]}>
      <div className="max-w-md space-y-8">
        <PageHeader eyebrow={t('detailEyebrow')} title={site.name} />
        <SiteForm
          action={updateSiteAction.bind(null, siteId)}
          defaultValues={{
            name: site.name,
            country: site.country,
            province: site.province,
            city: site.city,
            latitude: site.latitude,
            longitude: site.longitude,
          }}
          submitLabel={t('saveChanges')}
          pendingLabel={t('saving')}
        />
        <form action={deleteSiteAction.bind(null, siteId)}>
          <SubmitButton variant="secondary" pendingLabel={t('removing')} confirmMessage={t('deleteConfirm')}>
            {t('deleteSite')}
          </SubmitButton>
        </form>
      </div>
    </SidebarShell>
  );
}

import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { requireStaffContext } from '@lib/staff-guard';
import { itineraryService } from '@modules/itinerary';
import { Card } from '@/components/ui/Card';
import { FormField } from '@/components/ui/FormField';
import { PageHeader } from '@/components/ui/PageHeader';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { SETTINGS_ITEMS } from '../../settings-items';
import { SidebarShell } from '../../sidebar-shell';
import { SiteForm } from '../site-form';
import { createActivityAction, deleteActivityAction, deleteSiteAction, updateSiteAction } from './actions';

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
  const activities = await itineraryService.listActivitiesBySite(ctx, siteId);
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

        <Card>
          <p className="eyebrow text-mist">{t('activities')}</p>
          <p className="mt-1 text-xs text-mist">{t('activitiesNotice')}</p>
          {activities.length === 0 ? (
            <p className="mt-2 text-sm text-mist">{t('noActivitiesYet')}</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {activities.map((a) => (
                <li key={a.id} className="flex items-center justify-between rounded-survey border border-rule px-3 py-2 text-sm">
                  <span>
                    {a.name}
                    <span className="ml-2 text-xs text-mist">{a.hasEntranceFee ? t('entranceFeeYes') : t('entranceFeeNo')}</span>
                  </span>
                  <form action={deleteActivityAction.bind(null, siteId, a.id)}>
                    <SubmitButton
                      variant="secondary"
                      size="compact"
                      pendingLabel={t('removing')}
                      confirmMessage={t('removeActivityConfirm')}
                    >
                      {t('removeActivity')}
                    </SubmitButton>
                  </form>
                </li>
              ))}
            </ul>
          )}
          <form action={createActivityAction.bind(null, siteId)} className="mt-4 flex flex-wrap items-end gap-3">
            <FormField label={t('activityName')} htmlFor="name">
              <input
                name="name"
                placeholder={t('activityNamePlaceholder')}
                required
                className="w-56 rounded-survey border border-rule px-2 py-2 text-sm"
              />
            </FormField>
            <label className="flex items-center gap-2 pb-2 text-sm">
              <input type="checkbox" name="hasEntranceFee" className="h-4 w-4" />
              {t('hasEntranceFee')}
            </label>
            <SubmitButton size="compact" pendingLabel={t('adding')}>
              {t('addActivity')}
            </SubmitButton>
          </form>
        </Card>

        <form action={deleteSiteAction.bind(null, siteId)}>
          <SubmitButton variant="secondary" pendingLabel={t('removing')} confirmMessage={t('deleteConfirm')}>
            {t('deleteSite')}
          </SubmitButton>
        </form>
      </div>
    </SidebarShell>
  );
}

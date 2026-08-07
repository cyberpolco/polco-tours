import { notFound } from 'next/navigation';
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

  return (
    <SidebarShell items={SETTINGS_ITEMS} sectionTitle="Settings" roles={ctx.roles} permissions={[...ctx.permissions]}>
      <div className="max-w-md space-y-8">
        <PageHeader eyebrow="Site" title={site.name} />
        <SiteForm
          action={updateSiteAction.bind(null, siteId)}
          defaultValues={{ name: site.name, country: site.country, province: site.province, city: site.city }}
          submitLabel="Save changes"
          pendingLabel="Saving…"
        />
        <form action={deleteSiteAction.bind(null, siteId)}>
          <SubmitButton variant="secondary" pendingLabel="Removing…" confirmMessage="Delete this site? This cannot be undone.">
            Delete site
          </SubmitButton>
        </form>
      </div>
    </SidebarShell>
  );
}

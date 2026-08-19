import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { requireStaffContext } from '@lib/staff-guard';
import { insightsService, isInsightsViewer, type DateRange } from '@modules/insights';
import { PageHeader } from '@/components/ui/PageHeader';
import { SETTINGS_ITEMS } from '../settings-items';
import { SidebarShell } from '../sidebar-shell';
import { InsightsDashboardClient } from './InsightsDashboardClient';

interface Props {
  searchParams: Promise<{ from?: string; to?: string }>;
}

function parseDate(value: string | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Insights & Decision Making (DR-038; rebuilt DR-155) -- a live-polling
// executive dashboard composed entirely from existing booking/invoicing/
// assignment/fleet/ratings/visa/auth/analytics data. Deliberately not a
// real BI/analytics engine (same "simple, transparent" posture as
// assignment/domain.ts's DR-029 recommendation scorer) -- utilization is a
// plain ratio, not a scheduling-optimization metric.
//
// DR-155 restricts this page beyond the insights.read permission to
// SUPERADMIN/TOUR_OPERATOR/PLATFORM_ADMIN only (isInsightsViewer) -- the
// page redirects to /staff/forbidden on its own hardcoded check, since the
// service-level throw (used by the /api/v1/insights polling route) isn't
// the right UX for a full page render.
export default async function InsightsPage({ searchParams }: Props) {
  const ctx = await requireStaffContext('insights.read');
  if (!isInsightsViewer(ctx.roles)) redirect('/staff/forbidden');

  const { from, to } = await searchParams;
  const range: DateRange = { from: parseDate(from), to: parseDate(to) };
  const summary = await insightsService.getDashboardSummary(ctx, range);
  const t = await getTranslations('StaffInsights');
  const tSidebar = await getTranslations('StaffSettingsSidebar');

  return (
    <SidebarShell items={SETTINGS_ITEMS} sectionTitle={tSidebar('sectionTitle')} roles={ctx.roles} permissions={[...ctx.permissions]}>
      <div className="space-y-8">
        <PageHeader eyebrow={t('eyebrow')} title={t('title')} />
        <InsightsDashboardClient initialSummary={summary} />
      </div>
    </SidebarShell>
  );
}

import type { Currency } from '@prisma/client';
import { getTranslations } from 'next-intl/server';
import { requireStaffContext } from '@lib/staff-guard';
import { insightsService, type MoneyByCurrency } from '@modules/insights';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { Reveal, RevealGroup } from '@/components/ui/Reveal';
import { format, money } from '@lib/money';
import { SETTINGS_ITEMS } from '../settings-items';
import { SidebarShell } from '../sidebar-shell';

function formatMoneyByCurrency(bucket: MoneyByCurrency): string {
  const entries = Object.entries(bucket) as [Currency, number][];
  if (entries.length === 0) return '—';
  return entries.map(([currency, minor]) => format(money(minor, currency))).join(' + ');
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-mist">{label}</p>
      <p className="mt-0.5 text-2xl font-bold text-navy">{value}</p>
    </div>
  );
}

// Insights & Decision Making (DR-038) -- a read-only executive dashboard
// composed entirely from existing booking/invoicing/assignment/fleet/
// ratings/visa data. Deliberately not a real BI/analytics engine (same
// "simple, transparent" posture as assignment/domain.ts's DR-029
// recommendation scorer) -- utilization is a plain ratio, not a
// scheduling-optimization metric.
export default async function InsightsPage() {
  const ctx = await requireStaffContext('insights.read');
  const summary = await insightsService.getDashboardSummary(ctx);
  const t = await getTranslations('StaffInsights');
  const tSidebar = await getTranslations('StaffSettingsSidebar');
  const tCountries = await getTranslations('Countries');

  return (
    <SidebarShell items={SETTINGS_ITEMS} sectionTitle={tSidebar('sectionTitle')} roles={ctx.roles} permissions={[...ctx.permissions]}>
    <div className="space-y-8">
      <PageHeader eyebrow={t('eyebrow')} title={t('title')} />
      <Reveal className="space-y-8">
      <p className="text-xs text-mist">{t('currencyNotice')}</p>

      <div>
        <p className="eyebrow text-mist">{t('bookings')}</p>
        <Card className="mt-2">
          <RevealGroup as="div" itemAs="div" className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              <StatTile key="total" label={t('totalBookings')} value={String(summary.bookings.totalBookings)} />,
              <StatTile key="active" label={t('activeTours')} value={String(summary.bookings.activeTours)} />,
              <StatTile key="pending" label={t('pendingQuotations')} value={String(summary.bookings.pendingQuotations)} />,
              <StatTile key="conversion" label={t('conversionRate')} value={`${Math.round(summary.bookings.conversionRate * 100)}%`} />,
            ]}
          </RevealGroup>
        </Card>
      </div>

      <div>
        <div className="survey-rule mb-4" />
        <p className="eyebrow text-mist">{t('revenue')}</p>
        <Card className="mt-2">
          <RevealGroup as="div" itemAs="div" className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              <StatTile key="revenue" label={t('revenueLabel')} value={formatMoneyByCurrency(summary.revenue.revenue)} />,
              <StatTile key="outstanding" label={t('outstanding')} value={formatMoneyByCurrency(summary.revenue.outstanding)} />,
            ]}
          </RevealGroup>
        </Card>
        <div className="mt-4 grid gap-6 sm:grid-cols-2">
          <div>
            <p className="text-xs text-mist">{t('byCountry')}</p>
            {Object.entries(summary.revenue.revenueByCountry).length === 0 ? (
              <p className="mt-1 text-sm text-mist">{t('noRevenueYet')}</p>
            ) : (
              <RevealGroup as="ul" itemAs="li" className="mt-1 space-y-1 text-sm">
                {Object.entries(summary.revenue.revenueByCountry).map(([country, bucket]) => (
                  <span key={country}>
                    {tCountries(country)}: {formatMoneyByCurrency(bucket)}
                  </span>
                ))}
              </RevealGroup>
            )}
          </div>
          <div>
            <p className="text-xs text-mist">{t('byPackage')}</p>
            {Object.entries(summary.revenue.revenueByPackage).length === 0 ? (
              <p className="mt-1 text-sm text-mist">{t('noRevenueYet')}</p>
            ) : (
              <RevealGroup as="ul" itemAs="li" className="mt-1 space-y-1 text-sm">
                {Object.entries(summary.revenue.revenueByPackage).map(([pkg, bucket]) => (
                  <span key={pkg}>
                    {pkg}: {formatMoneyByCurrency(bucket)}
                  </span>
                ))}
              </RevealGroup>
            )}
          </div>
        </div>
      </div>

      <div>
        <div className="survey-rule mb-4" />
        <p className="eyebrow text-mist">{t('operations')}</p>
        <Card className="mt-2">
          <RevealGroup as="div" itemAs="div" className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              <StatTile key="fleet" label={t('fleetUtilization')} value={`${Math.round(summary.operations.fleetUtilization * 100)}%`} />,
              <StatTile key="driver" label={t('driverUtilization')} value={`${Math.round(summary.operations.driverUtilization * 100)}%`} />,
              <StatTile key="guide" label={t('guideUtilization')} value={`${Math.round(summary.operations.guideUtilization * 100)}%`} />,
            ]}
          </RevealGroup>
        </Card>
        <div className="mt-4">
          <p className="text-xs text-mist">{t('mostBookedDestinations')}</p>
          {summary.operations.mostBookedDestinations.length === 0 ? (
            <p className="mt-1 text-sm text-mist">{t('noBookingsYet')}</p>
          ) : (
            <RevealGroup as="ul" itemAs="li" className="mt-1 space-y-1 text-sm">
              {summary.operations.mostBookedDestinations.map((d) => (
                <span key={d.country}>
                  {tCountries(d.country)}: {d.count}
                </span>
              ))}
            </RevealGroup>
          )}
        </div>
      </div>

      <div>
        <div className="survey-rule mb-4" />
        <p className="eyebrow text-mist">{t('customerExperience')}</p>
        <Card className="mt-2">
          <RevealGroup as="div" itemAs="div" className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              <StatTile
                key="avgRating"
                label={t('averageRating')}
                value={
                  summary.customerExperience.averageRating != null
                    ? `${summary.customerExperience.averageRating.toFixed(1)} ★ (${summary.customerExperience.ratingCount})`
                    : t('noRatingsYet')
                }
              />,
              <StatTile key="repeat" label={t('repeatCustomers')} value={String(summary.customerExperience.repeatCustomers)} />,
            ]}
          </RevealGroup>
        </Card>
        <div className="mt-4 grid gap-6 sm:grid-cols-2">
          <div>
            <p className="text-xs text-mist">{t('topGuides')}</p>
            {summary.customerExperience.topGuides.length === 0 ? (
              <p className="mt-1 text-sm text-mist">{t('noRatedGuidesYet')}</p>
            ) : (
              <RevealGroup as="ul" itemAs="li" className="mt-1 space-y-1 text-sm">
                {summary.customerExperience.topGuides.map((g, i) => (
                  <span key={i}>
                    {g.name}: {g.averageRating.toFixed(1)} ★ ({g.ratingCount})
                  </span>
                ))}
              </RevealGroup>
            )}
          </div>
          <div>
            <p className="text-xs text-mist">{t('topDrivers')}</p>
            {summary.customerExperience.topDrivers.length === 0 ? (
              <p className="mt-1 text-sm text-mist">{t('noRatedDriversYet')}</p>
            ) : (
              <RevealGroup as="ul" itemAs="li" className="mt-1 space-y-1 text-sm">
                {summary.customerExperience.topDrivers.map((d, i) => (
                  <span key={i}>
                    {d.name}: {d.averageRating.toFixed(1)} ★ ({d.ratingCount})
                  </span>
                ))}
              </RevealGroup>
            )}
          </div>
        </div>
      </div>

      <div>
        <div className="survey-rule mb-4" />
        <p className="eyebrow text-mist">{t('immigration')}</p>
        <Card className="mt-2">
          <RevealGroup as="div" itemAs="div" className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              <StatTile key="pending" label={t('pendingVisas')} value={String(summary.immigration.pendingVisas)} />,
              <StatTile key="approved" label={t('approvedVisas')} value={String(summary.immigration.approvedVisas)} />,
              <StatTile key="rejected" label={t('rejectedVisas')} value={String(summary.immigration.rejectedVisas)} />,
              <StatTile key="missing" label={t('missingDocuments')} value={String(summary.immigration.missingDocuments)} />,
            ]}
          </RevealGroup>
        </Card>
      </div>
      </Reveal>
    </div>
    </SidebarShell>
  );
}

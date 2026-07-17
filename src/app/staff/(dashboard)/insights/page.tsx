import type { Currency } from '@prisma/client';
import { requireStaffContext } from '@lib/staff-guard';
import { insightsService, type MoneyByCurrency } from '@modules/insights';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
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
      <p className="text-lg font-semibold text-navy">{value}</p>
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

  return (
    <SidebarShell items={SETTINGS_ITEMS} sectionTitle="Settings" roles={ctx.roles} permissions={[...ctx.permissions]}>
    <div className="space-y-8">
      <PageHeader eyebrow="Insights" title="Executive Dashboard" />
      <p className="text-xs text-mist">
        Revenue figures are shown per currency and never combined across them -- this platform prices in USD/EUR/NAD/CDF
        with no FX conversion anywhere.
      </p>

      <div>
        <p className="eyebrow text-mist">Bookings</p>
        <Card className="mt-2 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatTile label="Total bookings" value={String(summary.bookings.totalBookings)} />
          <StatTile label="Active tours" value={String(summary.bookings.activeTours)} />
          <StatTile label="Pending quotations" value={String(summary.bookings.pendingQuotations)} />
          <StatTile label="Conversion rate" value={`${Math.round(summary.bookings.conversionRate * 100)}%`} />
        </Card>
      </div>

      <div>
        <div className="survey-rule mb-4" />
        <p className="eyebrow text-mist">Revenue</p>
        <Card className="mt-2 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatTile label="Revenue" value={formatMoneyByCurrency(summary.revenue.revenue)} />
          <StatTile label="Outstanding" value={formatMoneyByCurrency(summary.revenue.outstanding)} />
        </Card>
        <div className="mt-4 grid gap-6 sm:grid-cols-2">
          <div>
            <p className="text-xs text-mist">By country</p>
            <ul className="mt-1 space-y-1 text-sm">
              {Object.entries(summary.revenue.revenueByCountry).length === 0 ? (
                <li className="text-mist">No revenue yet.</li>
              ) : (
                Object.entries(summary.revenue.revenueByCountry).map(([country, bucket]) => (
                  <li key={country}>
                    {country}: {formatMoneyByCurrency(bucket)}
                  </li>
                ))
              )}
            </ul>
          </div>
          <div>
            <p className="text-xs text-mist">By package</p>
            <ul className="mt-1 space-y-1 text-sm">
              {Object.entries(summary.revenue.revenueByPackage).length === 0 ? (
                <li className="text-mist">No revenue yet.</li>
              ) : (
                Object.entries(summary.revenue.revenueByPackage).map(([pkg, bucket]) => (
                  <li key={pkg}>
                    {pkg}: {formatMoneyByCurrency(bucket)}
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
      </div>

      <div>
        <div className="survey-rule mb-4" />
        <p className="eyebrow text-mist">Operations</p>
        <Card className="mt-2 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatTile label="Fleet utilization" value={`${Math.round(summary.operations.fleetUtilization * 100)}%`} />
          <StatTile label="Driver utilization" value={`${Math.round(summary.operations.driverUtilization * 100)}%`} />
          <StatTile label="Guide utilization" value={`${Math.round(summary.operations.guideUtilization * 100)}%`} />
        </Card>
        <div className="mt-4">
          <p className="text-xs text-mist">Most booked destinations</p>
          <ul className="mt-1 space-y-1 text-sm">
            {summary.operations.mostBookedDestinations.length === 0 ? (
              <li className="text-mist">No bookings yet.</li>
            ) : (
              summary.operations.mostBookedDestinations.map((d) => (
                <li key={d.country}>
                  {d.country}: {d.count}
                </li>
              ))
            )}
          </ul>
        </div>
      </div>

      <div>
        <div className="survey-rule mb-4" />
        <p className="eyebrow text-mist">Customer Experience</p>
        <Card className="mt-2 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatTile
            label="Average rating"
            value={
              summary.customerExperience.averageRating != null
                ? `${summary.customerExperience.averageRating.toFixed(1)} ★ (${summary.customerExperience.ratingCount})`
                : 'No ratings yet'
            }
          />
          <StatTile label="Repeat customers" value={String(summary.customerExperience.repeatCustomers)} />
        </Card>
        <div className="mt-4 grid gap-6 sm:grid-cols-2">
          <div>
            <p className="text-xs text-mist">Top-performing guides</p>
            <ul className="mt-1 space-y-1 text-sm">
              {summary.customerExperience.topGuides.length === 0 ? (
                <li className="text-mist">No rated guides yet.</li>
              ) : (
                summary.customerExperience.topGuides.map((g, i) => (
                  <li key={i}>
                    {g.name}: {g.averageRating.toFixed(1)} ★ ({g.ratingCount})
                  </li>
                ))
              )}
            </ul>
          </div>
          <div>
            <p className="text-xs text-mist">Top-performing drivers</p>
            <ul className="mt-1 space-y-1 text-sm">
              {summary.customerExperience.topDrivers.length === 0 ? (
                <li className="text-mist">No rated drivers yet.</li>
              ) : (
                summary.customerExperience.topDrivers.map((d, i) => (
                  <li key={i}>
                    {d.name}: {d.averageRating.toFixed(1)} ★ ({d.ratingCount})
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
      </div>

      <div>
        <div className="survey-rule mb-4" />
        <p className="eyebrow text-mist">Immigration</p>
        <Card className="mt-2 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatTile label="Pending visas" value={String(summary.immigration.pendingVisas)} />
          <StatTile label="Approved visas" value={String(summary.immigration.approvedVisas)} />
          <StatTile label="Rejected visas" value={String(summary.immigration.rejectedVisas)} />
          <StatTile label="Missing documents" value={String(summary.immigration.missingDocuments)} />
        </Card>
      </div>
    </div>
    </SidebarShell>
  );
}

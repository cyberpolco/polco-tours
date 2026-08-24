'use client';

import type { Currency } from '@prisma/client';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { DashboardSummary, MoneyByCurrency } from '@modules/insights';
import { DASHBOARD_EPOCH, GUEST_GEOGRAPHY_NOT_COLLECTED } from '@modules/insights';
import { format, money } from '@lib/money';
import { Card } from '@/components/ui/Card';
import { Reveal, RevealGroup } from '@/components/ui/Reveal';
import { categoricalColor } from './chart-colors';
import { DateRangeControls } from './DateRangeControls';
import { ExportPdfButton } from './ExportPdfButton';
import { DonutChart } from './charts/DonutChart';
import { FunnelChart } from './charts/FunnelChart';
import { RingMeter } from './charts/RingMeter';
import { SplitMeterBar } from './charts/SplitMeterBar';
import { TrendLineChart } from './charts/TrendLineChart';

const POLL_INTERVAL_MS = 30_000;

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

function SectionDivider() {
  return <div className="survey-rule mb-4" />;
}

interface Props {
  initialSummary: DashboardSummary;
}

export function InsightsDashboardClient({ initialSummary }: Props) {
  const t = useTranslations('StaffInsights');
  const tCountries = useTranslations('Countries');
  const tSteps = useTranslations('PlanMyTripSteps');
  const tAvailability = useTranslations('AvailabilityStatusLabel');
  const searchParams = useSearchParams();
  const fromParam = searchParams.get('from') ?? '';
  const toParam = searchParams.get('to') ?? '';

  const [summary, setSummary] = useState(initialSummary);

  useEffect(() => {
    let cancelled = false;

    async function fetchSummary() {
      try {
        const qs = new URLSearchParams();
        if (fromParam) qs.set('from', fromParam);
        if (toParam) qs.set('to', toParam);
        const res = await fetch(`/api/v1/insights${qs.toString() ? `?${qs.toString()}` : ''}`, { cache: 'no-store' });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { summary: DashboardSummary };
        if (!cancelled) setSummary(data.summary);
      } catch {
        // Polling is best-effort -- a transient failure just skips this
        // tick; the next 30s tick tries again.
      }
    }

    fetchSummary();
    const interval = setInterval(fetchSummary, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [fromParam, toParam]);

  const geographySegments = Object.entries(summary.guest.geography).map(([country, count]) => ({
    label: country === GUEST_GEOGRAPHY_NOT_COLLECTED ? t('notCollected') : tCountries(country),
    value: count,
  }));

  const byRoleSegments = Object.entries(summary.staff.byRole).map(([role, count]) => ({ label: role, value: count ?? 0 }));

  const funnelStageLabel: Record<string, string> = {
    AWAITING_QUOTATION: t('funnelAwaitingQuotation'),
    QUOTATION_SENT: t('funnelQuotationSent'),
    CONFIRMED_OR_LATER: t('funnelConfirmedOrLater'),
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <DateRangeControls
          labels={{
            today: t('dateRangeToday'),
            thisWeek: t('dateRangeThisWeek'),
            thisMonth: t('dateRangeThisMonth'),
            allTime: t('dateRangeAllTime'),
            apply: t('dateRangeApply'),
            from: t('dateRangeFrom'),
            to: t('dateRangeTo'),
          }}
          minDate={DASHBOARD_EPOCH.toISOString().slice(0, 10)}
        />
        <div className="flex items-center gap-3">
          <p className="text-xs text-mist">{t('lastUpdated', { time: new Date(summary.generatedAt).toLocaleTimeString() })}</p>
          <ExportPdfButton
            labels={{
              exportPdf: t('exportPdf'),
              exportPdfSections: t('exportPdfSections'),
              exportPdfDownload: t('exportPdfDownload'),
              sectionLabel: {
                bookings: t('bookings'),
                revenue: t('revenue'),
                operations: t('operations'),
                staff: t('staffStats'),
                guest: t('guestStats'),
                customerExperience: t('customerExperience'),
                immigration: t('immigration'),
              },
            }}
          />
        </div>
      </div>

      <Reveal className="space-y-8">
        <p className="text-xs text-mist">{t('currencyNotice')}</p>
        <p className="text-xs text-mist">{t('dataStartsFrom', { date: DASHBOARD_EPOCH.toLocaleDateString() })}</p>

        {/* ---- Bookings ---- */}
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
          <Card className="mt-4">
            <p className="mb-2 text-xs text-mist">{t('bookingsTrend')}</p>
            <TrendLineChart
              points={summary.trends.bookings}
              color={categoricalColor(0)}
              formatValue={(v) => String(v)}
              formatPeriod={(p) => p}
            />
          </Card>
        </div>

        {/* ---- Revenue ---- */}
        <div>
          <SectionDivider />
          <p className="eyebrow text-mist">{t('revenue')}</p>
          <Card className="mt-2">
            <RevealGroup as="div" itemAs="div" className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[
                <StatTile key="revenue" label={t('revenueLabel')} value={formatMoneyByCurrency(summary.revenue.revenue)} />,
                <StatTile key="outstanding" label={t('outstanding')} value={formatMoneyByCurrency(summary.revenue.outstanding)} />,
                <StatTile key="avgBooking" label={t('averageBookingValue')} value={formatMoneyByCurrency(summary.revenue.averageBookingValue)} />,
                <StatTile key="discount" label={t('totalDiscountGiven')} value={formatMoneyByCurrency(summary.revenue.totalDiscountGiven)} />,
              ]}
            </RevealGroup>
          </Card>
          <Card className="mt-4">
            <RevealGroup as="div" itemAs="div" className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[
                <StatTile key="tax" label={t('taxCollected')} value={formatMoneyByCurrency(summary.revenue.taxCollected)} />,
                <StatTile key="fee" label={t('platformFeeCollected')} value={formatMoneyByCurrency(summary.revenue.platformFeeCollected)} />,
                <StatTile key="coupons" label={t('couponRedemptionCount')} value={String(summary.revenue.couponRedemptionCount)} />,
              ]}
            </RevealGroup>
            <div className="mt-4">
              <p className="mb-2 text-xs text-mist">{t('depositVsFullPaid')}</p>
              <SplitMeterBar
                segments={[
                  { label: t('depositPath'), value: summary.revenue.depositVsFullPaid.depositPathCount, color: categoricalColor(0) },
                  { label: t('fullPath'), value: summary.revenue.depositVsFullPaid.fullPathCount, color: categoricalColor(1) },
                ]}
              />
            </div>
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
          {summary.trends.revenue.length > 0 && (
            <Card className="mt-4 space-y-4">
              <p className="text-xs text-mist">{t('revenueTrend')}</p>
              {summary.trends.revenue.map((series) => (
                <div key={series.currency}>
                  <p className="mb-1 text-xs font-semibold text-navy">{series.currency}</p>
                  <TrendLineChart
                    points={series.points.map((p) => ({ periodStart: p.periodStart, value: p.amountMinor }))}
                    color={categoricalColor(0)}
                    formatValue={(v) => format(money(v, series.currency))}
                  />
                </div>
              ))}
            </Card>
          )}
        </div>

        {/* ---- Operations ---- */}
        <div>
          <SectionDivider />
          <p className="eyebrow text-mist">{t('operations')}</p>
          <Card className="mt-2">
            <div className="flex flex-wrap justify-around gap-4">
              <RingMeter label={t('fleetUtilization')} value={summary.operations.fleetUtilization} color={categoricalColor(0)} />
              <RingMeter label={t('driverUtilization')} value={summary.operations.driverUtilization} color={categoricalColor(1)} />
              <RingMeter label={t('guideUtilization')} value={summary.operations.guideUtilization} color={categoricalColor(2)} />
            </div>
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

        {/* ---- Staff (DR-155) ---- */}
        <div>
          <SectionDivider />
          <p className="eyebrow text-mist">{t('staffStats')}</p>
          <Card className="mt-2">
            <RevealGroup as="div" itemAs="div" className="grid grid-cols-3 gap-4">
              {[
                <StatTile key="active" label={t('activeStaff')} value={String(summary.staff.activeCount)} />,
                <StatTile key="deactivated" label={t('deactivatedStaff')} value={String(summary.staff.deactivatedCount)} />,
                <StatTile key="inactive" label={t('inactiveStaff')} value={String(summary.staff.inactiveCount)} />,
              ]}
            </RevealGroup>
            {byRoleSegments.length > 0 && (
              <div className="mt-4">
                <p className="mb-2 text-xs text-mist">{t('headcountByRole')}</p>
                <DonutChart segments={byRoleSegments} />
              </div>
            )}
          </Card>
          <Card className="mt-4 grid gap-4 sm:grid-cols-3">
            <div>
              <p className="mb-2 text-xs text-mist">{t('vehicles')}</p>
              <SplitMeterBar
                segments={Object.entries(summary.staff.fleetAvailability.vehicles).map(([status, count], i) => ({
                  label: tAvailability(status),
                  value: count ?? 0,
                  color: categoricalColor(i),
                }))}
              />
            </div>
            <div>
              <p className="mb-2 text-xs text-mist">{t('drivers')}</p>
              <SplitMeterBar
                segments={Object.entries(summary.staff.fleetAvailability.drivers).map(([status, count], i) => ({
                  label: tAvailability(status),
                  value: count ?? 0,
                  color: categoricalColor(i),
                }))}
              />
            </div>
            <div>
              <p className="mb-2 text-xs text-mist">{t('guides')}</p>
              <SplitMeterBar
                segments={Object.entries(summary.staff.fleetAvailability.guides).map(([status, count], i) => ({
                  label: tAvailability(status),
                  value: count ?? 0,
                  color: categoricalColor(i),
                }))}
              />
            </div>
          </Card>
        </div>

        {/* ---- Guest (DR-155) ---- */}
        <div>
          <SectionDivider />
          <p className="eyebrow text-mist">{t('guestStats')}</p>
          <Card className="mt-2">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="mb-2 text-xs text-mist">{t('newGuests')} / {t('returningGuests')}</p>
                <SplitMeterBar
                  segments={[
                    { label: t('newGuests'), value: summary.guest.newGuestCount, color: categoricalColor(0) },
                    { label: t('returningGuests'), value: summary.guest.returningGuestCount, color: categoricalColor(1) },
                  ]}
                />
              </div>
              <div>
                <p className="mb-2 text-xs text-mist">{t('originSplit')}</p>
                <SplitMeterBar
                  segments={[
                    { label: t('predefinedPackage'), value: summary.guest.originSplit.predefinedPackage, color: categoricalColor(0) },
                    { label: t('tailorMade'), value: summary.guest.originSplit.tailorMade, color: categoricalColor(1) },
                  ]}
                />
              </div>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {geographySegments.length > 0 && (
                <div>
                  <p className="mb-2 text-xs text-mist">{t('geography')}</p>
                  <DonutChart segments={geographySegments} />
                </div>
              )}
              <div>
                <StatTile label={t('cancellationRate')} value={`${Math.round(summary.guest.cancellationRate * 100)}%`} />
              </div>
            </div>
          </Card>
          <Card className="mt-4">
            <p className="mb-2 text-xs text-mist">{t('bookingStageFunnel')}</p>
            <FunnelChart
              stages={summary.guest.bookingStageFunnel.map((s) => ({ label: funnelStageLabel[s.stage] ?? s.stage, count: s.count }))}
              color={categoricalColor(0)}
            />
          </Card>
          <Card className="mt-4">
            <p className="mb-2 text-xs text-mist">{t('wizardFunnel')}</p>
            <FunnelChart stages={summary.wizardFunnel.map((s) => ({ label: tSteps(s.label), count: s.reachedCount }))} color={categoricalColor(1)} />
          </Card>
          {summary.trends.newGuests.length > 0 && (
            <Card className="mt-4">
              <p className="mb-2 text-xs text-mist">{t('newGuestsTrend')}</p>
              <TrendLineChart points={summary.trends.newGuests} color={categoricalColor(2)} />
            </Card>
          )}
        </div>

        {/* ---- Customer Experience ---- */}
        <div>
          <SectionDivider />
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

        {/* ---- Immigration ---- */}
        <div>
          <SectionDivider />
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
          <Card className="mt-4">
            <p className="mb-2 text-xs text-mist">{t('visaTrend')}</p>
            <TrendLineChart points={summary.trends.visaApplications} color={categoricalColor(3)} />
          </Card>
        </div>
      </Reveal>
    </div>
  );
}

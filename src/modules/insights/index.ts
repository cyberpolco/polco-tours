// insights module — public interface. Other modules import ONLY from here.
export { insightsService } from './service';
export {
  DASHBOARD_EPOCH,
  DASHBOARD_SECTION_KEYS,
  GUEST_GEOGRAPHY_NOT_COLLECTED,
  isDashboardSectionKey,
  isInsightsViewer,
} from './domain';
export type { PdfLocale } from './insights-pdf';
export type {
  BookingsSummary,
  BookingStageFunnelStage,
  CustomerExperienceSummary,
  DashboardSectionKey,
  DashboardSummary,
  DateRange,
  FleetAvailabilityBreakdown,
  GuestSummary,
  ImmigrationSummary,
  MoneyByCurrency,
  MoneyTrendPoint,
  MoneyTrendSeries,
  OperationsSummary,
  RevenueSummary,
  StaffSummary,
  TopPerformer,
  TrendData,
  TrendGranularity,
  TrendPoint,
} from './domain';

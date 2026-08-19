// insights module — public interface. Other modules import ONLY from here.
export { insightsService } from './service';
export { DASHBOARD_EPOCH, GUEST_GEOGRAPHY_NOT_COLLECTED, isInsightsViewer } from './domain';
export type {
  BookingsSummary,
  BookingStageFunnelStage,
  CustomerExperienceSummary,
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

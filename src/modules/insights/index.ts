// insights module — public interface. Other modules import ONLY from here.
export { insightsService } from './service';
export type {
  BookingsSummary,
  CustomerExperienceSummary,
  DashboardSummary,
  ImmigrationSummary,
  MoneyByCurrency,
  OperationsSummary,
  RevenueSummary,
  TopPerformer,
} from './domain';

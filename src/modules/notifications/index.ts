// notifications module — public interface. Other modules import ONLY from
// here. Nothing from gateway.ts is exported -- callers never see
// channel-level detail.
export { notificationsService } from './service';
export type { NotificationEvent } from './domain';

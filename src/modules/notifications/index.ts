// notifications module — public interface. Other modules import ONLY from
// here. Nothing from gateway.ts is exported -- callers never see
// channel-level detail.
export { notificationsService } from './service';
export type { EmailAttachment, NotificationData, NotificationEvent } from './domain';
// DR-217: the /staff/cms Emails tab reads these coded defaults/grouping to
// render its 27 template editors (prefill + placeholder hints) -- pure
// data, no cms/DB coupling leaks back into this module.
export { EMAIL_TEMPLATE_DEFAULTS, EMAIL_TEMPLATE_GROUPS, EMAIL_TEMPLATE_TOKENS } from './domain';
export type { EmailTemplateDefault } from './domain';

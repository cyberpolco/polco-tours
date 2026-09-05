// contact module — public interface. Other modules/routes may ONLY import
// from here, never reach into domain.ts/service.ts directly.
export { contactService } from './service';
export type { SubmitContactMessageResult } from './service';
export { CONTACT_TOPICS } from './domain';
export type { ContactTopic } from './domain';

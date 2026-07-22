// content module — public interface. Other modules import ONLY from here.
export { contentService } from './service';
export type { UploadContentImageInput } from './service';
export {
  CreateFaqEntryInput,
  SUPPORTED_LOCALES,
  UpdateFaqEntryInput,
  UpdateSiteContentInput,
  MAX_CONTENT_IMAGE_SIZE_BYTES,
} from './domain';
export type { ContentLocale, FaqEntryView, SiteContentView } from './domain';

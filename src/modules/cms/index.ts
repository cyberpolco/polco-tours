// cms module — public interface. Other modules import ONLY from here.
export { cmsService } from './service';
export type { UploadCmsImageInput } from './service';
export {
  CreateCmsFaqEntryInput,
  SUPPORTED_LOCALES,
  UpdateCmsFaqEntryInput,
  UpdateCmsTextBlockInput,
  MAX_CMS_IMAGE_SIZE_BYTES,
} from './domain';
export type { CmsLocale, CmsFaqEntryView, CmsTextBlockView } from './domain';

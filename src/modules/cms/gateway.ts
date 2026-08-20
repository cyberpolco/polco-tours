// cms module — Vercel Blob gateway, public-access variant. Thin re-export:
// the actual upload mechanics live in src/lib/public-image-blob.ts (DR-114,
// promoted so catalog module's package-image upload can reuse the same
// Vercel Blob capability under its own permission gate). Kept as a
// module-local re-export rather than switching every call site in this
// module to the shared lib directly, so nothing else about this module's
// structure/tests needs to change.
export {
  PublicImageBlobGatewayError as CmsBlobGatewayError,
  PublicImageCompressionError as CmsImageCompressionError,
  publicImageBlobGateway as cmsBlobGateway,
  type PublicImageBlobGateway as CmsBlobGateway,
  type PublicImageUploadResult as CmsImageUploadResult,
} from '@lib/public-image-blob';

'use server';

import { requireStaffContext } from '@lib/staff-guard';
import { catalogService } from '@modules/catalog';

// DR-264: shared by the new-package and edit-package forms' client-side
// PackageImageUploader -- the browser has already uploaded the raw file
// straight to Vercel Blob (see api/v1/catalog/package-image-upload/
// route.ts); this call's body is just a URL string, never the file bytes
// themselves, so it stays far under this app's Server Action body-size cap
// regardless of how large or how many images are involved.
export async function finalizePackageImageUploadAction(tempUrl: string): Promise<{ url: string }> {
  const ctx = await requireStaffContext('catalog.write');
  return catalogService.finalizePackageImageUpload(ctx, { tempUrl });
}

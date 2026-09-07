'use client';

import { useRef, useState } from 'react';
import { upload } from '@vercel/blob/client';
import { useTranslations } from 'next-intl';
import { finalizePackageImageUploadAction } from './image-upload-actions';

interface PackageImageUploaderProps {
  /** Namespace this page's other package-form strings already come from --
   * StaffPackages (new-package page) or StaffPackageDetail (edit page) --
   * both carry the same 'image'/'imagesHint'/'removeImage'/'uploadingImage'/
   * 'imageUploadFailed' keys (src/messages/en.json). */
  namespace: 'StaffPackages' | 'StaffPackageDetail';
  /** Hidden input name the finished (already-compressed) URLs are submitted
   * under -- 'imageUrls' on the create form; 'newImageUrls' on the edit
   * form, where kept existing images are tracked separately via
   * removeImages checkboxes rendered by the page itself. */
  fieldName: string;
  /** Forwarded from FormField's cloneElement (its `htmlFor`) onto the real
   * file input, so clicking the label still focuses/opens the picker. */
  id?: string;
}

interface PendingImage {
  id: string;
  url: string;
  status: 'uploading' | 'done' | 'error';
}

// DR-264: replaces the plain `<input type="file" name="images" multiple>`
// that used to submit raw bytes through createPackageAction/
// updatePackageAction's Server Action. Each picked file now uploads
// straight to Vercel Blob from the browser (bypassing this app's Server
// Action body-size ceiling), then a small follow-up call
// (finalizePackageImageUploadAction) fetches those bytes back server-side,
// compresses them through the exact same DR-163 webp pipeline every other
// image upload uses, and returns the final url -- rendered here as a
// hidden input under `fieldName` so the surrounding <form action={...}>
// still submits it exactly like any other field, with no file bytes in
// that request at all.
export function PackageImageUploader({ namespace, fieldName, id }: PackageImageUploaderProps) {
  const t = useTranslations(namespace);
  const inputRef = useRef<HTMLInputElement>(null);
  const [images, setImages] = useState<PendingImage[]>([]);

  async function handleFiles(files: FileList) {
    for (const file of Array.from(files)) {
      const id = crypto.randomUUID();
      setImages((prev) => [...prev, { id, url: '', status: 'uploading' }]);
      try {
        const blob = await upload(`package-images/raw/${crypto.randomUUID()}-${file.name}`, file, {
          access: 'public',
          contentType: file.type,
          handleUploadUrl: '/api/v1/catalog/package-image-upload',
        });
        const { url } = await finalizePackageImageUploadAction(blob.url);
        setImages((prev) => prev.map((img) => (img.id === id ? { ...img, url, status: 'done' } : img)));
      } catch {
        // Covers a rejected client token (wrong type/too large), a network
        // failure mid-upload, and a rejected finalize call alike -- staff
        // just need to know that one didn't make it, same generic-message
        // convention as the guest passport uploader.
        setImages((prev) => prev.map((img) => (img.id === id ? { ...img, status: 'error' } : img)));
      }
    }
  }

  function removePending(id: string) {
    setImages((prev) => prev.filter((img) => img.id !== id));
  }

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        id={id}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) void handleFiles(e.target.files);
          if (inputRef.current) inputRef.current.value = '';
        }}
        className="w-full rounded-survey border border-rule px-3 py-2 file:mr-3 file:rounded-pill file:border-0 file:bg-navy file:px-3 file:py-1 file:text-sm file:text-bone"
      />
      {images.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {images.map((img) => (
            <div key={img.id} className="flex flex-col items-start gap-1">
              {img.status === 'uploading' && (
                <div className="flex h-24 w-40 items-center justify-center rounded-survey border border-dashed border-rule text-center text-xs text-mist">
                  {t('uploadingImage')}
                </div>
              )}
              {img.status === 'error' && (
                <div className="flex h-24 w-40 items-center justify-center rounded-survey border border-dashed border-amber text-center text-xs text-amber">
                  {t('imageUploadFailed')}
                </div>
              )}
              {img.status === 'done' && (
                // eslint-disable-next-line @next/next/no-img-element -- a staff-only settings-form thumbnail, not the guest-facing PackageImage component.
                <img src={img.url} alt="" className="h-24 w-40 rounded-survey object-cover" />
              )}
              {img.status === 'done' && <input type="hidden" name={fieldName} value={img.url} />}
              {img.status !== 'uploading' && (
                <button type="button" onClick={() => removePending(img.id)} className="text-xs text-mist underline">
                  {t('removeImage')}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

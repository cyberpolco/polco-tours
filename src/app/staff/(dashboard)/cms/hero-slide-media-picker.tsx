'use client';

import { useRef, useState } from 'react';
import { upload } from '@vercel/blob/client';
import { useRouter } from 'next/navigation';
import { setHeroSlideMediaAction, uploadHeroSlideImageAction } from './actions';

interface HeroSlideMediaPickerProps {
  slotKey: string;
  uploadingLabel: string;
  chooseFileLabel: string;
  errorLabel: string;
}

// DR-163: the one client component in this module. Branches by the chosen
// file's MIME type -- an image is small enough to proxy through the
// existing Server-Action-with-FormData path (server-side sharp
// compression); a video is uploaded directly from the browser to Vercel
// Blob via @vercel/blob/client's upload(), bypassing this app's server
// entirely, since a 25MB file exceeds Vercel serverless functions' request
// body limit. Either way, the resulting url is then attached to the slide
// via setHeroSlideMediaAction. router.refresh() is needed because this
// component calls the Server Actions directly (not via a <form action>
// transition), so revalidatePath alone won't re-render this already-
// mounted client tree.
export function HeroSlideMediaPicker({ slotKey, uploadingLabel, chooseFileLabel, errorLabel }: HeroSlideMediaPickerProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  async function handleFile(file: File) {
    setPending(true);
    setError(false);
    try {
      if (file.type.startsWith('image/')) {
        const formData = new FormData();
        formData.set('file', file);
        const { url } = await uploadHeroSlideImageAction(formData);
        await setHeroSlideMediaAction(slotKey, 'image', url);
      } else if (file.type.startsWith('video/')) {
        const blob = await upload(`cms-media/${slotKey}-${Date.now()}-${file.name}`, file, {
          access: 'public',
          handleUploadUrl: '/api/v1/cms/media-upload',
        });
        await setHeroSlideMediaAction(slotKey, 'video', blob.url);
      } else {
        setError(true);
        return;
      }
      router.refresh();
    } catch {
      setError(true);
    } finally {
      setPending(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,video/mp4,video/webm"
        disabled={pending}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
        }}
        className="text-sm"
      />
      {pending && <p className="text-xs text-mist">{uploadingLabel}</p>}
      {!pending && <p className="text-xs text-mist">{chooseFileLabel}</p>}
      {error && <p className="text-xs text-amber">{errorLabel}</p>}
    </div>
  );
}

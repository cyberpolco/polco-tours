'use client';

import { useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { upload } from '@vercel/blob/client';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';

// DR-216 (deferred since DR-163, done in DR-257): the browser uploads the
// PDF straight to Vercel Blob, then hands only the resulting pathname to a
// Server Action. Previously the bytes were proxied through the action
// itself, which capped uploads at Vercel's ~4.5MB request-body limit --
// well under the 10MB this app tells guests it accepts, so a valid passport
// could fail at the platform boundary with no useful error.
//
// `access: 'private'` targets the private documents store: nothing uploaded
// here is ever publicly readable. The route that mints the token constrains
// it to PDF, 10MB and a random suffix, and the recording action re-reads the
// stored file's own metadata rather than trusting anything from here.
interface PassportUploadFormProps {
  /** Records the finished upload. Bound to its traveller by the caller. */
  recordAction: (pathname: string) => Promise<void>;
  /** Where to land once this traveller's passport is stored. */
  nextHref: string;
}

export function PassportUploadForm({ recordAction, nextHref }: PassportUploadFormProps) {
  const t = useTranslations('PassportPage');
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<'missing' | 'failed' | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const file = inputRef.current?.files?.[0];
    if (!file) {
      setError('missing');
      return;
    }
    setError(null);
    setPending(true);
    try {
      const blob = await upload(file.name, file, {
        access: 'private',
        contentType: file.type,
        handleUploadUrl: '/api/v1/documents/passport-upload',
      });
      await recordAction(blob.pathname);
      router.push(nextHref);
      router.refresh();
    } catch {
      // Covers a rejected client token (wrong type/too large), a network
      // failure mid-upload, and a rejected recordAction alike -- the guest
      // just needs to know it didn't save, and nothing was recorded.
      setError('failed');
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-4">
      {error && <Alert tone="error">{error === 'missing' ? t('choosePdfFile') : t('uploadFailed')}</Alert>}
      <FormField label={t('passportPdfLabel')} htmlFor="passport">
        <input
          ref={inputRef}
          id="passport"
          type="file"
          name="passport"
          accept="application/pdf"
          required
          className="w-full rounded-survey border border-rule px-3 py-2 file:mr-3 file:rounded-pill file:border-0 file:bg-amber/10 file:px-3 file:py-1 file:text-sm file:font-semibold file:text-navy"
        />
      </FormField>
      <Button type="submit" disabled={pending}>
        {pending ? t('uploading') : t('uploadAndContinue')}
      </Button>
    </form>
  );
}

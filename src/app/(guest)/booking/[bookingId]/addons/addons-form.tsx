'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { SelectableCard } from '@/components/ui/SelectableCard';
import { format, money, type Currency } from '@lib/money';
import { finalizeAddonsAction } from './actions';

interface AddonOption {
  id: string;
  name: string;
  priceMinor: number;
  currency: Currency;
}

interface Props {
  bookingId: string;
  addons: AddonOption[];
  selectedIds: string[];
  alreadyFinalized: boolean;
  emptyMessage: string;
}

// Client-driven submit (mirrors book/[departureId]/booking-form.tsx's own
// router.push pattern) instead of the usual <form action={...}> + redirect()
// convention -- this step's server response was confirmed reliable via a
// real CI trace, but the browser's router occasionally never acted on the
// redirect it carried. router.push() after an already-resolved promise is
// a plain client-side call with none of that redirect-header handling.
export function AddonsForm({ bookingId, addons, selectedIds, alreadyFinalized, emptyMessage }: Props) {
  const router = useRouter();
  const t = useTranslations('AddonsPage');
  const tCommon = useTranslations('Common');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const selected = new Set(selectedIds);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(false);
    setPending(true);
    // Build FormData before any await -- React nulls out e.currentTarget
    // once the synchronous portion of the handler returns (same gotcha
    // documented in booking-form.tsx).
    const formData = new FormData(e.currentTarget);
    try {
      const result = await finalizeAddonsAction(bookingId, formData);
      if ('error' in result) {
        setError(true);
        return;
      }
      router.push(`/booking/${bookingId}/travelers/new`);
    } catch {
      // Same "never let an uncaught throw become an invisible unhandled
      // promise rejection" concern as booking-form.tsx's own catch --
      // there's no <form action>/useActionState wiring here either to
      // surface an error on our behalf.
      setError(true);
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-3">
      {error && <Alert tone="error">{t('saveError')}</Alert>}
      {addons.length === 0 ? (
        <p className="text-sm text-mist">{emptyMessage}</p>
      ) : (
        addons.map((a) => (
          <SelectableCard
            key={a.id}
            type="checkbox"
            name="addonServiceId"
            value={a.id}
            defaultChecked={selected.has(a.id)}
          >
            <span className="flex flex-1 items-center justify-between">
              <span>{a.name}</span>
              <span className="text-mist">{format(money(a.priceMinor, a.currency))}</span>
            </span>
          </SelectableCard>
        ))
      )}
      <Button type="submit" disabled={pending}>
        {pending ? tCommon('saving') : alreadyFinalized ? t('saveChanges') : t('continueLabel')}
      </Button>
    </form>
  );
}

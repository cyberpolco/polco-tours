'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { AddonCode } from '@prisma/client';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { EsimPlanPicker, type EsimPlanOption, type EsimSelection } from '@/components/ui/EsimPlanPicker';
import { FlightTicketPicker, type FlightFareOption, type FlightSelection } from '@/components/ui/FlightTicketPicker';
import { SelectableCard } from '@/components/ui/SelectableCard';
import { format, formatOrPending, money, type Currency } from '@lib/money';
import { finalizeAddonsAction } from './actions';

interface AddonOption {
  id: string;
  name: string;
  priceMinor: number;
  currency: Currency;
  code: AddonCode;
}

interface Props {
  bookingId: string;
  addons: AddonOption[];
  selectedIds: string[];
  alreadyFinalized: boolean;
  emptyMessage: string;
  // DR-184: the destination country's own government/immigration fee --
  // distinct from this add-on's own priceMinor/currency above (that's the
  // guest-facing assistance service fee; this is what the country charges).
  governmentFeeMinor: number | null;
  governmentFeeCurrency: Currency | null;
  // DR-222: null when this package/org doesn't offer the FLIGHT_TICKET/ESIM
  // add-on at all -- no picker renders in that case, same "hide, don't
  // fall back" posture as the flat-priced list above.
  flightAddonId: string | null;
  flightOptions: FlightFareOption[];
  existingFlightSelections: FlightSelection[];
  esimAddonId: string | null;
  esimPlans: EsimPlanOption[];
  existingEsimSelections: EsimSelection[];
}

// Client-driven submit (mirrors book/[departureId]/booking-form.tsx's own
// router.push pattern) instead of the usual <form action={...}> + redirect()
// convention -- this step's server response was confirmed reliable via a
// real CI trace, but the browser's router occasionally never acted on the
// redirect it carried. router.push() after an already-resolved promise is
// a plain client-side call with none of that redirect-header handling.
export function AddonsForm({
  bookingId,
  addons,
  selectedIds,
  alreadyFinalized,
  emptyMessage,
  governmentFeeMinor,
  governmentFeeCurrency,
  flightAddonId,
  flightOptions,
  existingFlightSelections,
  esimAddonId,
  esimPlans,
  existingEsimSelections,
}: Props) {
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
          <div key={a.id}>
            <SelectableCard type="checkbox" name="addonServiceId" value={a.id} defaultChecked={selected.has(a.id)}>
              <span className="flex flex-1 items-center justify-between">
                <span>{a.name}</span>
                <span className="text-mist">{format(money(a.priceMinor, a.currency))}</span>
              </span>
            </SelectableCard>
            {a.code === 'VISA_ASSISTANCE' && (
              <p className="mt-1 px-1 text-xs text-mist">
                {t('governmentFeeEstimate', { amount: formatOrPending(governmentFeeMinor, governmentFeeCurrency, t('governmentFeeUnspecified')) })}
                {' '}
                {t('governmentFeeDisclaimer')}
              </p>
            )}
          </div>
        ))
      )}
      {flightAddonId && (
        <FlightTicketPicker addonServiceId={flightAddonId} options={flightOptions} initialSelections={existingFlightSelections} />
      )}
      {esimAddonId && <EsimPlanPicker addonServiceId={esimAddonId} plans={esimPlans} initialSelections={existingEsimSelections} />}
      <Button type="submit" disabled={pending}>
        {pending ? tCommon('saving') : alreadyFinalized ? t('saveChanges') : t('continueLabel')}
      </Button>
    </form>
  );
}

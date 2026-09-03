'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from './Button';
import { format, money, type Currency } from '@lib/money';

// One row per currently-effective (country, data-plan tier) combination --
// financeService.listPublicEsimPlans(country) already scopes/sorts by the
// booking's own country, so every row here is offerable as-is (unlike
// FlightTicketPicker, there's only one axis: no cascading needed).
export interface EsimPlanOption {
  dataAllowanceGb: number;
  priceMinor: number;
  currency: Currency;
}

// The shape carried in each `esimSelection` hidden field -- also used to
// pre-populate an already-saved selection.
export interface EsimSelection {
  dataAllowanceGb: number;
  priceMinor: number;
  currency: Currency;
}

interface EsimPlanPickerProps {
  addonServiceId: string;
  plans: EsimPlanOption[];
  initialSelections: EsimSelection[];
}

/** Flat data-plan-tier picker for the ESIM add-on (DR-222) -- each currently
 * priced plan (5GB/10GB/20GB/...) is its own "Add" button; accepted picks
 * render as removable rows carrying a hidden `<input name="esimSelection">`
 * JSON field, same convention as FlightTicketPicker. A plain client
 * component, safe to nest inside either the guest form's own <form> or the
 * staff page's Server Action <form action={...}>. */
export function EsimPlanPicker({ addonServiceId, plans, initialSelections }: EsimPlanPickerProps) {
  const t = useTranslations('AddonVariantPicker');
  const tAddons = useTranslations('TripAddons');
  const [selections, setSelections] = useState<EsimSelection[]>(initialSelections);

  function addSelection(plan: EsimPlanOption) {
    setSelections((prev) => [...prev, { ...plan }]);
  }

  function removeSelection(index: number) {
    setSelections((prev) => prev.filter((_, i) => i !== index));
  }

  return (
    <div className="rounded-card border border-rule p-3">
      <p className="eyebrow text-mist">{tAddons('ESIM')}</p>

      {selections.length > 0 && (
        <ul className="mt-2 space-y-2">
          {selections.map((s, i) => (
            <li key={i} className="flex items-center justify-between gap-2 rounded-survey bg-bone px-3 py-2 text-sm">
              <span>
                {t('dataPlanLabel', { gb: s.dataAllowanceGb })} &middot; {format(money(s.priceMinor, s.currency))}
              </span>
              <button type="button" onClick={() => removeSelection(i)} className="shrink-0 text-xs text-amber underline">
                {t('remove')}
              </button>
              <input
                type="hidden"
                name="esimSelection"
                value={JSON.stringify({ addonServiceId, dataAllowanceGb: s.dataAllowanceGb })}
              />
            </li>
          ))}
        </ul>
      )}

      {plans.length === 0 ? (
        <p className="mt-2 text-sm text-mist">{t('noEsimPlans')}</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {plans.map((p) => (
            <li key={p.dataAllowanceGb} className="flex items-center justify-between gap-3 rounded-survey border border-rule px-3 py-2 text-sm">
              <span>
                {t('dataPlanLabel', { gb: p.dataAllowanceGb })} &mdash; {format(money(p.priceMinor, p.currency))}
              </span>
              <Button type="button" variant="secondary" size="compact" onClick={() => addSelection(p)}>
                {t('addEsimPlan')}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

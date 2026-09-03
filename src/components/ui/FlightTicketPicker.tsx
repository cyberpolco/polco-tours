'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { FlightClass } from '@prisma/client';
import { Button } from './Button';
import { FormField } from './FormField';
import { Select } from './Select';
import { format, money, type Currency } from '@lib/money';

// DR-222: one row per currently-effective (route, airline, class) combination
// -- already-joined origin/destination airport labels (the raw
// FlightFareRateView from financeService.listPublicFlightFareOptions only
// carries airport ids; the page joins in financeService.listPublicAirports
// before handing this down, since this component has no DB access of its
// own). The cascading picker below only ever lets the guest/staff pick a
// combination that actually appears in this list.
export interface FlightFareOption {
  originAirportId: string;
  originLabel: string;
  destinationAirportId: string;
  destinationLabel: string;
  airline: string;
  flightClass: FlightClass;
  priceMinor: number;
  currency: Currency;
}

// The shape carried in each `flightSelection` hidden field -- also used to
// pre-populate an already-saved selection (see this component's own
// `initialSelections` prop / the page's own read of bookingService.listAddons).
export interface FlightSelection {
  originAirportId: string;
  originLabel: string;
  destinationAirportId: string;
  destinationLabel: string;
  airline: string;
  flightClass: FlightClass;
  priceMinor: number;
  currency: Currency;
}

interface FlightTicketPickerProps {
  addonServiceId: string;
  options: FlightFareOption[];
  initialSelections: FlightSelection[];
}

/** Cascading Origin -> Destination -> Airline -> Class picker for the
 * FLIGHT_TICKET add-on (DR-222). Every dropdown is filtered down to only the
 * combinations that actually exist among `options` (each already-priced
 * FlightFareRate row), so a guest/staff member can never build a combination
 * with no configured price. A plain client component with hidden `<input
 * name="flightSelection">` fields per accepted selection -- it renders fine
 * either inside another client component's own <form> (the guest page) or
 * nested inside a Server Component's <form action={...}> (the staff page),
 * same convention as MapLocationPicker. */
export function FlightTicketPicker({ addonServiceId, options, initialSelections }: FlightTicketPickerProps) {
  const t = useTranslations('AddonVariantPicker');
  const tAddons = useTranslations('TripAddons');
  const tFlightClass = useTranslations('FlightClassLabel');
  const [originId, setOriginId] = useState('');
  const [destinationId, setDestinationId] = useState('');
  const [airline, setAirline] = useState('');
  const [flightClass, setFlightClass] = useState<FlightClass | ''>('');
  const [selections, setSelections] = useState<FlightSelection[]>(initialSelections);

  const origins = useMemo(() => {
    const seen = new Map<string, string>();
    for (const o of options) if (!seen.has(o.originAirportId)) seen.set(o.originAirportId, o.originLabel);
    return [...seen.entries()];
  }, [options]);

  const destinations = useMemo(() => {
    const seen = new Map<string, string>();
    for (const o of options) {
      if (o.originAirportId !== originId) continue;
      if (!seen.has(o.destinationAirportId)) seen.set(o.destinationAirportId, o.destinationLabel);
    }
    return [...seen.entries()];
  }, [options, originId]);

  const airlines = useMemo(() => {
    const seen = new Set<string>();
    for (const o of options) {
      if (o.originAirportId === originId && o.destinationAirportId === destinationId) seen.add(o.airline);
    }
    return [...seen];
  }, [options, originId, destinationId]);

  const flightClasses = useMemo(() => {
    const seen = new Set<FlightClass>();
    for (const o of options) {
      if (o.originAirportId === originId && o.destinationAirportId === destinationId && o.airline === airline) {
        seen.add(o.flightClass);
      }
    }
    return [...seen];
  }, [options, originId, destinationId, airline]);

  const matched = useMemo(
    () =>
      options.find(
        (o) =>
          o.originAirportId === originId &&
          o.destinationAirportId === destinationId &&
          o.airline === airline &&
          o.flightClass === flightClass,
      ) ?? null,
    [options, originId, destinationId, airline, flightClass],
  );

  function addSelection() {
    if (!matched) return;
    setSelections((prev) => [...prev, { ...matched }]);
    setOriginId('');
    setDestinationId('');
    setAirline('');
    setFlightClass('');
  }

  function removeSelection(index: number) {
    setSelections((prev) => prev.filter((_, i) => i !== index));
  }

  return (
    <div className="rounded-card border border-rule p-3">
      <p className="eyebrow text-mist">{tAddons('FLIGHT_TICKET')}</p>

      {selections.length > 0 && (
        <ul className="mt-2 space-y-2">
          {selections.map((s, i) => (
            <li key={i} className="flex items-center justify-between gap-2 rounded-survey bg-bone px-3 py-2 text-sm">
              <span>
                {s.originLabel} &rarr; {s.destinationLabel} &middot; {s.airline} &middot; {tFlightClass(s.flightClass)} &middot;{' '}
                {format(money(s.priceMinor, s.currency))}
              </span>
              <button type="button" onClick={() => removeSelection(i)} className="shrink-0 text-xs text-amber underline">
                {t('remove')}
              </button>
              <input
                type="hidden"
                name="flightSelection"
                value={JSON.stringify({
                  addonServiceId,
                  originAirportId: s.originAirportId,
                  destinationAirportId: s.destinationAirportId,
                  airline: s.airline,
                  flightClass: s.flightClass,
                })}
              />
            </li>
          ))}
        </ul>
      )}

      {options.length === 0 ? (
        <p className="mt-2 text-sm text-mist">{t('noFlightOptions')}</p>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <FormField label={t('originAirport')} htmlFor={`${addonServiceId}-origin`}>
              <Select
                value={originId}
                onChange={(e) => {
                  setOriginId(e.target.value);
                  setDestinationId('');
                  setAirline('');
                  setFlightClass('');
                }}
              >
                <option value="">{t('selectPlaceholder')}</option>
                {origins.map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label={t('destinationAirport')} htmlFor={`${addonServiceId}-destination`}>
              <Select
                value={destinationId}
                disabled={!originId}
                onChange={(e) => {
                  setDestinationId(e.target.value);
                  setAirline('');
                  setFlightClass('');
                }}
              >
                <option value="">{originId ? t('selectPlaceholder') : t('selectOriginFirst')}</option>
                {destinations.map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label={t('airline')} htmlFor={`${addonServiceId}-airline`}>
              <Select
                value={airline}
                disabled={!destinationId}
                onChange={(e) => {
                  setAirline(e.target.value);
                  setFlightClass('');
                }}
              >
                <option value="">{destinationId ? t('selectPlaceholder') : t('selectDestinationFirst')}</option>
                {airlines.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label={t('flightClass')} htmlFor={`${addonServiceId}-class`}>
              <Select value={flightClass} disabled={!airline} onChange={(e) => setFlightClass(e.target.value as FlightClass)}>
                <option value="">{airline ? t('selectPlaceholder') : t('selectAirlineFirst')}</option>
                {flightClasses.map((c) => (
                  <option key={c} value={c}>
                    {tFlightClass(c)}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>

          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="text-sm text-mist">{matched ? format(money(matched.priceMinor, matched.currency)) : t('selectFullCombination')}</span>
            <Button type="button" variant="secondary" size="compact" disabled={!matched} onClick={addSelection}>
              {t('addFlight')}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Select } from '@/components/ui/Select';

const OTHER_SENTINEL = '__other__';

interface SelectOrOtherProps {
  name: string;
  options: string[];
  defaultValue?: string;
  placeholder?: string;
  otherLabel?: string;
  required?: boolean;
  id?: string;
  className?: string;
  /** Fires with the resolved value (preset pick or typed text) on every
   * change -- lets a parent field (e.g. vehicle Model) react to this one's
   * current value (e.g. vehicle Make) without either field needing to know
   * about the other's internals. */
  onValueChange?: (value: string) => void;
}

// A native <select> of curated options + a trailing "Other" that reveals a
// free-text input -- for a field the backend deliberately keeps free-text
// (see vehicle-catalog.ts's own comment) where a fixed dropdown would
// otherwise block entering a real value that isn't in the curated list.
// Whichever mode is active, the actually-submitted value lives on one
// hidden input under `name`, so the server action reading FormData.get(name)
// needs no changes regardless of which mode produced it.
//
// `defaultValue` not being in `options` is not an error -- it's the normal
// shape for an existing record whose value predates or falls outside the
// curated list (e.g. editing a vehicle entered before this list existed,
// or with a genuinely one-off make/model). That value is never silently
// dropped: the field just opens already in "Other" mode, pre-filled.
export function SelectOrOther({
  name,
  options,
  defaultValue = '',
  placeholder,
  otherLabel,
  required,
  id,
  className,
  onValueChange,
}: SelectOrOtherProps) {
  const t = useTranslations('Common');
  const resolvedOtherLabel = otherLabel ?? t('otherNotListed');
  const defaultIsOther = defaultValue !== '' && !options.includes(defaultValue);
  const [mode, setMode] = useState<'preset' | 'other'>(defaultIsOther ? 'other' : 'preset');
  const [presetValue, setPresetValue] = useState(defaultIsOther ? '' : defaultValue);
  const [otherValue, setOtherValue] = useState(defaultIsOther ? defaultValue : '');

  const resolvedValue = mode === 'other' ? otherValue : presetValue;

  function emit(next: string) {
    onValueChange?.(next);
  }

  return (
    <div className="space-y-2">
      {/* The hidden input carries the real submitted value; native
          constraint validation is excluded from type="hidden" fields by
          spec (same gotcha SearchableSelect works around), so `required`
          is instead applied directly to whichever control is actually
          visible below -- the select's own blank placeholder option
          satisfies it in "preset" mode, and the text input satisfies it
          in "other" mode, both via ordinary browser behavior. */}
      <input type="hidden" name={name} value={resolvedValue} />
      <Select
        id={id}
        required={required}
        value={mode === 'other' ? OTHER_SENTINEL : presetValue}
        onChange={(e) => {
          const next = e.target.value;
          if (next === OTHER_SENTINEL) {
            setMode('other');
            emit(otherValue);
          } else {
            setMode('preset');
            setPresetValue(next);
            emit(next);
          }
        }}
        className={className}
      >
        <option value="">{t('select')}</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
        <option value={OTHER_SENTINEL}>{resolvedOtherLabel}</option>
      </Select>
      {mode === 'other' && (
        <input
          type="text"
          value={otherValue}
          placeholder={placeholder}
          required={required}
          autoFocus
          onChange={(e) => {
            setOtherValue(e.target.value);
            emit(e.target.value);
          }}
          className="w-full rounded-survey border border-rule px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber/60"
        />
      )}
    </div>
  );
}

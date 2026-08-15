'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { SearchableOption } from './SearchableSelect';

interface MultiSearchableSelectProps {
  name: string;
  options: SearchableOption[];
  defaultValues?: string[];
  placeholder?: string;
  className?: string;
  id?: string;
}

// Multi-selection counterpart to SearchableSelect (DR-116) -- built for the
// package day-plan form's Activities picker, which needs to pick several
// items out of a potentially large, cross-site list. Each chosen id gets its
// own `<input type="hidden" name={name}>` (same name repeated), so the
// server reads the whole set back via `formData.getAll(name)` -- the same
// "same name, many inputs" submission convention SelectableCard's checkbox
// grid already uses, just generated from picks instead of a fixed grid.
export function MultiSearchableSelect({ name, options, defaultValues, placeholder, className, id }: MultiSearchableSelectProps) {
  const t = useTranslations('Common');
  const [selectedIds, setSelectedIds] = useState<string[]>(defaultValues ?? []);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const byId = useMemo(() => new Map(options.map((o) => [o.value, o])), [options]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const candidates = options.filter((o) => !selectedIds.includes(o.value));
    if (!q) return candidates;
    return candidates.filter((o) => o.searchText.includes(q));
  }, [query, options, selectedIds]);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [open]);

  function add(option: SearchableOption) {
    setSelectedIds((prev) => (prev.includes(option.value) ? prev : [...prev, option.value]));
    setQuery('');
  }

  function remove(value: string) {
    setSelectedIds((prev) => prev.filter((v) => v !== value));
  }

  return (
    <div className="relative" ref={containerRef}>
      {selectedIds.map((v) => (
        <input key={v} type="hidden" name={name} value={v} />
      ))}
      {selectedIds.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-2">
          {selectedIds.map((v) => {
            const option = byId.get(v);
            return (
              <li key={v} className="flex items-center gap-1 rounded-full border border-rule bg-bone px-2 py-1 text-xs">
                {option?.label ?? v}
                <button type="button" onClick={() => remove(v)} className="text-mist hover:text-ink" aria-label={t('remove')}>
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <input
        ref={inputRef}
        id={id}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        value={query}
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onBlur={() => {
          setTimeout(() => setOpen(false), 150);
        }}
        className={
          className ??
          'w-full rounded-survey border border-rule px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber/60'
        }
      />
      {open && filtered.length > 0 && (
        <ul id={listId} role="listbox" className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-card border border-rule bg-bone shadow-card">
          {filtered.map((o) => (
            <li key={o.value} role="option" aria-selected={false}>
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm hover:bg-rule/40"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => add(o)}
              >
                {o.hint ? `${o.hint} ` : ''}
                {o.label}
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && query.trim() && filtered.length === 0 && <p className="mt-1 text-sm text-mist">{t('noMatches')}</p>}
    </div>
  );
}

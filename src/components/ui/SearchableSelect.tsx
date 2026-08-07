'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';

export interface SearchableOption {
  value: string;
  label: string;
  /** Lowercased text this option matches against (e.g. name + email). */
  searchText: string;
  /** Short prefix shown before the label in the dropdown, e.g. "★". */
  hint?: string;
}

interface SearchableSelectProps {
  name: string;
  options: SearchableOption[];
  defaultValue?: string;
  placeholder?: string;
  /** Label for the "clear selection" row -- omit to make a selection required. */
  emptyLabel?: string;
  className?: string;
  /** Forwarded onto the visible text input -- FormField clones this in for
   * label htmlFor linkage, same convention as every other FormField child. */
  id?: string;
  /** Blocks native form submission until a real option is chosen -- the
   * submitted value lives on a hidden input, and the `required` attribute
   * has no effect on type="hidden" (excluded from constraint validation by
   * spec), so this is enforced via setCustomValidity on the visible input
   * instead. */
  required?: boolean;
}

// A dependency-free combobox (text input + filtered dropdown + a hidden
// input carrying the actual submitted value) -- built for the staff
// assignment form's guide picker, which needs "search by name or email"
// over a small (single-org) candidate list. Native <select> has no
// substring search, and <datalist> can't bind free-typed text back to a
// stable id, so this is the minimal custom control that does both without
// adding a combobox library.
export function SearchableSelect({
  name,
  options,
  defaultValue,
  placeholder,
  emptyLabel,
  className,
  id,
  required,
}: SearchableSelectProps) {
  const initial = options.find((o) => o.value === defaultValue);
  const [query, setQuery] = useState(initial?.label ?? '');
  const [selectedValue, setSelectedValue] = useState(defaultValue ?? '');
  const [open, setOpen] = useState(false);
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.searchText.includes(q));
  }, [query, options]);

  useEffect(() => {
    if (!required) return;
    inputRef.current?.setCustomValidity(selectedValue ? '' : 'Please select an option from the list.');
  }, [required, selectedValue]);

  // The dropdown is absolutely positioned and can overlap page content below
  // it (e.g. a submit button) -- relying on the input's own onBlur to close
  // it isn't enough, since a click on an inert "No matches" row (or any
  // non-focusable area) never moves focus, so the input never blurs and the
  // dropdown stays open, permanently intercepting clicks underneath it.
  // Standard combobox fix: also close on any click outside the component.
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

  function choose(option: SearchableOption | null) {
    setQuery(option?.label ?? '');
    setSelectedValue(option?.value ?? '');
    setOpen(false);
  }

  return (
    <div className="relative" ref={containerRef}>
      <input type="hidden" name={name} value={selectedValue} />
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
          setSelectedValue(''); // typing invalidates the previous pick until a suggestion is chosen again
          setOpen(true);
        }}
        onBlur={() => {
          // Delay so a suggestion's onClick fires before the list unmounts.
          setTimeout(() => setOpen(false), 150);
        }}
        className={
          className ??
          'w-full rounded-survey border border-rule px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber/60'
        }
      />
      {/* Only render the absolutely-positioned overlay when it has something
          operable in it -- it's taken out of document flow (`absolute`), so
          whatever follows the field in the form (often a submit button) is
          never pushed down to make room for it, and a real user's click
          lands on whatever's topmost at that point, not what's underneath.
          An empty-of-options overlay left open has nothing to offer and
          nothing to lose by not blocking the page -- render the "no
          matches" hint as plain inline text instead, which doesn't overlap
          anything. */}
      {open && (emptyLabel || filtered.length > 0) && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-card border border-rule bg-bone shadow-card"
        >
          {emptyLabel && (
            <li>
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm text-mist hover:bg-rule/40"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(null)}
              >
                {emptyLabel}
              </button>
            </li>
          )}
          {filtered.map((o) => (
            <li key={o.value} role="option" aria-selected={o.value === selectedValue}>
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm hover:bg-rule/40"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(o)}
              >
                {o.hint ? `${o.hint} ` : ''}
                {o.label}
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && !emptyLabel && filtered.length === 0 && <p className="mt-1 text-sm text-mist">No matches</p>}
    </div>
  );
}

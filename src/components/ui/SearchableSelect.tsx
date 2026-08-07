'use client';

import { useId, useMemo, useState } from 'react';

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
}

// A dependency-free combobox (text input + filtered dropdown + a hidden
// input carrying the actual submitted value) -- built for the staff
// assignment form's guide picker, which needs "search by name or email"
// over a small (single-org) candidate list. Native <select> has no
// substring search, and <datalist> can't bind free-typed text back to a
// stable id, so this is the minimal custom control that does both without
// adding a combobox library.
export function SearchableSelect({ name, options, defaultValue, placeholder, emptyLabel, className, id }: SearchableSelectProps) {
  const initial = options.find((o) => o.value === defaultValue);
  const [query, setQuery] = useState(initial?.label ?? '');
  const [selectedValue, setSelectedValue] = useState(defaultValue ?? '');
  const [open, setOpen] = useState(false);
  const listId = useId();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.searchText.includes(q));
  }, [query, options]);

  function choose(option: SearchableOption | null) {
    setQuery(option?.label ?? '');
    setSelectedValue(option?.value ?? '');
    setOpen(false);
  }

  return (
    <div className="relative">
      <input type="hidden" name={name} value={selectedValue} />
      <input
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
      {open && (
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
          {filtered.length === 0 && <li className="px-3 py-2 text-sm text-mist">No matches</li>}
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
    </div>
  );
}

'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useRef, type InputHTMLAttributes } from 'react';

const DEBOUNCE_MS = 300;

interface SearchFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'defaultValue' | 'onChange' | 'type' | 'name'> {
  name?: string;
  defaultValue: string;
}

// Progressive-enhancement live search for every staff-portal search field
// (DR-091/095/097/098/099/100/101's shared "q" input): stays a plain
// GET-form input (native submit via the surrounding form's Filter button
// still works with JS off), but with JS, each keystroke debounces into a
// router.replace carrying the rest of the current query string across
// (country/status/page filters untouched) and resetting pagination to page
// 1 -- results update live instead of requiring a full-list read then a
// manual Filter click. All filtering logic still runs server-side in the
// page component itself; this only changes when navigation fires.
export function SearchField({ name = 'q', defaultValue, className, ...rest }: SearchFieldProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) params.set(name, value);
      else params.delete(name);
      params.delete('page');
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }, DEBOUNCE_MS);
  }

  return (
    <input
      type="text"
      name={name}
      defaultValue={defaultValue}
      onChange={handleChange}
      className={className ?? 'w-full rounded-survey border border-rule px-3 py-2 text-sm'}
      {...rest}
    />
  );
}

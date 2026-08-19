'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

// Same GET-query-param-driven filtering convention as SearchField.tsx
// (router.replace, no page reload) -- range changes here also drive
// InsightsDashboardClient's poll target via its own useSearchParams() read.
interface DateRangeControlsProps {
  labels: {
    today: string;
    thisWeek: string;
    thisMonth: string;
    allTime: string;
    apply: string;
    from: string;
    to: string;
  };
  /** DASHBOARD_EPOCH (yyyy-mm-dd) -- DR-155: stats never reach earlier than
   * this, even under "All time," so the custom-range input can't either. */
  minDate: string;
}

function isoDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function startOfDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function startOfWeek(d: Date): Date {
  const s = startOfDay(d);
  const isoDay = (s.getUTCDay() + 6) % 7; // Monday = 0
  s.setUTCDate(s.getUTCDate() - isoDay);
  return s;
}

function startOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

const PRESET_BUTTON_CLASS = 'rounded-full border border-rule px-3 py-1 text-xs text-ink transition-colors hover:bg-amber/5';

export function DateRangeControls({ labels, minDate }: DateRangeControlsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function applyRange(from: string | null, to: string | null) {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  const now = new Date();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" className={PRESET_BUTTON_CLASS} onClick={() => applyRange(isoDateOnly(startOfDay(now)), null)}>
        {labels.today}
      </button>
      <button type="button" className={PRESET_BUTTON_CLASS} onClick={() => applyRange(isoDateOnly(startOfWeek(now)), null)}>
        {labels.thisWeek}
      </button>
      <button type="button" className={PRESET_BUTTON_CLASS} onClick={() => applyRange(isoDateOnly(startOfMonth(now)), null)}>
        {labels.thisMonth}
      </button>
      <button type="button" className={PRESET_BUTTON_CLASS} onClick={() => applyRange(null, null)}>
        {labels.allTime}
      </button>
      <form
        className="flex items-center gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const fromValue = (form.elements.namedItem('from') as HTMLInputElement).value;
          const toValue = (form.elements.namedItem('to') as HTMLInputElement).value;
          applyRange(fromValue || null, toValue || null);
        }}
      >
        <input
          type="date"
          name="from"
          defaultValue={searchParams.get('from') ?? ''}
          min={minDate}
          aria-label={labels.from}
          className="rounded-survey border border-rule px-2 py-1 text-xs"
        />
        <span className="text-xs text-mist">–</span>
        <input
          type="date"
          name="to"
          defaultValue={searchParams.get('to') ?? ''}
          min={minDate}
          aria-label={labels.to}
          className="rounded-survey border border-rule px-2 py-1 text-xs"
        />
        <button type="submit" className={PRESET_BUTTON_CLASS}>
          {labels.apply}
        </button>
      </form>
    </div>
  );
}

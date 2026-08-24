'use client';

import { useState } from 'react';
import { useLocale } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { DASHBOARD_SECTION_KEYS, type DashboardSectionKey } from '@modules/insights';

const PANEL_BUTTON_CLASS = 'rounded-full border border-rule px-3 py-1 text-xs text-ink transition-colors hover:bg-amber/5';

interface ExportPdfButtonProps {
  labels: {
    exportPdf: string;
    exportPdfSections: string;
    exportPdfDownload: string;
    sectionLabel: Record<DashboardSectionKey, string>;
  };
}

// DR-193, explicit user request: lets staff pick which dashboard sections
// land in the exported PDF -- the checkbox list mirrors
// DASHBOARD_SECTION_KEYS exactly (domain.ts), so it always matches the
// sections the live dashboard itself shows. Reads the current from/to
// query params (kept in sync by DateRangeControls) so the export always
// covers whatever range is on screen right now, and the active next-intl
// locale, so the PDF reads in whichever language staff is already
// browsing in -- no separate language picker.
export function ExportPdfButton({ labels }: ExportPdfButtonProps) {
  const locale = useLocale();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [sections, setSections] = useState<Set<DashboardSectionKey>>(new Set(DASHBOARD_SECTION_KEYS));

  function toggleSection(key: DashboardSectionKey) {
    setSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const params = new URLSearchParams();
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  params.set('sections', [...sections].join(','));
  params.set('locale', locale === 'fr' ? 'fr' : 'en');
  const href = `/api/v1/insights/pdf?${params.toString()}`;

  return (
    <div className="relative">
      <button type="button" className={PANEL_BUTTON_CLASS} onClick={() => setOpen((o) => !o)}>
        {labels.exportPdf}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-10 mt-2 w-64 rounded-survey border border-rule bg-bone p-3 shadow-lg">
          <p className="mb-2 text-xs font-semibold text-navy">{labels.exportPdfSections}</p>
          <ul className="space-y-1">
            {DASHBOARD_SECTION_KEYS.map((key) => (
              <li key={key}>
                <label className="flex items-center gap-2 text-xs text-ink">
                  <input type="checkbox" checked={sections.has(key)} onChange={() => toggleSection(key)} />
                  {labels.sectionLabel[key]}
                </label>
              </li>
            ))}
          </ul>
          <a
            href={sections.size > 0 ? href : undefined}
            aria-disabled={sections.size === 0}
            className={`mt-3 block rounded-full px-3 py-1 text-center text-xs font-semibold text-bone transition-colors ${
              sections.size > 0 ? 'bg-amber hover:bg-amber/90' : 'cursor-not-allowed bg-mist/50'
            }`}
          >
            {labels.exportPdfDownload}
          </a>
        </div>
      )}
    </div>
  );
}

'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import { setLocaleAction } from '@lib/set-locale-action';

const OPTIONS = [
  { code: 'en', label: 'EN' },
  { code: 'fr', label: 'FR' },
] as const;

// Shared by the guest site header and the staff dashboard (nav bar, login,
// change-password) -- full EN/FR coverage now spans both trees under one
// cookie-based locale (src/app/layout.tsx). Opens on hover, not click
// (confirmed decision, DR-023 item 3) -- a plain Tailwind group-hover
// dropdown, no client-side open/close state needed. Styled for a dark
// (navy) surface, which every current call site is.
export function LanguageSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function select(code: (typeof OPTIONS)[number]['code']) {
    if (code === locale) return;
    startTransition(async () => {
      await setLocaleAction(code);
      router.refresh();
    });
  }

  return (
    <div className="group relative">
      <button type="button" disabled={isPending} className="text-sm hover:text-amber disabled:opacity-50">
        {locale.toUpperCase()}
      </button>
      <div className="absolute right-0 top-full z-10 hidden min-w-20 rounded-card border border-rule bg-navy py-1 shadow-lift group-hover:block">
        {OPTIONS.map(({ code, label }) => (
          <button
            key={code}
            type="button"
            onClick={() => select(code)}
            className={`block w-full px-3 py-1 text-left text-sm ${code === locale ? 'text-amber' : 'hover:text-amber'}`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

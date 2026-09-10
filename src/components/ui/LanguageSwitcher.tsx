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
// change-password) -- full EN/FR coverage spans both trees under one
// cookie-based locale (src/app/layout.tsx). Explicit user request: redesigned
// from a hover-opened dropdown (DR-023) into a two-position sliding pill
// toggle -- EN pinned left, FR right, each side its own color (amber for EN,
// matching Button's `primary` recipe; forest for FR, matching `success`) so
// the active language reads at a glance with no hover/open step required.
// A tap/click is the only interaction now, so this renders and behaves
// identically at every viewport -- there is no separate mobile variant, and
// none is needed (unlike a hover menu, a tap target works the same on touch
// and pointer input). Styled for a dark (navy) surface, which every current
// call site is.
export function LanguageSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function select(code: (typeof OPTIONS)[number]['code']) {
    if (code === locale || isPending) return;
    startTransition(async () => {
      await setLocaleAction(code);
      router.refresh();
    });
  }

  const activeIndex = OPTIONS.findIndex((option) => option.code === locale);

  return (
    <div
      role="radiogroup"
      // Not "Language" -- Playwright's getByLabel (and several a11y
      // testing-library queries) do a case-insensitive SUBSTRING match by
      // default, and "Language" contains "age", which collided with the
      // traveler form's real Age field (getByLabel('Age') resolved to both
      // this element and the age <input>, breaking 3 e2e specs in CI).
      aria-label="Locale"
      className={`relative inline-flex shrink-0 rounded-pill border border-bone/25 bg-ink/25 p-0.5 ${isPending ? 'opacity-60' : ''}`}
    >
      {/* The sliding thumb -- purely decorative (aria-hidden), position and
          color driven by which option is active. w-9/translate-x-9 are the
          same fixed size as each button below, so the slide always lands
          exactly on top of the active one regardless of container padding. */}
      <span
        aria-hidden="true"
        className={`absolute inset-y-0.5 left-0.5 w-9 rounded-pill transition-transform duration-200 ease-out ${
          activeIndex === 1 ? 'translate-x-9 bg-forest' : 'translate-x-0 bg-amber'
        }`}
      />
      {OPTIONS.map(({ code, label }) => {
        const active = code === locale;
        return (
          <button
            key={code}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={isPending}
            onClick={() => select(code)}
            className={`relative z-10 w-9 rounded-pill py-1 text-xs font-bold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bone/70 focus-visible:ring-offset-2 focus-visible:ring-offset-navy disabled:cursor-wait ${
              active ? (code === 'en' ? 'text-ink' : 'text-bone') : 'text-bone/60 hover:text-bone'
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

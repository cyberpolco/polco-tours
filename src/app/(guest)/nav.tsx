'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';

// "Rate my trip" lives in the footer only (not top-level nav) -- it's a
// post-trip action most guests won't need on every visit, so it doesn't
// compete for space with the wizard-facing top links.
const LINKS = [
  { href: '/packages', key: 'browse' },
  { href: '/plan-my-trip', key: 'planMyTrip' },
  { href: '/gallery', key: 'gallery' },
  { href: '/find-booking', key: 'findBooking' },
  { href: '/about', key: 'about' },
  { href: '/faq', key: 'faq' },
  { href: '/contact', key: 'contact' },
] as const;

function MenuGlyph({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden="true">
      {open ? (
        <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      ) : (
        <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      )}
    </svg>
  );
}

// Client component so usePathname() can drive active-link styling --
// GuestLayout itself stays a server component. Below `sm:`, the always-
// expanded link row collapses into a hamburger-triggered drawer (the header
// has 7 links + LanguageSwitcher, too many to just wrap in place on a phone).
export function GuestNav() {
  const pathname = usePathname();
  const t = useTranslations('Nav');
  const [open, setOpen] = useState(false);

  function linkClassName(href: string) {
    return pathname.startsWith(href) ? 'text-amber' : 'hover:text-amber';
  }

  return (
    <>
      <nav className="hidden gap-x-6 gap-y-2 text-sm sm:flex sm:flex-wrap">
        {LINKS.map(({ href, key }) => (
          <Link key={href} href={href} className={linkClassName(href)}>
            {t(key)}
          </Link>
        ))}
      </nav>

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={open ? 'Close menu' : 'Open menu'}
        className="inline-flex items-center justify-center rounded-full border border-bone/20 p-2 text-bone transition-colors duration-200 hover:border-amber/40 hover:text-amber focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber/60 focus-visible:ring-offset-2 focus-visible:ring-offset-navy sm:hidden"
      >
        <MenuGlyph open={open} />
      </button>

      {open && (
        <nav className="absolute inset-x-0 top-full z-20 flex flex-col gap-1 border-b border-rule bg-navy px-4 py-4 text-sm shadow-lift sm:hidden">
          {LINKS.map(({ href, key }) => (
            <Link key={href} href={href} onClick={() => setOpen(false)} className={`py-2 ${linkClassName(href)}`}>
              {t(key)}
            </Link>
          ))}
        </nav>
      )}
    </>
  );
}

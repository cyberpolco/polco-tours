'use client';

import { useEffect } from 'react';
import './globals.css';

// Last-resort boundary: only fires if the ROOT layout.tsx itself throws
// (font loading, getLocale(), NextIntlClientProvider) -- (guest)/error.tsx
// and staff/error.tsx handle every ordinary page/action failure and never
// reach here. Because this replaces layout.tsx entirely, it must render
// its own <html>/<body> and can't rely on next-intl (no provider mounted)
// or the root layout's font variables -- hardcoded English, system font
// stack, but still the Horizon palette so it doesn't look like a generic
// crash screen. Explicitly imports globals.css itself since it isn't
// reached through layout.tsx's own import.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body className="bg-navy text-bone">
        <div className="flex min-h-screen items-center justify-center px-8">
          <div className="max-w-sm text-center">
            <p className="font-mono text-xs font-semibold uppercase tracking-survey text-amber">Mufasa Safaris &amp; Tours</p>
            <h1 className="mb-2 mt-2 text-2xl font-bold">Something went wrong</h1>
            <p className="text-mist">
              The application hit an unexpected error and couldn&apos;t load. It&apos;s been logged — reloading usually fixes it.
            </p>
            {error.digest ? <p className="mt-2 font-mono text-xs text-mist/70">Reference: {error.digest}</p> : null}
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <button
                onClick={reset}
                className="inline-flex items-center justify-center rounded-pill bg-amber px-5 py-3 text-sm font-semibold text-ink outline-none transition-colors hover:bg-amber/90 focus-visible:ring-2 focus-visible:ring-amber/60"
              >
                Try again
              </button>
              {/* Plain <a>, not next/link -- the App Router itself may be in the
                  broken state that caused this boundary to mount, so a real
                  full-document reload is the deliberate choice here, not a
                  client-side transition that could hit the same crash again. */}
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a
                href="/"
                className="inline-flex items-center justify-center rounded-pill border border-bone/70 px-5 py-3 text-sm font-semibold text-bone outline-none transition-colors hover:bg-bone/10 focus-visible:ring-2 focus-visible:ring-bone/60"
              >
                Reload homepage
              </a>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}

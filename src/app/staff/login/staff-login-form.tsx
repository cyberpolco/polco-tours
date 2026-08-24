'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { authClient } from '@lib/auth-client';
import { Logo } from '@/components/Logo';
import { BackLink } from '@/components/ui/BackLink';
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher';

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden="true">
      <path
        d="M1.5 12S5 5 12 5s10.5 7 10.5 7-3.5 7-10.5 7S1.5 12 1.5 12Z"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.25" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden="true">
      <path
        d="M1.5 12S5 5 12 5s10.5 7 10.5 7-3.5 7-10.5 7S1.5 12 1.5 12Z"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.25" />
      <path d="M3 3l18 18" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  );
}

// First Client Component in the repo (DR-014). Deliberately outside the
// (dashboard) route group so it never inherits its auth-gating layout --
// see src/lib/staff-guard.ts's redirect-loop warning. The session-already-
// exists check lives one level up, in page.tsx (a Server Component) --
// this stays the plain credential form.
export function StaffLoginForm() {
  const router = useRouter();
  const t = useTranslations('StaffLogin');
  const tChrome = useTranslations('StaffChrome');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const { error: signInError } = await authClient.signIn.email({ email, password });
    setPending(false);
    if (signInError) {
      setError(signInError.message ?? t('signInFailed'));
      return;
    }
    router.push('/staff/bookings');
  }

  return (
    <main className="staff-shell relative flex min-h-screen items-center justify-center bg-navy px-8 text-bone">
      <BackLink href="/" tone="dark" className="absolute left-8 top-8">
        {t('back')}
      </BackLink>
      <div className="absolute right-8 top-8">
        <LanguageSwitcher />
      </div>
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo className="h-24 w-24 sm:h-40 sm:w-40" />
          <p className="mt-2 text-xs font-semibold tracking-survey text-amber">{tChrome('brandEyebrow')}</p>
          <h1 className="mt-4 text-2xl font-bold">{t('signIn')}</h1>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="mb-1 block text-sm text-mist">
              {t('email')}
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-survey border border-navy-line bg-navy-soft px-3 py-2 text-bone"
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1 block text-sm text-mist">
              {t('password')}
            </label>
            <div className="relative">
              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-survey border border-navy-line bg-navy-soft px-3 py-2 pr-10 text-bone"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? t('hidePassword') : t('showPassword')}
                aria-pressed={showPassword}
                className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-mist hover:text-amber focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber/60"
              >
                {showPassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
          </div>
          {error && <p className="text-sm text-amber">{error}</p>}
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-survey bg-amber px-4 py-2 font-semibold text-navy disabled:opacity-50"
          >
            {pending ? t('signingIn') : t('signIn')}
          </button>
        </form>
        <p className="mt-6 text-center text-xs text-mist">{t('forgotPassword')}</p>
      </div>
    </main>
  );
}

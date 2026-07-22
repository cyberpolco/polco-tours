'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '@lib/auth-client';
import { BrandMark } from '@/components/BrandMark';
import { BackLink } from '@/components/ui/BackLink';

// First Client Component in the repo (DR-014). Deliberately outside the
// (dashboard) route group so it never inherits its auth-gating layout --
// see src/lib/staff-guard.ts's redirect-loop warning. The session-already-
// exists check lives one level up, in page.tsx (a Server Component) --
// this stays the plain credential form.
export function StaffLoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const { error: signInError } = await authClient.signIn.email({ email, password });
    setPending(false);
    if (signInError) {
      setError(signInError.message ?? 'Sign in failed');
      return;
    }
    router.push('/staff/bookings');
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-navy px-8 text-bone">
      <BackLink href="/" tone="dark" className="absolute left-8 top-8">
        Back
      </BackLink>
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <BrandMark className="h-8 w-8 text-amber" />
          <p className="mt-2 text-xs font-semibold tracking-survey text-amber">POLCO TOURS · STAFF</p>
          <h1 className="mt-4 text-2xl font-bold">Sign in</h1>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="mb-1 block text-sm text-mist">
              Email
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
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-survey border border-navy-line bg-navy-soft px-3 py-2 text-bone"
            />
          </div>
          {error && <p className="text-sm text-amber">{error}</p>}
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-survey bg-amber px-4 py-2 font-semibold text-navy disabled:opacity-50"
          >
            {pending ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <p className="mt-6 text-center text-xs text-mist">
          Forgot your password? Contact your admin to reset it.
        </p>
      </div>
    </main>
  );
}

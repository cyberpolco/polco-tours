'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '@lib/auth-client';
import { BrandMark } from '@/components/BrandMark';
import { SignOutButton } from '../(dashboard)/sign-out-button';
import { clearMustChangePasswordAction } from './actions';

// Same form either way (better-auth's own authClient.changePassword verifies
// the current password server-side regardless of why you're here) --
// `forced` only changes the copy and whether a "Cancel" escape exists.
// A forced visit (DR-026, an admin-created account's generated temp
// password) has no way out except changing it; a voluntary one (anyone
// choosing to change their own already-real password) can bail back out.
export function ChangePasswordForm({ forced }: { forced: boolean }) {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }
    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters');
      return;
    }

    setPending(true);
    const { error: changeError } = await authClient.changePassword({
      currentPassword,
      newPassword,
      revokeOtherSessions: true,
    });
    if (changeError) {
      setPending(false);
      setError(changeError.message ?? 'Could not change password');
      return;
    }

    await clearMustChangePasswordAction(); // redirects into the dashboard on success
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-navy px-8 text-bone">
      <div className="absolute right-8 top-8 text-sm">
        <SignOutButton />
      </div>
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <BrandMark className="h-8 w-8 text-amber" />
          <p className="mt-2 text-xs font-semibold tracking-survey text-amber">POLCO TOURS · STAFF</p>
          <h1 className="mt-4 text-2xl font-bold">{forced ? 'Choose a new password' : 'Change your password'}</h1>
          <p className="mt-2 text-sm text-mist">
            {forced
              ? 'Your account was created with a temporary password. Set a new one to continue.'
              : 'Enter your current password and choose a new one.'}
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="currentPassword" className="mb-1 block text-sm text-mist">
              {forced ? 'Temporary password' : 'Current password'}
            </label>
            <input
              id="currentPassword"
              name="currentPassword"
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full rounded-survey border border-navy-line bg-navy-soft px-3 py-2 text-bone"
            />
          </div>
          <div>
            <label htmlFor="newPassword" className="mb-1 block text-sm text-mist">
              New password
            </label>
            <input
              id="newPassword"
              name="newPassword"
              type="password"
              required
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full rounded-survey border border-navy-line bg-navy-soft px-3 py-2 text-bone"
            />
          </div>
          <div>
            <label htmlFor="confirmPassword" className="mb-1 block text-sm text-mist">
              Confirm new password
            </label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              required
              minLength={8}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full rounded-survey border border-navy-line bg-navy-soft px-3 py-2 text-bone"
            />
          </div>
          {error && <p className="text-sm text-amber">{error}</p>}
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-survey bg-amber px-4 py-2 font-semibold text-navy disabled:opacity-50"
          >
            {pending ? 'Saving…' : 'Save new password'}
          </button>
          {!forced && (
            <button
              type="button"
              onClick={() => router.back()}
              disabled={pending}
              className="w-full text-center text-sm text-mist hover:text-bone disabled:opacity-50"
            >
              Cancel
            </button>
          )}
        </form>
      </div>
    </main>
  );
}

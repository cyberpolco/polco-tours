'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { authClient } from '@lib/auth-client';

// Inline variant of /staff/change-password/change-password-form.tsx's form
// (same authClient.changePassword call, same validation) -- that one is a
// full-screen page component (its own navy background/brand mark), not
// meant to be embedded inline here. No server action needed: unlike the
// forced-visit flow, mustChangePassword is already false for anyone
// reaching this page voluntarily, so there's nothing server-side left to
// clear once better-auth's own change succeeds.
export function PasswordSection() {
  const t = useTranslations('StaffProfile');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (newPassword !== confirmPassword) {
      setError(t('errorMismatch'));
      return;
    }
    if (newPassword.length < 8) {
      setError(t('errorTooShort'));
      return;
    }

    setPending(true);
    const { error: changeError } = await authClient.changePassword({
      currentPassword,
      newPassword,
      revokeOtherSessions: true,
    });
    setPending(false);
    if (changeError) {
      setError(changeError.message ?? t('errorGeneric'));
      return;
    }
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setSuccess(true);
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-4">
      <FormField label={t('currentPassword')} htmlFor="currentPassword">
        <input
          type="password"
          required
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          className="w-full rounded-survey border border-rule px-3 py-2"
        />
      </FormField>
      <FormField label={t('newPassword')} htmlFor="newPassword">
        <input
          type="password"
          required
          minLength={8}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          className="w-full rounded-survey border border-rule px-3 py-2"
        />
      </FormField>
      <FormField label={t('confirmNewPassword')} htmlFor="confirmPassword">
        <input
          type="password"
          required
          minLength={8}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className="w-full rounded-survey border border-rule px-3 py-2"
        />
      </FormField>
      {error && <Alert tone="error">{error}</Alert>}
      {success && <Alert tone="success">{t('passwordChanged')}</Alert>}
      <Button type="submit" disabled={pending}>
        {pending ? t('saving') : t('saveNewPassword')}
      </Button>
    </form>
  );
}

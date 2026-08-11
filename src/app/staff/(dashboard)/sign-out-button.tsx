'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { authClient } from '@lib/auth-client';

export function SignOutButton() {
  const router = useRouter();
  const t = useTranslations('Common');

  async function handleClick() {
    await authClient.signOut();
    router.push('/staff/login');
  }

  return (
    <button onClick={handleClick} className="text-sm text-mist hover:text-bone">
      {t('signOut')}
    </button>
  );
}

'use client';

import { useRouter } from 'next/navigation';
import { authClient } from '@lib/auth-client';

export function SignOutButton() {
  const router = useRouter();

  async function handleClick() {
    await authClient.signOut();
    router.push('/staff/login');
  }

  return (
    <button onClick={handleClick} className="text-sm text-mist hover:text-bone">
      Sign out
    </button>
  );
}

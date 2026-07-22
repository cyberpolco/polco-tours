'use client';

import { useRouter } from 'next/navigation';
import { BackAction } from '@/components/ui/BackLink';

// Rendered once, in layout.tsx, so every staff dashboard page gets a
// consistent "go to the previous page" affordance without each page having
// to add its own -- browser-history back (not a hardcoded parent route),
// since the "previous page" depends on how staff actually navigated here,
// not a fixed hierarchy.
export function BackButton() {
  const router = useRouter();

  return (
    <BackAction onClick={() => router.back()} className="mb-4">
      Back
    </BackAction>
  );
}

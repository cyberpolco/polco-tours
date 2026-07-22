'use client';

import dynamic from 'next/dynamic';
import { Skeleton } from './ui/Skeleton';

// `ssr: false` isn't allowed with next/dynamic directly inside a Server
// Component (HomePage) -- this tiny Client Component wrapper is where it's
// allowed, so the homepage can still stay a Server Component itself while
// deferring AfricaMap's @visx/*+topojson-client+world-atlas bundle out of
// the initial page load.
export const AfricaMapLazy = dynamic(() => import('./AfricaMap').then((m) => m.AfricaMap), {
  ssr: false,
  loading: () => <Skeleton className="h-[260px] w-full sm:h-[420px]" />,
});

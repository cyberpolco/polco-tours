import { Skeleton } from '@/components/ui/Skeleton';

// Same root cause and fix as booking/[bookingId]/loading.tsx (DR-124) --
// this is the no-session twin of that wizard (DR-257), and had never
// gotten its own Suspense boundary. (guest)/loading.tsx sits above every
// nested navigation in the group and only covers the FIRST entry into it,
// so every step-to-step transition within this tree (verify -> setup,
// setup -> addons/travelers/passport, and back to setup once a step
// finishes) was fully blocking: the URL/history update itself waits on the
// destination page's whole server render with no interim state at all.
// Confirmed as the cause of a recurring e2e/complete-booking.spec.ts CI
// flake (both the initial verify->setup transition and the final
// travelers->setup one intermittently exceeded Playwright's
// waitForURL/toHaveURL budget under CI's shared connection pool). Covers
// this whole subtree (setup, setup/addons, setup/travelers, setup/passport)
// since none of those segments have a more specific loading.tsx of their
// own.
export default function CompleteBookingSetupLoading() {
  return (
    <div className="mx-auto max-w-md space-y-6">
      <div>
        <Skeleton className="h-3 w-24" />
        <Skeleton className="mt-2 h-7 w-56" />
        <Skeleton className="mt-2 h-7 w-32" />
      </div>
      <div className="flex gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-6 flex-1" />
        ))}
      </div>
      <Skeleton className="h-24 w-full" />
    </div>
  );
}

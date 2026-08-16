import { Skeleton } from '@/components/ui/Skeleton';

// Real root cause of a recurring CI flake (guest-checkout.spec.ts's addons
// -> travelers/new step, and any equally-slow step in this wizard): this
// route tree had NO loading.tsx of its own, and the only ancestor one
// ((guest)/loading.tsx) sits above every nested navigation within (guest),
// so it never re-fires for a same-group step change. With no Suspense
// boundary at or below this segment, Next.js's App Router defers the URL
// change itself until the destination page's full server render resolves --
// under CI's small shared Prisma connection pool + 2 parallel Playwright
// workers, that render (several sequential DB round trips: session
// resolution, booking/traveler reads, sometimes a tour-lead profile fetch)
// occasionally took long enough that `page.waitForURL` blew its 60s budget
// with the browser just sitting on the OLD step the whole time -- no error,
// no partial navigation, because none had started from the URL/browser's
// point of view yet. This boundary makes every step-to-step transition in
// the wizard (Add-ons/Travelers/Passport/booking detail) an instant,
// non-blocking navigation instead, matching every real guest's actual
// experience on a slow connection, not just fixing the test.
export default function BookingWizardLoading() {
  return (
    <div className="max-w-lg">
      <Skeleton className="h-8 w-40" />
      <div className="mt-4 flex gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-6 flex-1" />
        ))}
      </div>
      <Skeleton className="mt-4 h-3 w-24" />
      <Skeleton className="mt-2 h-7 w-64" />
      <div className="mt-6 space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    </div>
  );
}

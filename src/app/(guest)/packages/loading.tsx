import { Skeleton } from '@/components/ui/Skeleton';

// Matches PackagesPage's grid shape (grid-cols-1 sm:grid-cols-2) so the
// skeleton doesn't reflow when real cards swap in.
export default function PackagesLoading() {
  return (
    <div>
      <Skeleton className="h-4 w-16" />
      <Skeleton className="mt-2 h-8 w-56" />
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-56 w-full" />
        ))}
      </div>
    </div>
  );
}

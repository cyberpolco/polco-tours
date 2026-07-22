import { Skeleton } from '@/components/ui/Skeleton';

// Matches HomePage's rough section shapes (hero / trust bar / featured grid)
// so there's no visual jump once the real content streams in.
export default function HomeLoading() {
  return (
    <div className="space-y-16 pb-24 sm:pb-8">
      <Skeleton className="h-[320px] w-full sm:h-[420px]" />
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-y border-rule py-5">
        <Skeleton className="h-9 w-24" />
        <Skeleton className="h-4 w-40" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-64 w-full" />
        ))}
      </div>
    </div>
  );
}

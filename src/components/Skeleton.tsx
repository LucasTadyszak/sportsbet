// Placeholders shown while a page's data is on its way (streamed pages, loading.tsx): the shapes
// of what is coming, so a tap is answered at once on a slow phone. Decorative: the region they
// fill says it's loading (aria-busy) and names what, for screen readers.
import { SiteHeader, type NavKey } from "@/components/SiteHeader";

const BLOCK = "bg-bg-row";

function SkeletonTeam() {
  return (
    <div className="flex flex-col items-center gap-2">
      <span className={`h-9 w-9 rounded-full ${BLOCK}`} />
      <span className={`h-5 w-24 max-w-full ${BLOCK}`} />
    </div>
  );
}

/** A match block's shape: the competition band, both clubs around the kick-off, the 1/N/2 blocks. */
export function SkeletonCard() {
  return (
    <div aria-hidden className="flex flex-col bg-bg-elevated shadow-hard">
      <div className="h-9 bg-bg-deep" />
      <div className="flex flex-col gap-4 px-4 pb-4 pt-5 sm:px-5">
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
          <SkeletonTeam />
          <span className={`h-10 w-20 ${BLOCK}`} />
          <SkeletonTeam />
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[0, 1, 2].map((tile) => (
            <span key={tile} className={`min-h-14 ${BLOCK}`} />
          ))}
        </div>
      </div>
    </div>
  );
}

/** A list of blocks on its way, announced once for screen readers. */
export function SkeletonList({ label, count = 3 }: { label: string; count?: number }) {
  return (
    <div aria-busy="true" className="flex animate-pulse flex-col gap-5">
      <span className="sr-only" role="status">
        {label}
      </span>
      {Array.from({ length: count }, (_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

/** A whole page on its way (loading.tsx): the header, its tab already on, a title and blocks. */
export function PageSkeleton({ active, label }: { active?: NavKey; label: string }) {
  return (
    <div className="flex flex-1 flex-col bg-bg text-fg">
      <SiteHeader active={active} />
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-10 sm:px-6">
        <span aria-hidden className={`h-10 w-2/3 max-w-md animate-pulse ${BLOCK}`} />
        <SkeletonList label={label} />
      </main>
    </div>
  );
}

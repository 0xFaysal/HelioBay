import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <main id="main-content" className="container-wide py-20" aria-label="Loading page">
      <Skeleton className="h-9 w-60 mb-5" />
      <Skeleton className="h-4 w-80 max-w-full mb-12" />
      <div className="grid-three">{[1, 2, 3].map(n => <Skeleton key={n} className="h-64 rounded-xl" />)}</div>
    </main>
  );
}

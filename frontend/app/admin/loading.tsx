import { Skeleton } from '@/components/ui/skeleton';
export default function Loading() { return <div role="status"><Skeleton className="h-12 w-72 mb-8" /><Skeleton className="h-96 w-full" /><span className="sr-only">Loading network operations</span></div>; }

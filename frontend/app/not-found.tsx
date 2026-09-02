import Link from "next/link";
import { PublicShell } from "@/components/shared/public-shell";
export default function NotFound() { return <PublicShell><div className="empty-state py-28"><div className="eyebrow justify-center">404 · A SMALL DETOUR</div><h1 className="text-4xl mt-5">This bay isn’t on our map.</h1><p>The page may have moved, or this link is no longer available.</p><Link href="/stations" className="action action-primary">Find a station</Link></div></PublicShell>; }

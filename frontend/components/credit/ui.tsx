"use client";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCreditStore } from "@/store/credit-store";
export function Heading({ title, description, action, level = 1 }: { title: string; description: string; action?: ReactNode; level?: 1 | 2 }) { const Tag = level === 1 ? "h1" : "h2"; return <div className="owner-heading"><div><p className="eyebrow !mb-3">YOUR ENERGY, CONNECTED</p><Tag className={level === 2 ? "text-2xl" : undefined}>{title}</Tag><p>{description}</p></div>{action}</div>; }
export function Source({ children }: { children: ReactNode }) { return <span className="credit-source">{children}</span>; }
export function ConnectionError() {
  const error = useCreditStore(s => s.error);
  if (!error) return null;
  return <div className="notice no-print" role="alert"><p>{error}</p><Button variant="outline" className="mt-3" onClick={() => window.dispatchEvent(new Event("heliobay:reconnect"))}>Retry connection</Button></div>;
}
export function Action({ children, run, disabled = false, variant = "outline", className = "" }: { children: ReactNode; run: () => Promise<unknown>; disabled?: boolean; variant?: "outline" | "default" | "destructive" | "ghost"; className?: string }) {
  const [busy, setBusy] = useState(false);
  return <Button className={className} variant={variant} disabled={disabled || busy} onClick={async () => { setBusy(true); try { await run(); } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); } }}>{busy && <LoaderCircle className="animate-spin" size={14} />}{children}</Button>;
}
export const timestamp = (iso: string) => new Date(iso).toLocaleString("en-GB", { timeZone: "Asia/Dhaka", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

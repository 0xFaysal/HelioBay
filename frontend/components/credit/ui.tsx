"use client";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Radio, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCreditStore } from "@/store/credit-store";
import { isDemo } from "@/lib/config";
export function Heading({ title, description, action, level = 1 }: { title: string; description: string; action?: ReactNode; level?: 1 | 2 }) { const Tag = level === 1 ? "h1" : "h2"; return <div className="owner-heading"><div><p className="eyebrow !mb-3">YOUR ENERGY, CONNECTED</p><Tag className={level === 2 ? "text-2xl" : undefined}>{title}</Tag><p>{description}</p></div>{action}</div>; }
export function Source({ children }: { children: ReactNode }) { return <span className="credit-source">{children}</span>; }
export function ConnectionStatus() {
  const ready = useCreditStore(s => s.ready); const connection = useCreditStore(s => s.connection); const error = useCreditStore(s => s.error); const speed = useCreditStore(s => s.data.policy.demoSpeed);
  return <div className="connection-strip no-print" role="status"><Radio size={14} /><span>{isDemo ? `DEMO MODE · ${speed}× time · shared on this browser` : connection}{error && ` · ${error}`}</span>{!isDemo && ready && <Button variant="ghost" size="sm" onClick={() => window.dispatchEvent(new Event("heliobay:reconnect"))}>Retry connection</Button>}</div>;
}
export function Action({ children, run, disabled = false, variant = "outline", className = "" }: { children: ReactNode; run: () => Promise<unknown>; disabled?: boolean; variant?: "outline" | "default" | "destructive" | "ghost"; className?: string }) {
  const [busy, setBusy] = useState(false);
  return <Button className={className} variant={variant} disabled={disabled || busy} onClick={async () => { setBusy(true); try { await run(); } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); } }}>{busy && <LoaderCircle className="animate-spin" size={14} />}{children}</Button>;
}
export const timestamp = (iso: string) => new Date(iso).toLocaleString("en-GB", { timeZone: "Asia/Dhaka", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

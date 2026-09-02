"use client";
import { useState } from "react";
import { toast } from "sonner";
import { useDemoStore } from "@/store/demo-store";
import { platform } from "@/lib/platform";
import { defaultPricing } from "@/lib/demo/network-seed";
import { isDemo, apiBaseUrl, wsUrl } from "@/lib/config";
import { pricingSchema } from "@/lib/platform/schemas";
import type { PricingRule } from "@/types";
import { AdminHeading, ConfirmAction, useUnsaved } from "./shared";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const fields: { key: keyof PricingRule; label: string; min: number; max: number; step: number; hint: string }[] = [
  { key: "pricePerKwh", label: "Price per kWh (৳)", min: 1, max: 200, step: .1, hint: "Applied to new reservations across the network." },
  { key: "bookingFee", label: "Booking fee (৳)", min: 0, max: 1000, step: 1, hint: "Non-refundable reservation fee." },
  { key: "cancellationFee", label: "Additional cancellation fee (৳)", min: 0, max: 1000, step: 1, hint: "Deducted from eligible advance refunds." },
  { key: "peakMultiplier", label: "Peak-hour multiplier", min: 1, max: 5, step: .1, hint: "17:00–21:00, Asia/Dhaka. Existing booked rates are honored." },
  { key: "promoPercent", label: "HELIO10 promotional discount (%)", min: 0, max: 80, step: 1, hint: "Discount applies to energy, not the booking fee." },
  { key: "demoScalingFactor", label: "Prototype → EV energy scale", min: 1, max: 50000, step: 1, hint: "Demo Wh × scale ÷ 1000 = EV-equivalent kWh. Never used as real metering." },
  { key: "taperFactor", label: "Estimated taper factor", min: .1, max: 1, step: .05, hint: "Estimated current reduction above 80% state of charge." },
  { key: "targetBattery", label: "Default charge limit (%)", min: 50, max: 100, step: 1, hint: "Used by new sessions. Automatically stops at the configured limit." },
];
export function AdminSettings() {
  const current = useDemoStore(s => s.network.pricing); const previous = useDemoStore(s => s.network.previousPricing); const speed = useDemoStore(s => s.network.demoSpeed);
  const [draft, setDraft] = useState(current); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(current); useUnsaved(dirty);
  return <>
    <AdminHeading title="Set the standard." description="Pricing, simulator behavior and connection configuration. Changes are validated and audited." />
    <div className="dashboard-grid"><section className="panel"><div className="panel-top"><h2 className="panel-title">Pricing & charging policy</h2><span className="text-xs muted">{dirty ? "Unsaved changes" : "All changes saved"}</span></div>
      <form onSubmit={async e => { e.preventDefault(); const parsed = pricingSchema.safeParse(draft); if (!parsed.success) { setError(parsed.error.issues[0].message); return; } setBusy(true); setError(""); try { await platform.admin.savePricing(parsed.data); toast.success("Pricing updated for new bookings."); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }}>
        <div className="admin-form-grid">{fields.map(f => <label key={f.key}>{f.label}<Input type="number" required min={f.min} max={f.max} step={f.step} value={draft[f.key]} onChange={e => setDraft(d => ({ ...d, [f.key]: Number(e.target.value) }))} /><small className="muted block mt-2 leading-relaxed">{f.hint}</small></label>)}</div>{error && <p role="alert" className="notice notice-warning mt-5">{error}</p>}<div className="flex flex-wrap gap-3 mt-6"><Button type="submit" disabled={!dirty || busy}>{busy ? "Saving…" : "Save pricing"}</Button><Button type="button" variant="outline" onClick={() => { setDraft(current); setError(""); }} disabled={!dirty}>Discard changes</Button><Button type="button" variant="outline" onClick={() => setDraft({ ...defaultPricing })}>Reset defaults</Button></div>
      </form><div className="mt-4"><ConfirmAction label="Roll back last pricing change" disabled={!previous} title="Restore previous pricing?" description="This applies the previous global policy to new reservations. Existing booking rates are not changed." action={async () => { await platform.admin.rollbackPricing(); setDraft(useDemoStore.getState().network.pricing); }} /></div>
    </section><div><section className="panel"><h2 className="panel-title">Demo time control</h2><p className="text-xs muted mt-3">Accelerates simulator time, delivered energy and session duration. It does not represent faster physical charging.</p>{isDemo ? <label className="block text-sm mt-5">Demo Speed<select aria-label="Demo Speed" className="w-full mt-2" value={speed} onChange={async e => { try { await platform.admin.setSpeed(Number(e.target.value) as 1 | 10 | 60); toast.success("Demo speed updated."); } catch (e) { toast.error((e as Error).message); } }}><option value="1">1× · Real-time simulation</option><option value="10">10× · Accelerated demo</option><option value="60">60× · Competition walkthrough</option></select></label> : <p className="notice mt-4">Acceleration is disabled in API mode.</p>}</section>
      <section className="panel mt-6"><h2 className="panel-title">Connection architecture</h2><p className="text-sm mt-4 leading-7">Website → Backend API → MQTT broker → ESP32</p><div className="data-row"><span>Application mode</span><span>{isDemo ? "Demo" : "API"}</span></div><div className="data-row"><span>REST endpoint</span><span>{apiBaseUrl || "Not configured"}</span></div><div className="data-row"><span>WebSocket endpoint</span><span>{wsUrl || "Not configured"}</span></div><p className="notice mt-4">Connection URLs are configured in the environment and require a rebuild. MQTT credentials and physical safety controls belong on the backend and device, never in this browser.</p></section>
    </div></div>
  </>;
}

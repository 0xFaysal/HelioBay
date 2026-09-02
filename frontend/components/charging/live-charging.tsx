"use client";
import { useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { BatteryCharging, Zap, Sun, Clock, Pause, Play, Square, ShieldAlert, PlugZap, ArrowUpRight } from "lucide-react";
import { toast } from "sonner";
import { useOwnerData, useDemoStore } from "@/store/demo-store";
import { chargingService } from "@/lib/services/charging";
import { stationService } from "@/lib/services/stations";
import { money } from "@/lib/services/booking-rules";
import { estimateRemainingMinutes } from "@/lib/demo/engine";
import { isDemo } from "@/lib/config";
import { useClock } from "@/hooks/use-clock";
import { EnergyFlow } from "./energy-flow";
import { CommandStatusPanel } from "./command-status";
import { AnimatedNumber } from "@/components/shared/animated-number";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import type { CommandName } from "@/types";
const Chart = dynamic(() => import("@/components/owner/analytics-chart"));

export function LiveCharging({ id }: { id: string }) {
  const d = useOwnerData(); const network = useDemoStore(s => s.network); const now = useClock();
  const session = d?.sessions.find(s => s.id === id);
  const [confirm, setConfirm] = useState<"stop" | "emergency" | null>(null); const [word, setWord] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  if (!d) return null;
  if (!session) return <div className="empty-state"><h1 className="text-3xl">Session not found.</h1><p>Open a booking to begin charging.</p><Link className="action action-primary" href="/bookings">My bookings</Link></div>;
  const station = stationService.get(session.stationId);
  const booking = d.bookings.find(b => b.id === session.bookingId);
  if (!station || !booking) return <div className="empty-state"><h1>Session details unavailable.</h1><p>Reconnect to load its station and booking.</p></div>;
  const device = network.devices.find(d => d.id === session.deviceId);
  const telemetry = device?.telemetry;
  const stale = !device?.online || !telemetry || now - Date.parse(telemetry.timestamp) > 30000;
  const completed = session.status === "completed"; const charging = session.status === "charging";
  const command = network.commands.find(c => c.deviceId === session.deviceId); const pending = command?.status === "pending";
  const vehicle = d.vehicles.find(v => v.id === session.vehicleId);
  const estimatedMinutes = estimateRemainingMinutes((vehicle?.capacity ?? 60) * 1000 / network.pricing.demoScalingFactor, stale ? null : telemetry?.carBatteryPercent ?? null, telemetry?.carBatteryVoltage ?? null, telemetry?.chargingCurrent ?? null, network.pricing.taperFactor, session.targetBattery ?? 100);
  const remaining = estimatedMinutes == null ? null : Math.min(estimatedMinutes, Math.max(0, booking.duration - session.elapsed / 60));
  const bill = session.finalCost ?? session.energy * (booking.unitPrice ?? station.price) * (1 - (booking.discountRate ?? (booking.discount ? 10 : 0)) / 100) + booking.fee;
  const reading = (v: number | null | undefined, unit: string) => stale || v == null ? "Unavailable" : `${v.toFixed(2)} ${unit}`;
  async function send(command: CommandName) {
    setBusy(true); setError("");
    try { await chargingService.command(id, command); toast.info("Command sent. Watch the acknowledgement below."); setConfirm(null); setWord(""); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  return <>
    <div className="owner-heading"><div><Link href={`/bookings/${booking.id}`} className="text-[11px] muted">← Booking {booking.id}</Link><h1 className="mt-3">{completed ? "A little cleaner. A little further." : "Your energy, in motion."}</h1><p>{station.name} · {session.deviceId ?? station.deviceId} · {booking.bayId}</p></div><span className="px-3 py-2 text-xs rounded-lg border capitalize bg-white" role="status">{session.status.replace("-", " ")}</span></div>
    <div className="notice notice-warning mb-6">{isDemo ? `Demo device connection · Simulated telemetry · ${network.demoSpeed}× demo time. No physical charger is controlled.` : "Backend-connected charging. Physical safety interlocks and emergency controls must remain available at the charger."}</div>
    {error && <p role="alert" className="notice notice-warning mb-5">{error}</p>}
    <div className="dashboard-grid"><section className="panel text-center"><div className="panel-top"><h2 className="panel-title">{vehicle?.name ?? "Your vehicle"}</h2><BatteryCharging size={21} className="text-green-700" /></div>
      <div className={`battery-ring ${charging ? "charging-active" : ""}`} role="img" aria-label={`Estimated battery ${Math.round(session.battery)} percent`}><svg viewBox="0 0 230 230"><circle cx="115" cy="115" r="101" fill="none" stroke="#edf2ee" strokeWidth="9" /><circle cx="115" cy="115" r="101" fill="none" stroke="#00c865" strokeWidth="9" strokeLinecap="round" strokeDasharray={`${session.battery / 100 * 634.6} 634.6`} /></svg><div className="battery-ring-text"><strong><AnimatedNumber value={session.battery} /><span className="text-2xl muted">%</span></strong><small>{completed ? "Final estimate" : "Estimated battery"}</small></div></div>
      <p className="text-xs muted mx-auto max-w-[340px] min-h-10">{completed ? session.stopReason ?? "Session complete." : session.status === "starting" ? "START command pending. Waiting for ESP32 acknowledgement." : session.status === "offline" ? "Device offline. Session interrupted. Output state requires device verification in API mode." : session.status === "fault" ? "A blocking fault needs administrator inspection." : charging ? "Energy is flowing. Your readings update from the shared service." : "Vehicle detection and payment authorization are required before starting."}</p>
      <div className="flex flex-wrap justify-center gap-3 mt-6">
        {isDemo && ["waiting", "car-detected"].includes(session.status) && !device?.vehicleDetected && <Button disabled={busy} onClick={async () => { try { await chargingService.presence(id, true); } catch (e) { setError((e as Error).message); } }}><PlugZap size={16} />Simulate car arrival</Button>}
        {!completed && !charging && <Button className="!h-12" disabled={busy || pending} onClick={() => send("START")}><Play size={15} />{pending ? "Waiting for acknowledgement…" : session.status === "paused" ? "Resume charging" : "Start Charging"}</Button>}
        {charging && <Button variant="outline" disabled={busy || pending} onClick={() => send("PAUSE")}><Pause size={15} />Pause charging</Button>}
        {!completed && <Button variant="outline" disabled={busy || pending} onClick={() => setConfirm("stop")}><Square size={14} />Stop Charging</Button>}
        {completed && <Link href="/payments" className="action action-primary">View settled bill <ArrowUpRight size={14} /></Link>}
      </div>
      {session.deviceId && <div className="text-left"><CommandStatusPanel deviceId={session.deviceId} /></div>}
      {!completed && <Button variant="destructive" className="mt-6 w-full" onClick={() => { setWord(""); setConfirm("emergency"); }}><ShieldAlert size={16} />Emergency stop</Button>}
      {completed && <p className="notice mt-5">The final energy and bill are frozen. Your receipt and eligible refund appear in Payments.</p>}
    </section><div><section className="panel"><h2 className="panel-title mb-5">Your charging session</h2><div className="grid grid-cols-2 gap-5">{[
      { icon: Zap, label: "EV-equivalent energy", value: `${session.energy.toFixed(3)} kWh` },
      { icon: Sun, label: "Solar contribution", value: `${session.solar.toFixed(0)}%` },
      { icon: Clock, label: isDemo ? "Simulated elapsed" : "Elapsed", value: `${Math.floor(session.elapsed / 60)}m ${Math.floor(session.elapsed % 60)}s` },
      { icon: Clock, label: "Estimated remaining", value: completed ? "Complete" : remaining == null ? "Unavailable" : `~${Math.ceil(remaining)} min` },
    ].map(m => <div key={m.label}><m.icon size={17} className="text-green-700 mb-3" /><p className="text-[10px] muted">{m.label}</p><strong className="text-xl font-medium mt-1 block">{m.value}</strong></div>)}</div><div className="data-row mt-5"><span>{completed ? "Final bill" : "Running bill"}</span><strong className="text-2xl">{money(bill)}</strong></div><div className="data-row"><span>MOSFET / charger</span><strong>{device?.online ? device.mosfetOn ? "ON" : "OFF" : "Unknown / offline"}</strong></div>
      <div className="telemetry-grid mt-5">{[["Battery sense", reading(telemetry?.carBatteryVoltage, "V")], ["Measured current", reading(telemetry?.chargingCurrent, "A")], ["Prototype power", reading(telemetry?.chargingPower, "W")], ["Prototype energy", completed ? `${(session.energyWh ?? 0).toFixed(4)} Wh` : reading(telemetry?.energyWh, "Wh")]].map(([l,v]) => <div key={l}><span>{l}</span><strong>{v}</strong></div>)}</div><p className="text-[10px] muted mt-4">{stale ? "Telemetry is missing or stale. " : ""}Battery-sense and INA3221 values provide estimates, not certified BMS data. {isDemo ? `EV-equivalent energy uses a ${network.pricing.demoScalingFactor}× model scale, separate from ${network.demoSpeed}× demo time.` : ""}</p>
    </section><section className="panel mt-6"><h2 className="panel-title">A clean energy cycle</h2><EnergyFlow /></section></div></div>
    <section className="panel mt-6"><div className="panel-top"><h2 className="panel-title">Power over this session</h2><span className="text-xs muted">{isDemo ? "EV-equivalent kW · simulated minutes" : "Backend power readings"}</span></div><Chart data={session.points.map(p => ({ label: `${p.minute.toFixed(1)}m`, value: Number(p.power.toFixed(2)) }))} /></section>
    {isDemo && <div className="notice mt-6"><strong className="text-sm">Test connection and fault scenarios</strong><p className="text-xs muted mt-2">Open the Admin demo in another tab to remove the vehicle, change solar input, inject faults or accelerate time. This session stays signed in.</p><a className="action action-outline mt-4 !text-xs" href="/auth/sign-in?role=admin" target="_blank" rel="noopener noreferrer">Open Admin demo in new tab <ArrowUpRight size={13} /></a></div>}
    <Dialog open={Boolean(confirm)} onOpenChange={v => { if (!v && !busy) setConfirm(null); }}><DialogContent><DialogTitle>{confirm === "emergency" ? "Emergency stop charging?" : "Stop this charging session?"}</DialogTitle><DialogDescription>{confirm === "emergency" ? "Demo output is disabled immediately and a blocking fault is latched. In API mode a network command cannot replace the physical emergency switch." : "Wait for STOP acknowledgement. Delivered energy is billed and unused advance is refunded in Demo Mode."}</DialogDescription>{confirm === "emergency" && <label className="text-sm">Type STOP to confirm<Input value={word} onChange={e => setWord(e.target.value)} className="mt-2" /></label>}{error && <p className="notice notice-warning" role="alert">{error}</p>}<Button variant={confirm === "emergency" ? "destructive" : "default"} disabled={busy || confirm === "emergency" && word !== "STOP"} onClick={() => send(confirm === "emergency" ? "EMERGENCY_STOP" : "STOP")}>{busy ? "Sending…" : confirm === "emergency" ? "Confirm emergency stop" : "Confirm stop"}</Button><Button variant="outline" disabled={busy} onClick={() => setConfirm(null)}>Keep charging</Button></DialogContent></Dialog>
  </>;
}

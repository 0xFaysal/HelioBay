"use client";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";

import {
  BatteryCharging,
  Zap,
  Sun,
  Clock,
  Pause,
  Play,
  Square,
  ShieldAlert,
  PlugZap,
  ArrowUpRight,
  WifiOff,
  CircleAlert,
} from "lucide-react";

import { toast } from "sonner";
import { useOwnerData } from "@/store/demo-store";
import { chargingService } from "@/lib/services/charging";
import { stationService } from "@/lib/services/stations";
import { money } from "@/lib/services/booking-rules";
import { EnergyFlow } from "./energy-flow";
import { AnimatedNumber } from "@/components/shared/animated-number";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import type { ChargingStatus } from "@/types";
const Chart = dynamic(() => import("@/components/owner/analytics-chart"));

const stateCopy: Record<ChargingStatus, string> = {
  waiting: "Your bay is ready. Simulate arrival to connect your vehicle.",
  "car-detected": "Vehicle detected. Connector secured. Ready to begin.",
  starting: "Running safety checks and connecting to the charger…",
  charging: "Good energy is flowing. Take a moment for yourself.",
  paused: "Your session is paused. Resume whenever you’re ready.",
  completed: "All charged up. Your session has been settled in the demo.",
  offline: "Connection lost. Power delivery is paused safely.",
  fault: "A simulated charger fault was detected. Power has been stopped."
};

export function LiveCharging(
  {
    id
  }: {
    id: string;
  }
) {
  const d = useOwnerData();
  const session = d?.sessions.find(s => s.id === id);
  const [confirm, setConfirm] = useState<"stop" | "emergency" | null>(null);
  const [word, setWord] = useState("");
  const status = session?.status;

  useEffect(() => {
    if (status !== "charging")
      return;

    chargingService.tick(id);
    const timer = setInterval(() => chargingService.tick(id), 1000);
    return () => clearInterval(timer);
  }, [id, status]);

  useEffect(() => {
    if (status !== "starting")
      return;

    const timer = setTimeout(() => {
      try {
        chargingService.transition(id, "charging");
      } catch (e) {
        toast.error((e as Error).message);
      }
    }, 1600);

    return () => clearTimeout(timer);
  }, [id, status]);

  if (!d)
    return null;

  if (!session) return (
    <div className="empty-state">
      <h1 className="text-3xl">Session not found.</h1>
      <p>Open a booking to begin your demo charge.</p>
      <Link className="action action-primary" href="/bookings">My bookings</Link>
    </div>
  );

  const station = stationService.get(session.stationId)!;
  const booking = d.bookings.find(b => b.id === session.bookingId)!;
  const isCharging = session.status === "charging";
  const completed = session.status === "completed";
  const remaining = Math.max(0, booking.duration * 60 - session.elapsed);
  const bill = session.energy * station.price * (booking.discount > 0 ? .9 : 1) + booking.fee;

  function change(status: ChargingStatus) {
    try {
      chargingService.transition(id, status);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <>
      <div className="owner-heading">
        <div>
          <Link href={`/bookings/${booking.id}`} className="text-[11px] muted">← Booking {booking.id}</Link>
          <h1 className="mt-3">{completed ? "A little cleaner. A little further." : "Your energy, in motion."}</h1>
          <p>{station.name}· {station.deviceId}· {booking.bayId}</p>
        </div>
        <span
          className={`px-3 py-2 text-[10px] rounded-lg border capitalize ${["offline", "fault"].includes(session.status) ? "bg-amber-50 text-amber-900" : "bg-green-50 text-green-800"}`}
          role="status">{session.status.replace("-", " ")}</span>
      </div>
      <div className="notice notice-warning mb-6">Demo device connection · Telemetry and charging controls are simulated. No physical charger is being controlled.</div>
      <div className="dashboard-grid">
        <section className="panel text-center">
          <div className="panel-top">
            <h2 className="panel-title">{d.vehicles.find(v => v.id === session.vehicleId)?.name ?? "Your vehicle"}</h2>
            <BatteryCharging size={21} className="text-green-700" />
          </div>
          <div
            className={`battery-ring ${isCharging ? "charging-active" : ""}`}
            role="img"
            aria-label={`Battery ${Math.round(session.battery)} percent`}>
            <svg viewBox="0 0 230 230">
              <circle cx="115" cy="115" r="101" fill="none" stroke="#edf2ee" strokeWidth="9" />
              <circle
                cx="115"
                cy="115"
                r="101"
                fill="none"
                stroke="#00c865"
                strokeWidth="9"
                strokeLinecap="round"
                strokeDasharray={`${session.battery / 100 * 634.6} 634.6`} />
            </svg>
            <div className="battery-ring-text">
              <strong>
                <AnimatedNumber value={session.battery} />
                <span className="text-2xl muted">%</span>
              </strong>
              <small>{completed ? "Final battery" : "Battery level"}</small>
            </div>
          </div>
          <p className="text-xs muted mx-auto max-w-[340px] min-h-10">{stateCopy[session.status]}</p>
          <div className="flex flex-wrap justify-center gap-3 mt-6">
            {session.status === "waiting" && <Button className="!h-12" onClick={() => change("car-detected")}><PlugZap size={17} />Simulate car arrival</Button>}
            {session.status === "car-detected" && <Button className="!h-12" onClick={() => change("starting")}><Zap size={16} />Start Charging</Button>}
            {session.status === "starting" && <Button disabled>Starting safely…</Button>}
            {isCharging && <Button variant="outline" onClick={() => change("paused")}><Pause size={15} />Pause charging</Button>}
            {session.status === "paused" && <Button onClick={() => change("charging")}><Play size={15} />Resume charging</Button>}
            {["offline", "fault"].includes(session.status) && <Button onClick={() => change("waiting")}>Reconnect demo charger</Button>}
            {!completed && <Button variant="outline" onClick={() => setConfirm("stop")}><Square size={14} />Stop Charging</Button>}
            {completed && <Link href="/payments" className="action action-primary">View settled bill <ArrowUpRight size={14} /></Link>}
          </div>
          {!completed && <button
            className="text-[11px] text-red-700 mt-5 inline-flex gap-2 items-center"
            onClick={() => {
              setWord("");
              setConfirm("emergency");
            }}><ShieldAlert size={14} />Emergency stop</button>}
        </section>
        <div className="space-y-5">
          <section className="panel">
            <h2 className="panel-title">The details, live.</h2>
            <div className="grid grid-cols-2 gap-x-6 gap-y-7 mt-6">{[
                [Zap, "Power", `${session.power.toFixed(1)} kW`],
                [BatteryCharging, "Energy", `${session.energy.toFixed(3)} kWh`],
                [PlugZap, "Voltage", `${isCharging ? 400 : 0} V`],
                [Zap, "Current", `${isCharging ? (session.power * 1000 / 400).toFixed(1) : "0"} A`],
                [Clock, "Elapsed", `${Math.floor(session.elapsed / 60)}m ${Math.floor(session.elapsed % 60)}s`],
                [Clock, "Remaining", `${Math.ceil(remaining / 60)} min`]
              ].map(([I, l, v]) => {
                const Icon = I as typeof Zap;

                return (
                  <div key={String(l)}>
                    <div className="text-[10px] muted flex gap-1 items-center">
                      <Icon size={12} />
                      {String(l)}
                    </div>
                    <div className="text-xl tracking-tight mt-2">{String(v)}</div>
                  </div>
                );
              })}</div>
            <div className="data-row mt-5">
              <span>Running bill</span>
              <strong className="text-2xl">{money(bill)}</strong>
            </div>
            <p className="text-[10px] muted">Includes ৳20 booking fee{booking.discount ? " and 10% promo energy discount" : ""}. Advance already paid: {money(booking.advance)}.</p>
          </section>
          <section className="panel !bg-[#edf6ed]">
            <div className="flex items-center justify-between">
              <span className="text-xs flex gap-2 items-center"><Sun size={17} />Sunshine in your journey</span>
              <strong className="text-2xl">{session.solar}%</strong>
            </div>
            <EnergyFlow />
            <p className="text-[10px] muted">Solar first, storage next, grid when needed.</p>
          </section>
        </div>
      </div>
      <section className="panel mt-6">
        <div className="panel-top">
          <h2 className="panel-title">Power over time</h2>
          <span className="text-[10px] muted">kW · Elapsed minutes</span>
        </div>
        <Chart
          data={session.points.map(p => ({
            label: `${p.minute}m`,
            value: p.power
          }))}
          label="Power (kW)" />
      </section>
      {!completed && <section className="panel mt-6 no-print">
        <h2 className="panel-title">Demo scenarios</h2>
        <p className="text-xs muted mt-2 mb-4">Explore safe offline and fault states. Reconnect to run the arrival checks again.</p>
        <div className="flex gap-3 flex-wrap">
          <Button
            variant="outline"
            disabled={["offline", "fault"].includes(session.status)}
            onClick={() => change("offline")}><WifiOff size={14} />Simulate offline</Button>
          <Button
            variant="outline"
            disabled={["offline", "fault"].includes(session.status)}
            onClick={() => change("fault")}><CircleAlert size={14} />Simulate fault</Button>
        </div>
      </section>}
      <Dialog
        open={confirm !== null}
        onOpenChange={v => {
          if (!v)
            setConfirm(null);
        }}><DialogContent>
          <DialogTitle>{confirm === "emergency" ? "Emergency stop — confirm" : "Finish your charging session?"}</DialogTitle>
          <DialogDescription>{confirm === "emergency" ? "This ends the simulated session immediately. A real charger must provide a physical emergency-stop button independent of this interface." : "Power delivery will stop. Your final demo bill and any unused advance refund will be recorded."}</DialogDescription>
          <p className="text-sm">Energy delivered: {session.energy.toFixed(3)}kWh<br />Current total: {money(bill)}</p>
          {confirm === "emergency" && <label className="form-field">Type STOP to confirm<Input value={word} onChange={e => setWord(e.target.value)} placeholder="STOP" /></label>}
          <Button
            variant={confirm === "emergency" ? "destructive" : "default"}
            disabled={confirm === "emergency" && word !== "STOP"}
            onClick={() => {
              change("completed");
              setConfirm(null);
              toast.success("Session completed. Simulated bill settled.");
            }}>{confirm === "emergency" ? "Confirm emergency stop" : "Stop and settle session"}</Button>
          <Button variant="outline" onClick={() => setConfirm(null)}>Keep session open</Button>
        </DialogContent></Dialog>
    </>
  );
}

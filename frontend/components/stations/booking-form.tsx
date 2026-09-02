"use client";
import { useState } from "react";
import { useClock } from "@/hooks/use-clock";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { addDays, format } from "date-fns";
import { ArrowRight, Check, LoaderCircle, ShieldCheck, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useAuth } from "@/components/shared/providers";
import { useOwnerData, useDemoStore } from "@/store/demo-store";
import { estimateCost, findBay, money, validateBooking, dateTime } from "@/lib/services/booking-rules";
import { bookingService } from "@/lib/services/bookings";
import type { Station } from "@/types";

export function BookingForm(
  {
    station
  }: {
    station: Station;
  }
) {
  const now = useClock();
  const data = useOwnerData();

  const {
    user,
    loading
  } = useAuth();

  const router = useRouter();
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [duration, setDuration] = useState(60);
  const [error, setError] = useState("");
  const [checkout, setCheckout] = useState(false);
  const [busy, setBusy] = useState(false);
  const [method, setMethod] = useState("Test payment");
  const [promo, setPromo] = useState("");
  const [applied, setApplied] = useState("");
  const [consent, setConsent] = useState(false);
  const [requestId, setRequestId] = useState("");
  const vehicle = data?.vehicles.find(v => v.id === (vehicleId || data.selectedVehicleId));
  const start = date && time ? `${date}T${time}:00+06:00` : "";
  const cost = estimateCost(station, duration, applied, vehicle, start);

  function review() {
    setError("");

    try {
      if (!user) {
        router.push(`/auth/sign-in?next=/stations/${station.id}`);
        return;
      }

      validateBooking(
        station,
        vehicle,
        start,
        duration,
        Object.values(useDemoStore.getState().owners).flatMap(o => o.bookings)
      );

      setRequestId(`HB-${crypto.randomUUID().slice(0, 8).toUpperCase()}`);
      setCheckout(true);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function pay() {
    if (!consent || !vehicle || busy)
      return;

    setBusy(true);
    setError("");

    try {
      const b = await bookingService.reserve({
        stationId: station.id,
        vehicleId: vehicle.id,
        start,
        duration,
        method,
        promo: applied,
        requestId
      });

      setCheckout(false);
      router.push(`/bookings/${b.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const times = Array.from({
    length: 26
  }, (_, i) => `${String(7 + Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`);

  return (
    <aside className="panel booking-panel">
      <div className="panel-top">
        <h2 className="text-xl">Save your spot.</h2>
        <span className="text-sm">
          <strong>{money(station.price)}</strong>
          <span className="muted text-xs">/ kWh</span>
        </span>
      </div>
      <div className="flex justify-between text-[9px] uppercase tracking-wider muted mb-7">
        <span className="text-green-800">✓ Station</span>
        <span className="text-foreground">02 Schedule</span>
        <span>03 Payment</span>
        <span>04 Confirm</span>
      </div>
      <label className="form-field">Charging date<Input
          type="date"
          aria-label="Charging date"
          min={now ? format(new Date(now), "yyyy-MM-dd") : undefined}
          max={now ? format(addDays(new Date(now), 30), "yyyy-MM-dd") : undefined}
          value={date}
          onChange={e => {
            setDate(e.target.value);
            setTime("");
          }} /><span className="text-[10px] muted font-normal">All station times are Bangladesh time (UTC+6).</span></label>
      <div className="form-field">
        <span id="time-label">Choose a time</span>
        {!date ? <p className="text-xs muted py-3">Select a date to see available slots.</p> : <div className="slot-grid" role="group" aria-labelledby="time-label">{times.map(t => {
            const s = `${date}T${t}:00+06:00`;
            const unavailable = !station.online || new Date(s).getTime() <= now || !findBay(station, Object.values(useDemoStore.getState().owners).flatMap(o => o.bookings), s, duration);

            return (
              <button
                key={t}
                className="slot"
                disabled={unavailable}
                aria-pressed={time === t}
                onClick={() => setTime(t)}>{t}</button>
            );
          })}</div>}
      </div>
      <label className="form-field">Your vehicle<select
          className="select-input"
          value={vehicleId || data?.selectedVehicleId || ""}
          onChange={e => setVehicleId(e.target.value)}>
          <option value="" disabled>Select your EV</option>
          {data?.vehicles.map(v => <option value={v.id} key={v.id}>{v.name}· {v.connector}</option>)}
        </select>{user && !data?.vehicles.length && <Link href="/vehicles" className="underline text-xs">Add your first vehicle</Link>}</label>
      <label className="form-field">Charging duration<select
          className="select-input"
          value={duration}
          onChange={e => {
            setDuration(Number(e.target.value));
            setTime("");
          }}>{[30, 60, 90, 120].map(v => <option key={v} value={v}>{v}minutes</option>)}</select></label>
      <div className="bg-muted rounded-lg px-4 mb-5">
        <div className="data-row">
          <span>Estimated energy</span>
          <span>{cost.energy.toFixed(1)}kWh</span>
        </div>
        <div className="data-row">
          <span>Charging estimate</span>
          <span>{money(cost.subtotal)}</span>
        </div>
        <div className="data-row">
          <span>Booking fee</span>
          <span>{money(cost.fee)}</span>
        </div>
        <div className="data-row font-semibold">
          <span>Total estimate</span>
          <span>{money(cost.estimate)}</span>
        </div>
      </div>
      {error && !checkout && <p role="alert" className="error-text mb-3">{error}</p>}
      <Button
        className="w-full !h-12"
        onClick={review}
        disabled={loading || !station.online || station.available === 0}>
        {!user ? "Sign in to reserve" : "Continue to payment"}
        <ArrowRight size={15} />
      </Button>
      <p className="text-[10px] muted mt-4 flex gap-2"><ShieldCheck size={15} className="shrink-0" />Cancel at least 1 hour before your slot for an advance refund minus the ৳20 booking fee.</p>
      <Dialog
        open={checkout}
        onOpenChange={v => {
          if (!busy)
            setCheckout(v);
        }}><DialogContent className="!max-w-lg max-h-[90vh] overflow-y-auto p-6">
          <DialogTitle className="!text-2xl">One step closer.</DialogTitle>
          <DialogDescription>Review your reservation and simulate a payment.</DialogDescription>
          <div className="notice notice-warning">Prototype checkout — no real money moves. Do not enter real card details, PINs, or wallet credentials.</div>
          <div className="rounded-lg bg-muted p-4">
            <strong className="text-sm">{station.name}</strong>
            <p className="text-xs muted mt-1">{start && dateTime(start)}· {duration}minutes</p>
            <p className="text-xs muted">{vehicle?.name}</p>
          </div>
          <div className="form-field mb-0">
            <span>Payment method</span>
            <div className="grid grid-cols-2 gap-2">{["bKash", "Nagad", "Card", "Test payment", "Test failure"].map(m => <button
                key={m}
                className={`slot flex justify-between items-center px-3 !text-xs ${method === m ? "bg-green-50" : ""}`}
                aria-pressed={method === m}
                onClick={() => setMethod(m)}>
                {m}
                {method === m ? <Check size={14} /> : <CreditCard size={14} />}
              </button>)}</div>
            <p className="text-[10px] muted">Select “Test failure” to demonstrate decline and retry.</p>
          </div>
          <div className="flex gap-2">
            <Input
              aria-label="Promo code"
              placeholder="Promo code · try HELIO10"
              value={promo}
              onChange={e => setPromo(e.target.value)} />
            <Button
              variant="outline"
              onClick={() => {
                if (promo.toUpperCase() === "HELIO10") {
                  setApplied("HELIO10");
                  setError("");
                } else {
                  setApplied("");
                  setError("Code not recognized. Try HELIO10.");
                }
              }}>Apply</Button>
          </div>
          {applied && <p className="text-xs text-green-800">HELIO10 applied · 10% off energy <button
              className="underline ml-2"
              onClick={() => {
                setApplied("");
                setPromo("");
              }}>Remove</button></p>}
          <div>
            <div className="data-row">
              <span>Charging + booking fee</span>
              <span>{money(cost.subtotal + cost.fee)}</span>
            </div>
            {cost.discount > 0 && <div className="data-row">
              <span>Promo discount</span>
              <span>−{money(cost.discount)}</span>
            </div>}
            <div className="data-row">
              <span>Estimated total</span>
              <strong>{money(cost.estimate)}</strong>
            </div>
            <div className="data-row">
              <span>Advance due now (30%)</span>
              <strong className="text-xl">{money(cost.advance)}</strong>
            </div>
          </div>
          <p className="text-[10px] muted">Final bill is based on delivered energy. Any unused advance is returned in the demo. Booking fee is non-refundable. Cancellation within 1 hour of the slot is non-refundable.</p>
          <label className="flex items-start gap-2 text-xs"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} className="mt-1" />I understand this is a simulated payment and accept the cancellation policy.</label>
          {error && <p className="error-text" role="alert">{error}</p>}
          <Button className="w-full !h-12" disabled={!consent || busy} onClick={pay}>{busy ? <><LoaderCircle className="animate-spin" />Processing test payment…</> : <>Simulate payment · {money(cost.advance)}<ArrowRight size={15} /></>}</Button>
        </DialogContent></Dialog>
    </aside>
  );
}

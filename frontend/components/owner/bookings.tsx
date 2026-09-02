"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import QRCode from "react-qr-code";
import { CalendarDays, ArrowUpRight, CheckCircle2, Copy, Printer, Zap, MapPin } from "lucide-react";
import { toast } from "sonner";
import { useOwnerData, useDemoStore } from "@/store/demo-store";
import { stationService } from "@/lib/services/stations";
import { bookingService } from "@/lib/services/bookings";
import { chargingService } from "@/lib/services/charging";
import { money, dateTime, refundableAmount } from "@/lib/services/booking-rules";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AssetImage } from "@/components/shared/asset-image";

export function BookingList() {
  const d = useOwnerData();
  const [filter, setFilter] = useState("all");

  if (!d)
    return null;

  const bookings = d.bookings.filter(b => filter === "all" || b.status === filter);

  return (
    <>
      <div className="owner-heading">
        <div>
          <h1>Your next stops.</h1>
          <p>A place for every plan. Manage your charging reservations.</p>
        </div>
        <Link className="action action-dark" href="/stations">New booking <ArrowUpRight size={14} /></Link>
      </div>
      <Tabs value={filter} onValueChange={v => setFilter(String(v))}><TabsList className="mb-6 max-w-full overflow-x-auto !h-11">{["all", "upcoming", "charging", "completed", "cancelled"].map(s => <TabsTrigger key={s} value={s} className="capitalize !px-3 !text-xs">{s}</TabsTrigger>)}</TabsList></Tabs>
      {!bookings.length ? <div className="panel empty-state">
        <CalendarDays className="mx-auto muted" />
        <h3>No {filter === "all" ? "" : filter}bookings yet.</h3>
        <p>Your next clean charge is just a few taps away.</p>
        <Link className="action action-primary" href="/stations">Find a station</Link>
      </div> : <div className="grid-two">{bookings.map(b => <article className="panel" key={b.id}>
          <div className="flex items-center justify-between mb-5">
            <span
              className={`text-[10px] px-2 py-1 rounded capitalize ${b.status === "cancelled" ? "bg-red-50 text-red-700" : "bg-green-50 text-green-800"}`}>{b.status}</span>
            <span className="text-[10px] muted">{b.id}</span>
          </div>
          <h2 className="text-xl">{stationService.get(b.stationId)?.name}</h2>
          <p className="text-xs muted mt-2">{dateTime(b.start)}</p>
          <div className="data-row mt-3">
            <span>Vehicle</span>
            <span>{d.vehicles.find(v => v.id === b.vehicleId)?.name ?? "Archived vehicle"}</span>
          </div>
          <div className="data-row">
            <span>Reservation</span>
            <span>{b.bayId}· {b.duration}min</span>
          </div>
          <div className="flex items-center justify-between mt-5">
            <span className="text-xs">{money(b.advance)}advance</span>
            <Link className="text-xs font-medium flex items-center gap-2" href={`/bookings/${b.id}`}>View details <ArrowUpRight size={14} /></Link>
          </div>
        </article>)}</div>}
    </>
  );
}

export function BookingDetail(
  {
    id
  }: {
    id: string;
  }
) {
  const d = useOwnerData();
  const router = useRouter();
  const bays = useDemoStore(s => s.network.bays);
  const [cancel, setCancel] = useState(false);

  if (!d)
    return null;

  const b = d.bookings.find(b => b.id === id);

  if (!b) return (
    <div className="empty-state">
      <h1 className="text-3xl">Booking not found.</h1>
      <p>This reservation is not associated with your account on this device.</p>
      <Link className="action action-outline" href="/bookings">Back to bookings</Link>
    </div>
  );

  const s = stationService.get(b.stationId);
  if (!s) return <div className="empty-state"><h1>Station details unavailable.</h1><p>Reconnect to load this booking’s station.</p></div>;
  const session = d.sessions.find(x => x.bookingId === b.id);
  const deviceId = bays.find(bay => bay.stationId === b.stationId && bay.id === b.bayId)?.deviceId ?? s.deviceId;
  const refund = refundableAmount(b);

  async function start() {
    try {
      const cs = await chargingService.enter(id);
      router.push(`/charging/${cs.id}`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function cancelBooking() {
    try {
      const amount = await bookingService.cancel(id);
      setCancel(false);
      toast.success(`Booking cancelled. ${money(amount)} simulated refund recorded.`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <>
      <div className="owner-heading">
        <div>
          <Link href="/bookings" className="text-[11px] muted">← My bookings</Link>
          <h1 className="mt-3">{b.status === "cancelled" ? "Plans changed. All sorted." : b.status === "completed" ? "A journey, well charged." : "Your bay is waiting."}</h1>
          <p>Booking {b.id}· <span className="capitalize">{b.status}</span></p>
        </div>
        <Button variant="outline" onClick={() => window.print()}><Printer size={15} />Print</Button>
      </div>
      <div className="dashboard-grid">
        <div className="panel">
          <div className="relative h-52 rounded-xl overflow-hidden mb-6"><AssetImage src={s.image} alt={`${s.name} charging concept`} fill sizes="700px" /></div>
          <h2 className="text-2xl">{s.name}</h2>
          <p className="text-xs muted flex gap-1 items-center mt-2">
            <MapPin size={13} />
            {s.address}
          </p>
          {[
            ["Your reservation", dateTime(b.start)],
            ["Bay & device", `${b.bayId} · ${deviceId}`],
            ["Duration", `${b.duration} minutes`],
            ["Vehicle", d.vehicles.find(v => v.id === b.vehicleId)?.name ?? "Archived vehicle"],
            ["Estimated total", money(b.estimate)],
            ["Advance paid", money(b.advance)]
          ].map(([l, v]) => <div className="data-row" key={l}>
            <span>{l}</span>
            <span className="text-right">{v}</span>
          </div>)}
          <div className="flex flex-wrap gap-3 mt-6 no-print">
            <a
              className="action action-outline !text-xs"
              href={`https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}`}
              target="_blank"
              rel="noreferrer">Directions <ArrowUpRight size={14} /></a>
            <Link className="action action-outline !text-xs" href="/payments">Payment details</Link>
            {b.status === "upcoming" && <Button variant="destructive" onClick={() => setCancel(true)}>Cancel booking</Button>}
          </div>
        </div>
        <div>
          <div className="panel text-center">
            <CheckCircle2
              className={`mx-auto ${b.status === "cancelled" ? "text-muted-foreground" : "text-green-700"}`}
              size={30} />
            <h2 className="text-xl mt-4">{b.status === "cancelled" ? "Booking cancelled" : "Your charging pass"}</h2>
            <p className="text-xs muted mt-2 mb-6">{b.status === "cancelled" ? "This pass is no longer valid." : "Keep this reference handy when you arrive."}</p>
            {b.status !== "cancelled" && <div className="bg-white p-5 inline-block border rounded-xl"><QRCode
                value={`HELIOBAY-DEMO:${b.id}:${deviceId}:${b.bayId}`}
                size={175}
                level="M"
                title={`Demo booking ${b.id}`} /></div>}
            <div className="flex items-center justify-center gap-3 mt-5">
              <strong className="text-sm tracking-wider">{b.id}</strong>
              <button
                aria-label="Copy booking reference"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(b.id);
                    toast.success("Booking reference copied.");
                  } catch {
                    toast.error("Copy unavailable. Select the reference manually.");
                  }
                }}><Copy size={14} /></button>
            </div>
            <p className="text-[10px] muted mt-3">Demo QR only. Not valid at a real charger.</p>
            {["upcoming", "charging"].includes(b.status) && <Button className="w-full !h-12 mt-6" onClick={start}>
              <Zap size={15} />
              {session ? "Open charging session" : "Try live charging demo"}
            </Button>}
            {b.status === "completed" && session && <Link className="action action-primary mt-5" href={`/charging/${session.id}`}>View session summary</Link>}
          </div>
          <p className="notice mt-5">{b.status === "cancelled" ? "Any eligible refund appears immediately in your simulated payment history." : "Demo sessions can start before the reservation time for walkthroughs. Real station access will require backend validation and a device handshake."}</p>
        </div>
      </div>
      <Dialog open={cancel} onOpenChange={setCancel}><DialogContent>
          <DialogTitle>Cancel this reservation?</DialogTitle>
          <DialogDescription>Your bay will be released immediately. This action cannot be undone.</DialogDescription>
          <div className="data-row">
            <span>Advance paid</span>
            <span>{money(b.advance)}</span>
          </div>
          <div className="data-row">
            <span>Simulated refund</span>
            <strong>{money(refund)}</strong>
          </div>
          <p className="text-xs muted">At least 1 hour before the slot: advance minus {money(b.fee)} booking fee and {money(b.cancellationFee ?? 0)} cancellation fee. Within 1 hour: no refund.</p>
          <Button variant="destructive" onClick={cancelBooking}>Confirm cancellation</Button>
          <Button variant="outline" onClick={() => setCancel(false)}>Keep my booking</Button>
        </DialogContent></Dialog>
    </>
  );
}

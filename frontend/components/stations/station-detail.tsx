"use client";
import { isDemo } from "@/lib/config";
import { useClock } from "@/hooks/use-clock";
import { useDemoStore } from "@/store/demo-store";
import { ConnectionStatus } from "@/components/shared/connection-status";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import { MapPin, ArrowUpRight, Sun, BatteryMedium, Zap, Coffee, Wifi, ShieldCheck } from "lucide-react";
import { stationService } from "@/lib/services/stations";
import { PublicShell } from "@/components/shared/public-shell";
import { AssetImage } from "@/components/shared/asset-image";
import { BookingForm } from "@/components/stations/booking-form";

export function StationDetail({ id }: { id: string }) {
  const hydrated = useDemoStore(s => s.hydrated);
  const network = useDemoStore(s => s.network);
  const owners = useDemoStore(s => s.owners);
  const now = useClock();
  const loading = useDemoStore(s => s.apiLoading);
  const error = useDemoStore(s => s.apiError);
  const station = network.stations.some(s => s.id === id) ? stationService.get(id) : undefined;
  if (!hydrated || loading && !station) return <PublicShell><div className="container-wide py-16"><Skeleton className="h-12 w-72 mb-8" /><Skeleton className="h-96 w-full" /></div></PublicShell>;
  if (!station) return <PublicShell><div className="container-wide py-16"><ConnectionStatus /><h1 className="text-3xl">{error ? "Station data unavailable." : "Station not found."}</h1><Link className="action action-outline mt-6" href="/stations">Back to stations</Link></div></PublicShell>;
  const device = network.devices.find(d => d.id === station.deviceId);
  const solar = device?.online && device.telemetry && now - Date.parse(device.telemetry.timestamp) <= 30000 ? device.telemetry.solarPower : null;
  return (
    <PublicShell><div className="container-wide">
        <ConnectionStatus /><div className="page-intro">
          <Link href="/stations" className="text-xs muted">← Back to all stations</Link>
          <h1>{station.name}</h1>
          <p className="flex gap-2 items-center">
            <MapPin size={15} />
            {station.address}
          </p>
        </div>
        <div className="detail-layout">
          <div>
            <div className="detail-photo">
              <AssetImage
                src={station.image}
                alt={`${station.name} architectural concept`}
                fill
                priority
                sizes="(max-width:850px)100vw,60vw" />
              <span className="absolute bottom-4 left-4 text-[10px] bg-white rounded-md px-3 py-2">Concept imagery · Demo station</span>
            </div>
            <div className="flex flex-wrap justify-between items-center gap-3 my-6">
              <span className="text-xs"><span className={`status-dot ${!station.online ? "!bg-red-500" : ""}`} />{station.online ? "Station online" : "Temporarily offline"}· {station.openingHours ?? "07:00–22:00"}</span>
              <a
                className="text-xs flex gap-1 items-center underline"
                href={`https://www.google.com/maps/dir/?api=1&destination=${station.lat},${station.lng}`}
                target="_blank"
                rel="noreferrer">Get directions <ArrowUpRight size={13} /></a>
            </div>
            <div className="grid grid-cols-3 gap-3 mb-7">{[{
                icon: Sun,
                label: "Solar contribution",
                value: `${station.solar}%`
              }, {
                icon: BatteryMedium,
                label: "Station battery",
                value: `${station.battery}%`
              }, {
                icon: Zap,
                label: "Max. output",
                value: `${station.power} kW`
              }].map(m => <div className="panel !p-4" key={m.label}>
                <m.icon size={20} className="text-green-700" />
                <div className="text-2xl mt-3 tracking-tight">{m.value}</div>
                <p className="text-[10px] muted">{m.label}</p>
              </div>)}</div>
            <h2 className="text-xl">A place to pause. Power to go.</h2>
            <p className="text-sm muted my-4">Conveniently located near {station.landmark}, this HelioBay concept brings clean energy to your everyday route. Solar-first charging, comfortable amenities, and a bay you can count on.</p>
            <div className="data-row">
              <span>Connector</span>
              <span>{station.connector}· Up to {station.power}kW</span>
            </div>
            <div className="data-row">
              <span>Grid backup</span>
              <span>{network.devices.find(d => d.id === station.deviceId)?.gridBackup ? "Backup available" : "No backup configured"}</span>
            </div>
            <div className="data-row">
              <span>Device</span>
              <span>{station.deviceId}</span>
            </div>
            <div className="data-row">
              <span>{isDemo ? "Simulated solar production" : "Reported solar production"}</span>
              <span>{solar == null ? "Unavailable" : `${solar.toFixed(2)} W`}</span>
            </div>
            <h3 className="text-lg mt-7 mb-4">Live bay availability</h3>
            <div className="flex gap-2 flex-wrap">{network.bays.filter(b => b.stationId === id).map(bay => {
              const online = network.devices.find(d => d.id === bay.deviceId)?.online;
              const occupied = Object.values(owners).some(o => o.bookings.some(b => b.stationId === id && b.bayId === bay.id && (b.status === "charging" || b.status === "upcoming" && Date.parse(b.start) <= now && Date.parse(b.start) + b.duration * 60000 > now)));
              const status = !station.online || !online ? "Offline" : !bay.enabled ? "Disabled" : bay.maintenance || station.maintenance ? "Maintenance" : bay.blocked ? "Blocked" : occupied ? "Occupied" : "Available";
              return <span className={`px-4 py-3 rounded-lg text-xs border ${status === "Available" ? "bg-green-50 text-green-800" : "bg-muted muted"}`} key={bay.id}>{bay.id} · {status}</span>;
            })}</div>
            {!network.bays.some(b => b.stationId === id) && <p className="text-xs muted">Bay-level telemetry is not available. Availability is rechecked when you reserve.</p>}
            <p className="text-[10px] muted mt-3">{isDemo ? "Demo availability. " : "Reported availability. "}Your chosen time is rechecked when payment completes.</p>
            <h3 className="text-lg mt-7 mb-4">While you recharge</h3>
            <div className="flex flex-wrap gap-4 text-xs muted">{station.amenities.map((a, i) => {
                const Icon = [Wifi, Coffee, ShieldCheck][i % 3];

                return (
                  <span className="flex items-center gap-2" key={a}>
                    <Icon size={16} />
                    {a}
                  </span>
                );
              })}</div>
          </div>
          <BookingForm station={station} />
        </div>
      </div></PublicShell>
  );
}

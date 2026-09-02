"use client";
import "@/app/map.css";
import { useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Heart, ArrowUpRight, Sun, MapPin, Zap, Maximize2, List, Map as MapIcon, Navigation, SlidersHorizontal } from "lucide-react";
import { useCreditData, useCreditStore } from "@/store/credit-store";
import { availableBays, bayState, distance, deviceFresh } from "@/lib/credit/selectors";
import { credits } from "@/lib/credit/money";
import { creditService } from "@/lib/credit/services";
import { isDemo } from "@/lib/config";
import { useClock } from "@/hooks/use-clock";
import type { Station } from "@/lib/credit/model";
import { PublicShell } from "@/components/shared/public-shell";
import { AssetImage } from "@/components/shared/asset-image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Action, ConnectionError, Source } from "./ui";
import { LocationButton, useLocation } from "./location";
import type { ViewportRequest } from "./map";
const Map = dynamic(() => import("./map"), { ssr: false, loading: () => <Skeleton className="h-full w-full" /> });
export function useNearest() { const data = useCreditData(); const location = useLocation(s => s.coordinates); return data.stations.map(s => ({ ...s, distanceKm: location ? distance(location, s) : s.distanceKm })).sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity)); }
export function StationCard({ station, selected = false, onSelect }: { station: Station; selected?: boolean; onSelect?: () => void }) {
  const data = useCreditData(); const clock = useClock(); const now = clock || Date.parse(data.lastTick); const account = useCreditStore(s => s.account); const user = data.users.find(u => u.id === account?.id); const fresh = deviceFresh(data,station.deviceId,now); const bays = data.bays.filter(b => b.stationId === station.id); const count = availableBays(data, station.id, now).length; const saved = user?.savedStations.includes(station.id);
  return <article className={`station-card credit-station-card ${selected ? "selected" : ""}`}><div className="station-card-photo"><AssetImage src={station.image} alt={`${station.name} solar canopy concept`} fill sizes="(max-width:600px)100vw,33vw" /></div><div className="station-card-body"><div className="flex justify-between gap-3"><h3>{station.name}</h3>{user && <Action run={() => creditService.users.update({ savedStations: saved ? user.savedStations.filter(id => id !== station.id) : [...user.savedStations, station.id] })}><Heart size={15} fill={saved ? "currentColor" : "none"} /><span className="sr-only">{saved ? "Unsave" : "Save"} {station.name}</span></Action>}</div><p className="text-xs muted mt-2">{station.address}</p><div className="credit-station-metrics"><span><MapPin size={12} className="inline mr-1" />{station.distanceKm == null ? "Share location for distance" : `${station.distanceKm.toFixed(1)} km · ~${Math.max(2, Math.ceil(station.distanceKm * 3))} min estimated`}</span></div><div className="data-row"><span>{station.online && fresh ? "Ready to charge" : "Currently unavailable"}</span><span>{bays[0]?.connector ?? "Connector unavailable"}</span></div><div className="data-row"><span>{count}/{bays.length} bays available</span><strong>{credits(station.priceMinor)}/kWh</strong></div><p className="text-xs muted my-4"><Sun size={13} className="inline mr-1" />{station.solarPercent}% solar availability</p>{onSelect && <Button className="w-full mb-2" variant="outline" onClick={onSelect}>Show on map</Button>}<Link className="action action-dark" href={`/stations/${station.id}`}>View Station <ArrowUpRight size={14} /></Link></div></article>;
}
function StationPreview({ station }: { station: Station }) {
  const data = useCreditData(); const now = useClock();
  const available = availableBays(data, station.id, now || Date.parse(data.lastTick)).length;
  return <article className="station-preview" aria-label="Selected station preview"><div className="flex items-center justify-between gap-3"><Source>{available ? `${available} bays available` : "No bays available"}</Source><small>{station.distanceKm == null ? "Dhaka" : `${station.distanceKm.toFixed(1)} km away`}</small></div><h2>{station.name}</h2><p>{station.address}</p><div className="preview-rate"><span>{data.bays.find(b => b.stationId === station.id)?.connector ?? "EV charging"} · up to {station.powerKw} kW</span><strong>{credits(station.priceMinor)}/kWh</strong></div><div className="credit-actions"><Link className="action action-dark" href={`/stations/${station.id}`}>View Station <ArrowUpRight size={14} /></Link><a className="action action-outline" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/dir/?api=1&destination=${station.lat},${station.lng}`}><Navigation size={14} />Directions</a></div></article>;
}
export function StationDiscovery() {
  const data = useCreditData(); const clock = useClock(); const now = clock || Date.parse(data.lastTick);
  const ready = useCreditStore(s => s.ready); const error = useCreditStore(s => s.error); const stations = useNearest();
  const account = useCreditStore(s => s.account); const user = data.users.find(u => u.id === account?.id); const location = useLocation();
  const [query, setQuery] = useState(""); const [sort, setSort] = useState("nearest"); const [filter, setFilter] = useState("all");
  const [map, setMap] = useState(true); const [selected, setSelected] = useState(""); const [sheet, setSheet] = useState(false); const [connector, setConnector] = useState("all"); const [advanced, setAdvanced] = useState(false);
  const [request, setRequest] = useState<ViewportRequest | null>(null);
  const rows = stations.filter(s => `${s.name} ${s.address} ${s.landmark}`.toLowerCase().includes(query.toLowerCase()) && (filter !== "available" || availableBays(data, s.id, now).length > 0) && (filter !== "saved" || user?.savedStations.includes(s.id)) && (connector === "all" || data.bays.some(b => b.stationId === s.id && b.connector === connector))).sort((a, b) => sort === "cheapest" ? a.priceMinor - b.priceMinor : sort === "bays" ? availableBays(data, b.id, now).length - availableBays(data, a.id, now).length : sort === "renewable" ? b.solarPercent - a.solarPercent : (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
  const station = rows.find(s => s.id === selected);
  const choose = (id: string) => {
    const s = data.stations.find(s => s.id === id); if (!s) return;
    setSelected(id); setRequest(previous => ({ sequence: (previous?.sequence ?? 0) + 1, kind: "station", coordinates: { lat: s.lat, lng: s.lng } }));
    if (window.innerWidth < 850) setSheet(true);
  };
  return <PublicShell><div className="container-wide credit-discovery">
    <div className="page-intro"><p className="eyebrow">A CLEANER STOP, NEAR YOU</p><h1>Find your next charge.</h1><p>Discover an available bay. Arrive, connect and start with Credits.</p></div>
    <div className={`discovery-explorer ${map ? "is-map" : "is-list"}`}>
      <div className="discovery-toolbar" role="group" aria-label="Station map controls">
        <LocationButton onLocate={coordinates => { setSort("nearest"); setMap(true); setRequest(previous => ({ sequence: (previous?.sequence ?? 0) + 1, kind: "location", coordinates })); }} />
        <Input aria-label="Search stations" placeholder="Station, area or landmark" value={query} onChange={e => setQuery(e.target.value)} />
        <select className="credit-filter" aria-label="Station filter" value={filter} onChange={e => setFilter(e.target.value)}><option value="all">All stations</option><option value="available">Available now</option><option value="saved">Saved stations</option></select>
        <Button variant="outline" onClick={() => setAdvanced(!advanced)} aria-expanded={advanced} aria-controls="station-extra-filters"><SlidersHorizontal size={16} /><span className="sr-only">More filters</span></Button>
        <Button variant="outline" onClick={() => setMap(!map)}>{map ? <List size={16} /> : <MapIcon size={16} />}{map ? "List view" : "Map view"}</Button>
      </div>
      {advanced && <div id="station-extra-filters" className="discovery-extra-filters">
        <label>Sort<select className="credit-filter" aria-label="Sort stations" value={sort} onChange={e => setSort(e.target.value)}><option value="nearest">Nearest</option><option value="cheapest">Cheapest</option><option value="bays">Available bays</option><option value="renewable">Renewable percentage</option></select></label>
        <label>Connector<select className="credit-filter" aria-label="Connector filter" value={connector} onChange={e => setConnector(e.target.value)}><option value="all">All connectors</option><option>CCS2</option><option>Type 2</option></select></label>
      </div>}
      {location.error && <p role="alert" className="discovery-location-message">{location.error}</p>}
      <div className="discovery-map" hidden={!map}>
        {!ready ? <Skeleton className="h-full w-full" /> : <Map stations={rows} selected={selected} onSelect={choose} request={request} />}
        {ready && <Button className="fit-stations-button" variant="outline" disabled={!rows.length} onClick={() => setRequest(previous => ({ sequence: (previous?.sequence ?? 0) + 1, kind: "fit", coordinates: rows.map(s => ({ lat: s.lat, lng: s.lng })) }))}><Maximize2 size={16} />Fit stations</Button>}
        {station && <div className="desktop-map-preview"><StationPreview station={station} /></div>}
        <div className="map-legend"><span><i className="available" />Available</span><span><i className="busy" />Busy</span><span><i className="offline" />Offline</span></div>
      </div>
    </div>
    <div className="discovery-results-label"><span>{rows.length} stations {location.coordinates ? "· nearest to your location" : "in the network"}</span>{location.coordinates && <span><MapPin size={12} />Your current location <small>±{Math.round(location.accuracy ?? 0)} m · this visit only</small></span>}</div>
    {error ? <section className="empty-state"><h2>Station data unavailable.</h2><ConnectionError /></section> : !ready ? <Skeleton className="h-40" /> : !rows.length ? <div className="empty-state"><h2>No stations match your search.</h2><Button variant="outline" onClick={() => { setQuery(""); setFilter("all"); setConnector("all"); }}>Clear filters</Button></div> : <div className={map ? "map-station-strip" : "credit-station-list"}>{rows.map(s => <StationCard key={s.id} station={s} selected={map && s.id === selected} onSelect={map ? () => choose(s.id) : undefined} />)}</div>}
    <Sheet open={sheet} onOpenChange={setSheet}><SheetContent side="bottom" className="map-preview-sheet"><SheetTitle>Selected station</SheetTitle><SheetDescription>Availability, charging rate and directions.</SheetDescription>{station && <StationPreview station={station} />}</SheetContent></Sheet>
  </div></PublicShell>;
}
export function StationDetails({ id }: { id: string }) {
  const data = useCreditData(); const clock = useClock(); const now = clock || Date.parse(data.lastTick); const ready = useCreditStore(s => s.ready); const s = useNearest().find(s => s.id === id);
  if (!ready) return <PublicShell><div className="container-wide py-16"><Skeleton className="h-96" /></div></PublicShell>;
  if (!s) return <PublicShell><div className="empty-state"><h1>Station unavailable.</h1><ConnectionError /><Link className="action action-outline" href="/stations">Back to stations</Link></div></PublicShell>;
  return <PublicShell><div className="container-wide"><ConnectionError /><div className="page-intro"><Link className="text-xs muted" href="/stations">← All stations</Link><h1>{s.name}</h1><p>{s.address}</p></div><div className="detail-layout"><div><div className="detail-photo"><AssetImage src={s.image} alt={`${s.name} concept solar charging canopy`} fill priority sizes="(max-width:850px)100vw,60vw" /></div><p className="text-[10px] muted mt-2">Original concept imagery · {isDemo ? "Demo station" : "Architectural illustration"}</p><div className="metric-grid">{[["Solar availability", `${s.solarPercent}%`], ["Charge rate", `${s.powerKw} kW`], ["Available bays", `${availableBays(data, id, now).length}`]].map(([l,v]) => <div key={l}><small className="muted">{l}</small><strong className="text-2xl block mt-2">{v}</strong></div>)}</div><h2 className="text-xl mb-5">Know your bay before you plug in.</h2><div className="credit-grid">{data.bays.filter(b => b.stationId === id).map(b => <Link className="credit-bay" href={`/charge?station=${id}&bay=${b.id}`} key={b.id}><Zap size={20} /><strong>Bay {String(b.number).padStart(2, "0")}</strong><Source>{bayState(data, b, now)}</Source><span className="text-xs muted">{b.connector}</span></Link>)}</div><h3 className="text-lg mt-7">While you recharge</h3><p className="muted text-sm mt-3">{s.amenities.join(" · ")}</p></div><section className="panel h-fit credit-form"><h2 className="text-2xl">Connect. Confirm. Charge.</h2><p className="text-sm muted">Arrive at the station and connect your plug before starting. Choose the bay number printed at the charger.</p><div className="data-row"><span>Station status</span><span>{s.online && deviceFresh(data,s.deviceId,now) ? "Ready to charge" : "Currently unavailable"}</span></div><div className="data-row"><span>Price per kWh</span><strong>{credits(s.priceMinor)}</strong></div><div className="data-row"><span>Opening hours</span><span>{s.openingHours}</span></div><a className="action action-outline" href={`https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}`} target="_blank" rel="noreferrer">Get directions <ArrowUpRight size={14} /></a><Link className="action action-primary" href={`/charge?station=${id}`}>Connect and Start</Link><p className="text-xs muted">Your available wallet balance limits this session. Only delivered energy is debited.</p></section></div></div></PublicShell>;
}

"use client";
import { useState } from "react";
import Link from "next/link";
import { Plus, ArrowUpRight, MapPin } from "lucide-react";
import { toast } from "sonner";
import { useDemoStore } from "@/store/demo-store";
import { platform } from "@/lib/platform";
import { stationSnapshot } from "@/lib/platform/selectors";
import { AdminHeading, DataGrid, Status, ConfirmAction, useUnsaved } from "./shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { AssetImage } from "@/components/shared/asset-image";
import type { Station, Bay } from "@/types";

function StationEditor({ initial, close }: { initial: Station; close: () => void }) {
  const [draft, setDraft] = useState(initial); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const canClose = useUnsaved(JSON.stringify(draft) !== JSON.stringify(initial));
  const change = (key: keyof Station, value: string | number) => setDraft(d => ({ ...d, [key]: value }));
  const existing = useDemoStore(s => s.network.stations.some(x => x.id === initial.id));
  return <Dialog open onOpenChange={v => { if (!v && !busy && canClose()) close(); }}><DialogContent className="!max-w-2xl max-h-[90dvh] overflow-y-auto"><DialogTitle>{existing ? "Edit station" : "Add station"}</DialogTitle><DialogDescription>Changes update owner availability and pricing. Use station controls to take a site offline.</DialogDescription>
    <form onSubmit={async e => { e.preventDefault(); setBusy(true); setError(""); try { await platform.admin.saveStation(draft); toast.success("Station saved."); close(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }}>
      <div className="admin-form-grid">{([ ["name", "Station name"], ["address", "Address"], ["landmark", "Landmark"], ["openingHours", "Opening hours (07:00–22:00)"], ["lat", "Latitude"], ["lng", "Longitude"], ["price", "Price per kWh (৳)"], ["power", "Maximum power (kW)"], ["bays", "Number of bays"], ["deviceId", "Primary ESP32 Device ID"] ] as const).map(([key, label]) => <label key={key}>{label}<Input required value={draft[key] ?? ""} disabled={existing && ["bays", "deviceId"].includes(key)} type={["lat", "lng", "price", "power", "bays"].includes(key) ? "number" : "text"} step={key === "bays" ? "1" : "any"} onChange={e => change(key, ["lat", "lng", "price", "power", "bays"].includes(key) ? Number(e.target.value) : e.target.value)} /></label>)}<label>Connector<select value={draft.connector} onChange={e => change("connector", e.target.value)}><option>CCS2</option><option>Type 2</option></select></label><label>Amenities<Input value={draft.amenities.join(", ")} onChange={e => setDraft(d => ({ ...d, amenities: e.target.value.split(",").map(x => x.trim()).filter(Boolean) }))} /></label></div>
      {error && <p className="notice notice-warning mt-4" role="alert">{error}</p>}<Button type="submit" disabled={busy} className="mt-6 w-full">{busy ? "Saving…" : "Save station"}</Button>
    </form>
  </DialogContent></Dialog>;
}

export function AdminStations({ stationId }: { stationId?: string }) {
  const network = useDemoStore(s => s.network); const owners = useDemoStore(s => s.owners);
  const [filter, setFilter] = useState("all"); const [selected, setSelected] = useState<string | null>(null); const [edit, setEdit] = useState<Station | null>(null);
  const stations = network.stations.map(s => stationSnapshot({ network, owners }, s.id)!);
  const station = stations.find(s => s.id === (stationId ?? selected));
  function add() { setEdit({ id: `station-${crypto.randomUUID().slice(0, 6)}`, name: "HelioBay ", address: "", landmark: "", lat: 23.7937, lng: 90.4066, distance: 0, price: network.pricing.pricePerKwh, solar: 85, power: 60, available: 2, bays: 2, online: true, connector: "CCS2", battery: 80, amenities: ["Wi-Fi", "Restrooms"], image: "/images/station.webp", deviceId: `ST-${crypto.randomUUID().slice(0, 5).toUpperCase()}`, openingHours: "07:00–22:00", maintenance: false }); }
  const detail = station && <>
    <div className="relative h-44 rounded-xl overflow-hidden mb-5"><AssetImage src={station.image} alt={`${station.name} concept solar canopy`} fill sizes="600px" /></div>
    <div className="flex gap-2 flex-wrap mb-5"><Status good={station.online}>{station.online ? "Online" : "Offline"}</Status><Status>{station.available} reservable bays</Status><Status>{station.maintenance ? "Maintenance mode" : "In service"}</Status></div>
    <p className="text-sm muted flex gap-2"><MapPin size={16} />{station.address}</p>
    {[ ["Device", station.deviceId], ["Connector", `${station.connector} · ${station.power} kW`], ["Price", `৳${station.price}/kWh`], ["Opening hours", station.openingHours ?? "07:00–22:00"], ["Station battery", `${station.battery.toFixed(0)}%`], ["Amenities", station.amenities.join(" · ")] ].map(([label, value]) => <div key={label} className="data-row"><span>{label}</span><span>{value}</span></div>)}
    <div className="flex flex-wrap gap-3 mt-5"><Button onClick={() => { setSelected(null); setEdit(station); }}>Edit station</Button><Link className="action action-outline !text-xs" href={`/stations/${station.id}`}>Owner view <ArrowUpRight size={13} /></Link></div>
    <div className="flex flex-wrap gap-3 mt-4"><ConfirmAction label={station.online ? "Take offline" : "Bring online"} title="Change station availability?" description="Taking a station offline safely ends its demo charging sessions. Upcoming bookings remain visible and can be reassigned or cancelled." danger={station.online} action={() => platform.admin.saveStation({ ...station, online: !station.online })} /><ConfirmAction label={station.maintenance ? "End maintenance" : "Maintenance mode"} title="Change maintenance mode?" description="Maintenance blocks new reservations and ends active demo sessions at this station." danger={!station.maintenance} action={() => platform.admin.saveStation({ ...station, maintenance: !station.maintenance })} /></div>
    {!stationId && <Link className="action action-dark mt-5 w-full" href={`/admin/stations/${station.id}`}>Open full station details</Link>}
  </>;
  return <>
    <AdminHeading title={stationId ? station?.name ?? "Station not found" : "Places that power possibility."} description={stationId ? "Availability, pricing and bay operations in one place." : "Your network, station by station. Changes are shared with EV Owners."} action={!stationId && <Button onClick={add}><Plus size={16} />Add station</Button>} />
    {stationId ? station ? <><div className="panel mb-6">{detail}</div><AdminBays stationId={stationId} embedded /></> : <div className="empty-state"><Link href="/admin/stations" className="action action-outline">All stations</Link></div> : <DataGrid name="stations" rows={stations.filter(s => filter === "all" || (filter === "online" ? s.online : !s.online))} columns={[
      { label: "Station", value: s => s.name, render: s => <div><strong>{s.name}</strong><p className="text-xs muted mt-1">{s.address}</p></div> },
      { label: "Status", value: s => s.online ? "Online" : "Offline", render: s => <Status good={s.online}>{s.online ? "Online" : "Offline"}</Status> },
      { label: "Bays", value: s => `${s.available}/${s.bays}` }, { label: "Solar", value: s => `${s.solar}%` }, { label: "৳ / kWh", value: s => s.price },
    ]} filters={<select aria-label="Station status" value={filter} onChange={e => setFilter(e.target.value)}><option value="all">All stations</option><option value="online">Online</option><option value="offline">Offline</option></select>} onInspect={s => setSelected(s.id)} />}
    <Sheet open={Boolean(selected)} onOpenChange={v => { if (!v) setSelected(null); }}><SheetContent className="admin-detail-sheet"><SheetTitle>{station?.name}</SheetTitle><SheetDescription>Shared station details and operational controls.</SheetDescription>{detail}</SheetContent></Sheet>
    {edit && <StationEditor key={edit.id} initial={edit} close={() => setEdit(null)} />}
  </>;
}

export function AdminBays({ stationId, embedded = false }: { stationId?: string; embedded?: boolean }) {
  const network = useDemoStore(s => s.network); const [selected, setSelected] = useState<string | null>(null); const [filter, setFilter] = useState("all"); const [assignment, setAssignment] = useState("");
  const rows = network.bays.filter(b => !stationId || b.stationId === stationId).map(b => ({ ...b, id: `${b.stationId}/${b.id}`, bayId: b.id }));
  const bay = rows.find(b => b.id === selected);
  const update = (patch: Partial<Bay>) => platform.admin.updateBay(bay!.stationId, bay!.bayId, patch);
  return <>
    {!embedded && <AdminHeading title="A place for every charge." description="Enable, block or maintain bays. A disruptive change requires confirmation." />}
    <DataGrid name="bays" rows={rows.filter(b => filter === "all" || (filter === "available" ? b.enabled && !b.blocked && !b.maintenance : !b.enabled || b.blocked || b.maintenance))} columns={[
      { label: "Bay", value: b => b.bayId }, { label: "Station", value: b => network.stations.find(s => s.id === b.stationId)?.name ?? b.stationId },
      { label: "ESP32", value: b => b.deviceId }, { label: "Status", value: b => !b.enabled ? "Disabled" : b.maintenance ? "Maintenance" : b.blocked ? "Blocked" : "Available", render: b => <Status good={b.enabled && !b.blocked && !b.maintenance}>{!b.enabled ? "Disabled" : b.maintenance ? "Maintenance" : b.blocked ? "Blocked" : "Available"}</Status> },
    ]} filters={<select aria-label="Bay status" value={filter} onChange={e => setFilter(e.target.value)}><option value="all">All bays</option><option value="available">Available</option><option value="unavailable">Unavailable</option></select>} onInspect={b => { setSelected(b.id); setAssignment(b.deviceId); }} />
    <Sheet open={Boolean(bay)} onOpenChange={v => { if (!v) setSelected(null); }}><SheetContent className="admin-detail-sheet"><SheetTitle>{bay?.bayId} · Bay controls</SheetTitle><SheetDescription>Availability changes stop active demo charging and are recorded in the audit trail.</SheetDescription>{bay && <><p>{network.stations.find(s => s.id === bay.stationId)?.name}</p><div className="flex flex-wrap gap-3"><ConfirmAction label={bay.enabled ? "Disable bay" : "Enable bay"} title="Change bay availability?" description="Disabling this bay stops any active demo session and prevents new reservations." danger={bay.enabled} action={() => update({ enabled: !bay.enabled })} /><ConfirmAction label={bay.blocked ? "Unblock bay" : "Block bay"} title="Change bay block?" description="Blocked bays cannot be reserved. Active demo charging will be stopped." danger={!bay.blocked} action={() => update({ blocked: !bay.blocked })} /><ConfirmAction label={bay.maintenance ? "End maintenance" : "Schedule maintenance"} title="Change bay maintenance?" description="Maintenance removes this bay from owner availability." action={() => update({ maintenance: !bay.maintenance })} /></div><label className="mt-4 text-sm">Assign ESP32 Device ID<Input value={assignment} onChange={e => setAssignment(e.target.value.toUpperCase())} className="mt-2" /></label><ConfirmAction label="Assign device" title="Reassign device identity?" description="Use an unused identifier. Existing active sessions must finish first." disabled={assignment === bay.deviceId || !assignment} action={() => update({ deviceId: assignment })} /><Link href={`/admin/devices?device=${bay.deviceId}`} className="action action-outline">Inspect device</Link></>}</SheetContent></Sheet>
  </>;
}

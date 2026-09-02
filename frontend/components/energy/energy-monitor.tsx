"use client";
import "@/app/energy.css";
import { useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowUpRight, Sun, BatteryMedium, Zap, UtilityPole, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { useCreditData } from "@/store/credit-store";
import { useClock } from "@/hooks/use-clock";
import { availableBays } from "@/lib/credit/selectors";
import { bdt, credits, decimal, parseCredits } from "@/lib/credit/money";
import { creditService } from "@/lib/credit/services";
import { aggregateHistory, telemetryFresh, telemetryLabel } from "@/lib/energy/adapter";
import { type StationEnergy, type StationTelemetry } from "@/lib/energy/model";
import { StationEnergyFlow } from "./station-energy-flow";
import { DataGrid } from "@/components/admin/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Source, timestamp } from "@/components/credit/ui";
const Chart = dynamic(() => import("./energy-chart"), { loading: () => <div className="energy-chart notice" role="status">Loading energy chart…</div> });
const number = (n: number, unit: string) => `${n.toFixed(2)} ${unit}`;
const date = (iso: string) => new Date(iso).toLocaleString("en-GB", { timeZone: "Asia/Dhaka", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

function Metrics({ t, compact = false }: { t: StationTelemetry; compact?: boolean }) {
  return <dl className={compact ? "energy-mini-metrics" : "energy-kpis"}>
    {[
      [Sun, "Solar generation", number(t.solar.powerKw, "kW"), `${number(t.solar.currentA, "A")} · ${number(t.solar.energyTodayKwh, "kWh today")}`],
      [BatteryMedium, "Battery storage", `${t.battery.socPct.toFixed(1)}%`, `${number(t.battery.availableKwh, "kWh available")} / ${t.battery.capacityKwh} kWh · ${t.battery.state}`],
      [Zap, "EV charging load", number(t.evLoad.powerKw, "kW"), `${number(t.evLoad.energyTodayKwh, "kWh today")} · ${t.evLoad.activeSessions} sessions`],
      [UtilityPole, "Grid import / export", `${t.grid.importPowerKw.toFixed(1)} / ${t.grid.exportPowerKw.toFixed(1)} kW`, `${t.grid.importEnergyTodayKwh.toFixed(2)} in / ${t.grid.exportEnergyTodayKwh.toFixed(2)} out · kWh today`],
    ].map(([Icon, label, value, detail]) => { const Symbol = Icon as typeof Sun; return <div key={String(label)}><dt><Symbol size={16} />{String(label)}</dt><dd>{String(value)}</dd><small>{String(detail)}</small></div>; })}
  </dl>;
}

export function EnergyOverview() {
  const data = useCreditData(); const clock = useClock(); const now = clock || Date.parse(data.lastTick);
  return <section className="energy-overview"><div className="panel-top"><div><h2 className="text-2xl">Every station. One clear picture.</h2><p className="text-xs muted mt-2">Generation, storage and two-way grid metering.</p></div></div>
    <div className="energy-station-grid">{data.stations.map(station => {
      const record = data.energy.find(e => e.stationId === station.id); const t = record?.current; const available = availableBays(data, station.id, now).length;
      const occupied = data.sessions.filter(s => s.stationId === station.id && s.state !== "completed").length;
      return <article className="panel energy-station" key={station.id}>
        <header><div><h3>{station.name}</h3><p>{station.address}</p></div><Link className="energy-open" href={`/admin/stations/${station.id}`} aria-label={`Monitor ${station.name}`}><ArrowUpRight size={19} /></Link></header>
        <div className="energy-station-status"><span>{station.online ? "Operational" : "Offline"} · {available} available / {occupied} occupied bays</span>{t && <Source>{telemetryLabel(t, now, data.policy.communicationTimeoutMs)}</Source>}</div>
        {t ? <><Metrics t={t} compact /><div className="energy-station-footer"><span>Estimated export earnings <strong>{record.policy.exportTariffMinor ? bdt(t.finance.exportEarningsMinor) : "Tariff not configured"}</strong></span><span>Controller {t.controller.status}<small>Last telemetry: {timestamp(t.controller.lastSeenAt)}</small></span></div></> : <p className="notice">Energy telemetry unavailable. Connect a station energy source to begin monitoring.</p>}
      </article>;
    })}</div>
  </section>;
}

function PolicyDialog({ record, close }: { record: StationEnergy; close: () => void }) {
  const [policy, setPolicy] = useState(record.policy); const [importRate, setImportRate] = useState(decimal(policy.importTariffMinor)); const [exportRate, setExportRate] = useState(decimal(policy.exportTariffMinor)); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  return <Dialog open onOpenChange={open => { if (!open && !busy) close(); }}><DialogContent className="max-h-[90dvh] overflow-auto"><DialogTitle>Station energy policy</DialogTitle><DialogDescription>Operator configuration, not a government tariff. New rates apply only to subsequent energy intervals.</DialogDescription>
    <form className="credit-form" onSubmit={async e => { e.preventDefault(); setBusy(true); try { await creditService.energy.configure(record.stationId, { ...policy, importTariffMinor: parseCredits(importRate), exportTariffMinor: parseCredits(exportRate) }); toast.success("Station energy policy saved."); close(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }}>
      {([["capacityKwh", "Battery capacity (kWh)"], ["minSocPct", "Minimum reserve (%)"], ["maxSocPct", "Maximum SOC (%)"], ["maxChargeKw", "Battery charge limit (kW)"], ["maxDischargeKw", "Battery discharge limit (kW)"], ["auxiliaryKw", "Auxiliary demand (kW)"]] as const).map(([key, label]) => <label key={key}>{label}<Input type="number" min="0" required step="0.1" value={policy[key]} onChange={e => setPolicy({ ...policy, [key]: Number(e.target.value) })} /></label>)}
      <label>Import tariff (BDT / kWh)<Input inputMode="decimal" value={importRate} onChange={e => setImportRate(e.target.value)} required /></label>
      <label>Export tariff (BDT / kWh)<Input inputMode="decimal" value={exportRate} onChange={e => setExportRate(e.target.value)} required /></label>
      <p className="text-xs muted">A zero tariff means earnings or costs are not configured. Existing wallet charging tariffs are separate.</p>{error && <p role="alert" className="error-text">{error}</p>}<Button disabled={busy} type="submit">{busy ? "Saving…" : "Save energy policy"}</Button>
    </form>
  </DialogContent></Dialog>;
}

export function EnergyHistory({ record }: { record: StationEnergy }) {
  const [period, setPeriod] = useState("live"); const [from, setFrom] = useState(""); const [to, setTo] = useState("");
  const now = Date.parse(record.current.timestamp);
  const fromTime = period === "custom" ? from ? Date.parse(`${from}T00:00:00+06:00`) : NaN : now - Number(period === "live" ? 1 : period) * 86400000;
  const toTime = period === "custom" ? to ? Date.parse(`${to}T23:59:59+06:00`) : NaN : now;
  const invalid = !Number.isFinite(fromTime) || !Number.isFinite(toTime) || fromTime > toTime;
  const rows = invalid ? [] : aggregateHistory(record.history, Math.floor(fromTime / 3600000) * 3600000, toTime, toTime - fromTime > 2 * 86400000 ? 86400000 : 3600000);
  const sum = (key: "solarKwh" | "evKwh" | "importKwh" | "exportKwh" | "importCostMinor" | "exportEarningsMinor") => rows.reduce((n, row) => n + row[key], 0);
  const chartRows = rows.map(r => ({ ...r, label: date(r.at), importCostBdt: r.importCostMinor / 100, exportEarningsBdt: r.exportEarningsMinor / 100 }));
  const liveRows = record.samples.map(t => ({ label: new Date(t.timestamp).toLocaleTimeString("en-GB", { timeZone: "Asia/Dhaka" }), solar: t.solar.powerKw, battery: t.battery.powerKw, ev: t.evLoad.powerKw, import: t.grid.importPowerKw, export: t.grid.exportPowerKw }));
  return <section className="energy-history panel"><div className="panel-top"><div><h2 className="text-xl">Energy over time</h2><p className="text-xs muted mt-2">{record.current.telemetrySource === "digital_twin" ? "Digital Twin history accumulates while this browser is running." : "Recorded station intervals. Missing data is not interpolated."}</p></div></div>
    <div className="energy-range" role="group" aria-label="Energy history range">{[["live", "Live"], ["1", "Last 24 hours"], ["7", "Last 7 days"], ["30", "Last 30 days"], ["custom", "Custom range"]].map(([value, label]) => <Button key={value} variant={period === value ? "default" : "outline"} onClick={() => setPeriod(value)} aria-pressed={period === value}>{label}</Button>)}</div>
    {period === "custom" && <div className="energy-range mt-4"><label>From<Input aria-label="Energy history from" type="date" value={from} onChange={e => setFrom(e.target.value)} /></label><label>To<Input aria-label="Energy history to" type="date" value={to} onChange={e => setTo(e.target.value)} /></label></div>}
    {invalid ? <p className="notice mt-5" role="status">Choose a valid start and end date.</p> : period === "live" ? <><Chart rows={liveRows} unit="kW" label="Latest station power samples" series={[{ key: "solar", label: "Solar", color: "#007a42" }, { key: "battery", label: "Battery (+ charge)", color: "#ac741d", dashed: true }, { key: "ev", label: "EV", color: "#111f18" }, { key: "import", label: "Grid import", color: "#64748b", dashed: true }, { key: "export", label: "Grid export", color: "#57976a" }]} /><p className="text-xs muted">Latest {liveRows.length} recorded samples. Live is a time window; the source badge identifies measured, estimated or simulated data.</p></> : !rows.length ? <p className="notice mt-5">No energy intervals recorded in this range. Try another period.</p> : <>
      <div className="energy-period-totals">{[["Solar", number(sum("solarKwh"), "kWh")], ["EV delivered", number(sum("evKwh"), "kWh")], ["Imported / exported", `${sum("importKwh").toFixed(2)} / ${sum("exportKwh").toFixed(2)} kWh`], ["Import cost / export earnings", `${bdt(sum("importCostMinor"))} / ${bdt(sum("exportEarningsMinor"))}`]].map(([label, value]) => <div key={label}><small>{label}</small><strong>{value}</strong></div>)}</div>
      <Chart rows={chartRows} unit="kWh" label="Solar generation, EV delivery and grid import versus export" series={[{ key: "solarKwh", label: "Solar", color: "#007a42" }, { key: "evKwh", label: "EV", color: "#111f18" }, { key: "importKwh", label: "Grid import", color: "#64748b", dashed: true }, { key: "exportKwh", label: "Grid export", color: "#57976a", dashed: true }]} />
      <div className="energy-chart-pair"><div><h3>Battery state of charge</h3><Chart rows={chartRows} unit="%" label="Battery state of charge at interval end" series={[{ key: "batterySocPct", label: "SOC", color: "#007a42" }]} /></div><div><h3>Battery charge / discharge power</h3><Chart rows={chartRows} unit="kW" label="Time-weighted battery power" series={[{ key: "batteryKw", label: "Battery", color: "#ac741d" }]} /></div></div>
      <Chart rows={chartRows} unit="BDT" label="Configured import cost and export earnings" series={[{ key: "importCostBdt", label: "Import cost", color: "#64748b", dashed: true }, { key: "exportEarningsBdt", label: "Export earnings", color: "#007a42" }]} />
    </>}
    {!invalid && rows.length > 0 && <details className="energy-records"><summary>Interval records & CSV export</summary><DataGrid name="station energy history" rows={rows} columns={[{ label: "Interval (Dhaka)", value: r => date(r.at) }, { label: "Solar kWh", value: r => r.solarKwh.toFixed(4) }, { label: "EV kWh", value: r => r.evKwh.toFixed(4) }, { label: "SOC %", value: r => r.batterySocPct.toFixed(2) }, { label: "Battery kW", value: r => r.batteryKw.toFixed(2) }, { label: "Import kWh", value: r => r.importKwh.toFixed(4) }, { label: "Export kWh", value: r => r.exportKwh.toFixed(4) }, { label: "Import BDT", value: r => decimal(r.importCostMinor) }, { label: "Export BDT", value: r => decimal(r.exportEarningsMinor) }]} /></details>}
  </section>;
}

export function StationEnergyMonitor({ stationId }: { stationId: string }) {
  const data = useCreditData(); const clock = useClock(); const [editing, setEditing] = useState(false);
  const record = data.energy.find(e => e.stationId === stationId); const now = clock || Date.parse(data.lastTick);
  if (!record) return <section className="panel mb-6"><h2 className="text-xl">Station energy monitoring</h2><p className="notice mt-4">Energy telemetry is not available for this station. No simulated values are substituted for missing backend measurements.</p></section>;
  const t = record.current; const fresh = telemetryFresh(t, now, data.policy.communicationTimeoutMs); const sessions = data.sessions.filter(s => s.stationId === stationId && s.state !== "completed");
  return <div className="station-energy-monitor"><section className="panel"><div className="panel-top"><div><p className="eyebrow mb-3">STATION ENERGY</p><h2 className="text-2xl">A balanced flow of power.</h2></div><Source>{telemetryLabel(t, now, data.policy.communicationTimeoutMs)}</Source></div>
    {!fresh && <p className="notice notice-warning mb-4" role="status">Current values are last known, not live. Controller {t.controller.status}; last telemetry received {timestamp(t.controller.lastSeenAt)}.</p>}
    <StationEnergyFlow telemetry={t} fresh={fresh} />
  </section><Metrics t={t} /><div className="energy-chart-pair"><section className="panel"><div className="panel-top"><h3 className="panel-title">Storage & controller health</h3><BatteryMedium size={20} /></div><strong className="text-3xl">{t.battery.socPct.toFixed(1)}%</strong><Progress value={t.battery.socPct} aria-label="Station battery state of charge" className="my-5" />
    <div className="data-row"><span>Configured operating range</span><strong>{record.policy.minSocPct}%–{record.policy.maxSocPct}%</strong></div><div className="data-row"><span>Controller ID</span><strong>{data.stations.find(s => s.id === stationId)?.deviceId}</strong></div><div className="data-row"><span>Controller status</span><strong>{fresh ? "Online" : t.controller.status === "offline" ? "Offline" : "Stale"}</strong></div><div className="data-row"><span>Last telemetry received</span><span>{timestamp(t.controller.lastSeenAt)}</span></div><Button className="mt-5" variant="outline" onClick={() => setEditing(true)}><SlidersHorizontal size={15} />Energy policy</Button>
  </section><section className="panel energy-earnings"><p className="eyebrow">TODAY’S GRID EXCHANGE</p><h3>{record.policy.exportTariffMinor ? bdt(t.finance.exportEarningsMinor) : "Set your export tariff"}</h3><p className="text-xs muted">Estimated export earnings · not a settlement or guaranteed payment</p><div className="data-row"><span>Exported energy</span><strong>{number(t.grid.exportEnergyTodayKwh, "kWh")}</strong></div><div className="data-row"><span>Configured export rate</span><strong>{record.policy.exportTariffMinor ? `${bdt(record.policy.exportTariffMinor)}/kWh` : "Not configured"}</strong></div><div className="data-row"><span>Imported energy</span><strong>{number(t.grid.importEnergyTodayKwh, "kWh")}</strong></div><div className="data-row"><span>Import cost</span><strong>{record.policy.importTariffMinor ? bdt(t.finance.importCostMinor) : "Tariff not configured"}</strong></div><p className="text-xs muted mt-4">Energy × the tariff in effect for each interval. Changing a tariff never rewrites historical earnings.</p></section></div>
    <EnergyHistory record={record} />
    <section className="panel"><h2 className="panel-title mb-4">Active charging sessions</h2>{sessions.length ? sessions.map(s => <Link href="/admin/sessions" className="data-row" key={s.id}><span>{data.users.find(u => u.id === s.ownerId)?.name} · Bay {data.bays.find(b => b.id === s.bayId)?.number}</span><span>{s.state} · {credits(s.costMinor)} <ArrowUpRight size={13} className="inline" /></span></Link>) : <p className="text-sm muted">No EV is charging. Solar surplus charges storage first, then exports to the grid.</p>}</section>
    {editing && <PolicyDialog record={record} close={() => setEditing(false)} />}
  </div>;
}

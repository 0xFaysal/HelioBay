"use client";
import { useState } from "react";
import dynamic from "next/dynamic";
import { useDemoStore } from "@/store/demo-store";
import { analytics, dhakaDay } from "@/lib/platform/analytics";
import { AdminHeading, DataGrid } from "./shared";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { money } from "@/lib/services/booking-rules";
const Chart = dynamic(() => import("./charts"), { loading: () => <Skeleton className="h-72" /> });
export function AdminAnalytics() {
  const network = useDemoStore(s => s.network); const owners = useDemoStore(s => s.owners);
  const [from, setFrom] = useState(() => dhakaDay(new Date(Date.now() - 6 * 86400000).toISOString())); const [to, setTo] = useState(() => dhakaDay(new Date().toISOString()));
  const invalid = !from || !to || from > to || (Date.parse(to) - Date.parse(from)) / 86400000 > 92;
  const points = invalid ? [] : analytics({ network, owners }, from, to);
  const total = points.reduce((a, p) => ({ solar: a.solar + p.solar, energy: a.energy + p.demand, revenue: a.revenue + p.revenue, count: a.count + p.sessions, duration: a.duration + p.duration * p.sessions, grid: a.grid + p.grid, exported: a.exported + p.exported }), { solar: 0, energy: 0, revenue: 0, count: 0, duration: 0, grid: 0, exported: 0 });
  return <>
    <AdminHeading title="A clearer picture of progress." description="Recorded sessions and transactions. Demo environmental figures are illustrative, never certified claims." />
    <div className="panel admin-toolbar mb-6"><label className="text-xs">From<Input type="date" value={from} onChange={e => setFrom(e.target.value)} /></label><label className="text-xs">Through<Input type="date" value={to} onChange={e => setTo(e.target.value)} /></label><Button variant="outline" onClick={() => { setFrom(dhakaDay(new Date(Date.now() - 6 * 86400000).toISOString())); setTo(dhakaDay(new Date().toISOString())); }}>Last 7 days</Button><p className="muted text-xs">Dhaka time · up to 93 days</p></div>
    {invalid && <p className="notice notice-warning mb-5" role="alert">Choose an ordered date range of at most 93 days.</p>}
    <div className="admin-metrics">{[
      ["Solar delivered", `${total.solar.toFixed(2)} kWh`], ["Charging demand", `${total.energy.toFixed(2)} kWh`], ["Energy delivered", `${total.energy.toFixed(2)} kWh`],
      ["Non-solar energy", `${total.grid.toFixed(2)} kWh`], ["Prototype grid export", `${(total.exported * 1000).toFixed(3)} Wh`], ["Net receipts", money(total.revenue)],
      ["Sessions", total.count], ["Avg. duration", `${(total.count ? total.duration / total.count : 0).toFixed(1)} min`], ["Renewable mix", `${(total.energy ? total.solar / total.energy * 100 : 0).toFixed(0)}%`], ["CO₂ avoided", `${(total.solar * .4).toFixed(2)} kg`],
    ].map(([l, v]) => <div className="panel" key={l}><p className="text-xs muted">{l}</p><strong className="text-2xl block mt-3">{v}</strong></div>)}</div>
    <div className="dashboard-grid mt-6"><section className="panel"><h2 className="panel-title mb-5">Solar & energy delivered</h2><Chart data={points} label="EV-equivalent energy in kWh" series={[{ key: "solar", name: "Solar", color: "#00af5a" }, { key: "demand", name: "Delivered", color: "#65716b" }]} /></section><section className="panel"><h2 className="panel-title mb-5">Simulated revenue</h2><Chart data={points} label="Net receipts in taka" series={[{ key: "revenue", name: "Net receipts", color: "#197a4a" }]} /></section><section className="panel"><h2 className="panel-title mb-5">Grid contribution & export</h2><Chart data={points} label="Non-solar EV-equivalent kWh and retained prototype export kWh" series={[{ key: "grid", name: "Non-solar", color: "#b58229" }, { key: "exported", name: "Prototype export", color: "#00af5a" }]} /></section><section className="panel"><h2 className="panel-title mb-5">Session count & duration</h2><Chart data={points} label="Session count and average simulated minutes" series={[{ key: "sessions", name: "Sessions", color: "#197a4a" }, { key: "duration", name: "Avg. minutes", color: "#65716b" }]} /></section></div>
    <p className="notice my-6">Prototype generation: {network.solarWh.toFixed(3)} Wh · Grid backup: {network.gridWh.toFixed(3)} Wh · Export: {network.exportWh.toFixed(3)} Wh, cumulative since this demo began. These measured-scale counters are separate from EV-equivalent energy. The live export timeline retains the last 240 ticks.</p>
    <DataGrid name="daily analytics" rows={points.map(p => ({ ...p, id: p.date }))} columns={[{ label: "Date", value: p => p.date }, { label: "Solar kWh", value: p => p.solar.toFixed(3) }, { label: "Delivered kWh", value: p => p.demand.toFixed(3) }, { label: "Revenue", value: p => money(p.revenue) }, { label: "Sessions", value: p => p.sessions }]} />
  </>;
}

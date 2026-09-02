"use client";
import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { useCreditData } from "@/store/credit-store";
import { creditService } from "@/lib/credit/services";
import { credits } from "@/lib/credit/money";
import { bayState, walletView } from "@/lib/credit/selectors";
import { isDemo } from "@/lib/config";
import { useClock } from "@/hooks/use-clock";
import { telemetryLabel } from "@/lib/energy/adapter";
import { DataGrid, ConfirmAction } from "@/components/admin/shared";
import { Input } from "@/components/ui/input";
import { Heading, Source, Action, timestamp } from "./ui";

export function AdminDevices({ initialId = "" }: { initialId?: string }) {
  const data = useCreditData(); const now = useClock();
  const [deviceInput, setSelected] = useState(initialId);
  const selected = deviceInput || data.devices[0]?.id || "";
  const [bayId, setBayId] = useState(""); const [ownerInput, setOwnerId] = useState("");
  const ownerId = ownerInput || data.users.find(u => u.role === "owner")?.id || "";
  const [vehicleId, setVehicleId] = useState(""); const [battery, setBattery] = useState("84"); const [solar, setSolar] = useState("23");
  const device = data.devices.find(d => d.id === selected);
  const bays = data.bays.filter(b => b.deviceId === selected); const bay = bays.find(b => b.id === bayId) ?? bays[0];
  const vehicles = data.vehicles.filter(v => v.ownerId === ownerId);
  const session = data.sessions.find(s => s.bayId === bay?.id && s.state !== "completed");
  const command = data.commands.find(c => c.deviceId === selected);
  const t = data.energy.find(e => e.stationId === device?.stationId)?.current;
  const stale = !device?.online || now - Date.parse(device.lastSeen) > data.policy.communicationTimeoutMs;
  return <>
    <Heading title="Connected. Under control." description="One Station Controller coordinates each station’s solar array, storage, grid connection and charging bays." />
    <DataGrid name="controllers" rows={data.devices} columns={[
      { label: "Controller ID", value: d => d.id },
      { label: "Station", value: d => data.stations.find(s => s.id === d.stationId)?.name ?? d.stationId },
      { label: "Status", value: d => !d.online ? "Offline" : now - Date.parse(d.lastSeen) > data.policy.communicationTimeoutMs ? "Stale" : "Online" },
      { label: "Last telemetry received", value: d => timestamp(d.lastSeen) },
      { label: "Bays", value: d => data.bays.filter(b => b.deviceId === d.id).length },
    ]} onInspect={d => { setSelected(d.id); setBayId(""); setBattery(String(d.stationBattery)); setSolar(String(d.solarW / 1000)); }} />
    {device && bay && <div className="credit-split credit-page-section">
      <section className="panel credit-form">
        <div className="panel-top"><h2 className="text-2xl">{device.id}</h2>{t && <Source>{telemetryLabel(t, now, data.policy.communicationTimeoutMs)}</Source>}</div>
        <div className="data-row"><span>Controller status</span><strong>{stale ? device.online ? "Stale" : "Offline" : "Online"}</strong></div>
        <div className="data-row"><span>Last telemetry received</span><span>{timestamp(device.lastSeen)}</span></div>
        <Link className="action action-outline" href={`/admin/stations/${device.stationId}`}>Open station energy monitoring</Link>
        <label>Controlled bay<select aria-label="Controller bay" value={bay.id} onChange={e => setBayId(e.target.value)}>{bays.map(b => <option value={b.id} key={b.id}>Bay {b.number} · {bayState(data, b)}</option>)}</select></label>
        <div className="data-row"><span>Charging state</span><strong>{stale ? "Unknown" : session?.state ?? "Idle"}</strong></div>
        <div className="data-row"><span>Plug</span><strong>{bay.plugged ? "Detected" : "Not detected"}</strong></div>
        <div className="notice" role="status"><strong>Command {command?.status ?? "idle"}</strong><p>{command?.message.replaceAll("ESP32", "Station Controller") ?? "Send a command to view its acknowledgement."}</p><small className="break-all">{command?.id}</small></div>
        <label>Owner<select value={ownerId} onChange={e => { setOwnerId(e.target.value); setVehicleId(""); }}>{data.users.filter(u => u.role === "owner").map(u => <option value={u.id} key={u.id}>{u.name} · {credits(walletView(data, u.id).availableMinor)}</option>)}</select></label>
        <label>Owner vehicle<select value={vehicleId || vehicles[0]?.id || ""} onChange={e => setVehicleId(e.target.value)}>{vehicles.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</select></label>
        <div className="credit-actions">
          <ConfirmAction label="Start Charging" title="Start this owner's charging session?" description="Credit, plug, connector and safety checks apply. Charging begins after station confirmation." disabled={Boolean(session)} action={() => creditService.charging.start({ stationId: device.stationId, bayId: bay.id, vehicleId: vehicleId || vehicles[0]?.id || "", ownerId, requestId: crypto.randomUUID() })} />
          <ConfirmAction label="Stop Charging" title="Stop this charging session?" description="The completed session retains its admin stop reason and receipt." disabled={!session || command?.status === "pending"} action={() => creditService.charging.stop(session!.id)} />
          <ConfirmAction label="Test controller" title="Test Station Controller?" description="Stop all bay sessions first. This connection check does not start charging." action={() => creditService.devices.command(device.id, "TEST")} />
          <ConfirmAction label="Restart controller" title="Restart Station Controller?" description="All charging on this controller must be stopped before restart." action={() => creditService.devices.command(device.id, "RESTART")} />
        </div>
      </section>
      <div>{isDemo && <section className="panel credit-form">
        <Source>Digital Twin · simulation controls</Source><h2 className="panel-title">Controlled station inputs</h2>
        <div className="credit-actions">
          <ConfirmAction label={bay.plugged ? "Disconnect plug" : "Connect plug"} title="Change simulated plug connection?" description="Disconnecting an active plug immediately settles and stops its session." action={() => creditService.bays.plug(bay.id, !bay.plugged)} />
          <ConfirmAction label={device.online ? "Simulate offline" : "Reconnect controller"} title="Change controller communication?" description="Communication loss safely ends charging sessions." danger={device.online} action={() => creditService.devices.configure(device.id, { online: !device.online })} />
          <Action run={() => creditService.devices.fault(bay.id)}>Inject station fault</Action>
          <Action disabled={!session} run={() => creditService.devices.full(session!.id)}>Simulate full battery</Action>
        </div>
        <label>Next command outcome<select value={device.outcome} onChange={e => { void creditService.devices.configure(device.id, { outcome: e.target.value as typeof device.outcome }).catch(e => toast.error(e.message)); }}><option value="success">Acknowledge successfully</option><option value="failure">Fail acknowledgement</option><option value="timeout">Time out acknowledgement</option></select></label>
        <label>Station battery (%)<Input value={battery} type="number" min="0" max="100" onChange={e => setBattery(e.target.value)} /></label>
        <label>Solar power (kW)<Input value={solar} type="number" min="0" max="1000" step="0.1" onChange={e => setSolar(e.target.value)} /></label>
        <Action run={() => creditService.devices.configure(device.id, { stationBattery: Number(battery), solarW: Number(solar) * 1000 })}>Apply energy inputs</Action>
        <Action run={() => creditService.devices.configure(device.id, { gridBackup: !device.gridBackup })}>{device.gridBackup ? "Disconnect grid" : "Connect grid"}</Action>
        <Action run={() => creditService.devices.configure(device.id, { gridExport: !device.gridExport })}>{device.gridExport ? "Disable export" : "Enable export"}</Action>
        <p className="text-xs muted">Dispatch is automatic: solar, then available storage, then grid. These inputs are simulated and never control physical equipment.</p>
      </section>}
      <section className="panel mt-5"><h2 className="panel-title">Connected charging bays</h2><p className="text-xs muted mt-4">{data.stations.find(s => s.id === device.stationId)?.name} · Controller {device.id}</p>{bays.map(b => <div className="data-row" key={b.id}><span>Bay {b.number} · {b.connector}</span><span>{bayState(data, b)}</span></div>)}</section></div>
    </div>}
  </>;
}

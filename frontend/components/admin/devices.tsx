"use client";
import { useState } from "react";
import Link from "next/link";
import { Cpu, Radio, BatteryMedium, PlugZap } from "lucide-react";
import { toast } from "sonner";
import { useDemoStore } from "@/store/demo-store";
import { platform } from "@/lib/platform";
import { allBookings, allSessions } from "@/lib/platform/selectors";
import { isDemo } from "@/lib/config";
import { useClock } from "@/hooks/use-clock";
import { dateTime } from "@/lib/services/booking-rules";
import { AdminHeading, ConfirmAction, DataGrid, Status } from "./shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CommandStatusPanel } from "@/components/charging/command-status";
import type { Device } from "@/types";

export function AdminDevices({ initialId = "ST001" }: { initialId?: string }) {
  const network = useDemoStore(s => s.network); const [selected, setSelected] = useState(initialId); const [filter, setFilter] = useState("all");
  return <>
    <AdminHeading title="Connected. Accounted for." description="Device health, prototype telemetry and acknowledged commands. The browser never talks directly to an ESP32." />
    <div className="admin-metrics mb-6">{[
      { label: "Connected devices", value: `${network.devices.filter(d => d.online).length}/${network.devices.length}`, icon: Radio },
      { label: "Chargers ON", value: network.devices.filter(d => d.mosfetOn).length, icon: PlugZap },
      { label: "Sensor faults", value: network.devices.filter(d => d.sensorFault).length, icon: Cpu },
      { label: "Low battery", value: network.devices.filter(d => d.stationBattery < 15).length, icon: BatteryMedium },
    ].map(m => <div className="panel" key={m.label}><div className="flex justify-between muted text-xs">{m.label}<m.icon size={17} /></div><strong className="block text-3xl mt-4">{m.value}</strong></div>)}</div>
    <div className="admin-device-layout"><div><DataGrid name="devices" rows={network.devices.filter(d => filter === "all" || (filter === "online" ? d.online : !d.online))} columns={[
      { label: "Device", value: d => d.id }, { label: "Bay", value: d => d.bayId },
      { label: "Connection", value: d => d.online ? "Online" : "Offline", render: d => <Status good={d.online} danger={!d.online}>{d.online ? "Online" : "Offline"}</Status> },
    ]} filters={<select aria-label="Device status" value={filter} onChange={e => setFilter(e.target.value)}><option value="all">All devices</option><option value="online">Online</option><option value="offline">Offline</option></select>} onInspect={d => setSelected(d.id)} /></div><DeviceInspector key={selected} id={selected} /></div>
  </>;
}

function DeviceInspector({ id }: { id: string }) {
  const network = useDemoStore(s => s.network); const owners = useDemoStore(s => s.owners); const now = useClock();
  const [bookingId, setBookingId] = useState(""); const [override, setOverride] = useState(false);
  const device = network.devices.find(d => d.id === id);
  const [battery, setBattery] = useState(device?.stationBattery ?? 80); const [solar, setSolar] = useState(device?.solarPower ?? 1.8);
  if (!device) return <section className="panel empty-state"><h2>Select a device.</h2><p>Use Inspect to open its controls.</p></section>;
  const station = network.stations.find(s => s.id === device.stationId);
  const bookings = allBookings({ network, owners }).filter(b => b.stationId === device.stationId && b.bayId === device.bayId && ["upcoming", "charging"].includes(b.status));
  const session = allSessions({ network, owners }).find(s => s.deviceId === id && s.status !== "completed");
  const t = device.telemetry; const stale = !device.online || !t || now - Date.parse(t.timestamp) > 30000;
  const pending = network.commands.some(c => c.deviceId === id && c.status === "pending");
  async function configure(patch: Parameters<typeof platform.devices.configure>[1]) {
    try { await platform.devices.configure(id, patch); toast.success("Demo device state updated."); }
    catch (e) { toast.error((e as Error).message); }
  }
  async function start() {
    const booking = bookingId || bookings[0]?.id;
    if (!booking) throw new Error("Create a paid owner booking for this bay first. A time override cannot bypass payment or safety checks.");
    const s = session ?? await platform.charging.enter(booking);
    await platform.devices.command(id, "START", s.id, override);
  }
  const reading = (value: number | null | undefined, unit: string) => stale || value == null ? "Unavailable" : `${value.toFixed(2)} ${unit}`;
  return <section className="panel device-inspector">
    <div className="panel-top"><div><p className="eyebrow !mb-2">ESP32 DEVICE</p><h2 className="text-2xl">{id}</h2></div><Status good={device.online}>{device.online ? "Online" : "Offline"}</Status></div>
    <p className="text-xs muted mb-4">{station?.name} · {device.bayId}</p>
    <div className="data-row"><span>Firmware</span><code>{device.firmware}</code></div><div className="data-row"><span>Last seen</span><span>{dateTime(device.lastSeen)}</span></div><div className="data-row"><span>MQTT transport</span><span>{isDemo ? "Simulated backend → ESP32" : "Backend managed"}</span></div><div className="data-row"><span>MOSFET / charger</span><Status good={!stale && device.mosfetOn}>{stale ? "Unknown / stale" : device.mosfetOn ? "ON" : "OFF"}</Status></div><div className="data-row"><span>Vehicle detected</span><span>{device.vehicleDetected ? "Yes" : "No"}</span></div>
    <div className="telemetry-grid mt-5">{[
      ["Solar voltage", reading(t?.solarVoltage, "V")], ["Solar current", reading(t?.solarCurrent, "A")], ["Solar power", reading(t?.solarPower, "W")],
      ["Battery sense", reading(t?.carBatteryVoltage, "V")], ["Charging current", reading(t?.chargingCurrent, "A")], ["Charging power", reading(t?.chargingPower, "W")],
      ["Metered energy", reading(t?.energyWh, "Wh")], ["Station battery", stale ? "Unavailable" : `${device.stationBattery.toFixed(0)}%`],
    ].map(([l, v]) => <div key={l}><span>{l}</span><strong>{v}</strong></div>)}</div>
    <p className="text-[11px] muted mt-3">{isDemo ? "Simulated INA3221 readings. " : "Backend telemetry. "}{stale ? "Telemetry is missing or stale." : "Battery-sense percentage is estimated, not certified BMS data."}</p>
    <CommandStatusPanel deviceId={id} />
    <label className="block text-xs mt-5">Paid booking<select className="w-full mt-2" value={bookingId || bookings[0]?.id || ""} onChange={e => setBookingId(e.target.value)}>{!bookings.length && <option value="">No eligible booking</option>}{bookings.map(b => <option key={b.id} value={b.id}>{b.id} · {owners[b.ownerId]?.profile.name}</option>)}</select></label>
    <label className="flex items-start gap-2 text-xs my-4"><input type="checkbox" checked={override} onChange={e => setOverride(e.target.checked)} />Confirm admin time override. Safety and payment checks still apply.</label>
    <div className="flex flex-wrap gap-2"><ConfirmAction label="Start Charging" title="Send START command?" description="The charger stays OFF until ESP32 acknowledgement. Vehicle, booking, payment and bay checks must pass." disabled={pending || session?.status === "charging"} action={start} /><ConfirmAction label="Stop Charging" title="Stop this session?" description="A successful acknowledgement completes the session and settles the simulated bill." disabled={!session || pending} action={() => platform.devices.command(id, "STOP", session?.id)} /><ConfirmAction label="Restart Device" title="Restart this device?" description="The active session must be stopped first. Wait for acknowledgement before issuing another command." disabled={pending} action={() => platform.devices.command(id, "RESTART")} /><ConfirmAction label={device.testMode ? "Exit Test Mode" : "Test Mode"} title="Send TEST command?" description="Test mode records a non-energizing device check and its acknowledgement." disabled={pending} action={() => platform.devices.command(id, "TEST")} /></div>
    {isDemo && <div className="demo-test-panel"><h3 className="text-base">Demo test panel</h3><p className="text-xs muted mt-2 mb-4">Admin-only inputs. Changes are shared with owner tabs.</p>
      <div className="flex flex-wrap gap-2"><ConfirmAction label={device.vehicleDetected ? "Remove vehicle" : "Detect vehicle"} title="Change vehicle presence?" description="Removing a vehicle automatically ends its active session in the simulator." danger={device.vehicleDetected} action={() => platform.devices.configure(id, { vehicleDetected: !device.vehicleDetected })} /><ConfirmAction label={device.online ? "Simulate offline" : "Reconnect device"} title="Change device connection?" description="Offline devices interrupt charging and cannot acknowledge commands." danger={device.online} action={() => platform.devices.configure(id, { online: !device.online })} /><Button variant="outline" onClick={() => configure({ sensorFault: true })} disabled={device.sensorFault}>Inject sensor fault</Button><Button variant="outline" onClick={() => configure({ stationBattery: 8 })}>Low station battery</Button></div>
      <div className="admin-form-grid mt-4"><label>Station battery (%)<Input type="number" min="0" max="100" value={battery} onChange={e => setBattery(Number(e.target.value))} /></label><label>Solar power (W)<Input type="number" min="0" max="10" step=".1" value={solar} onChange={e => setSolar(Number(e.target.value))} /></label></div><Button className="mt-3" variant="outline" onClick={() => configure({ stationBattery: battery, solarPower: solar })}>Apply energy inputs</Button>
      <div className="flex flex-col gap-3 mt-4"><label className="flex gap-2 text-xs"><input type="checkbox" checked={device.gridBackup} onChange={e => configure({ gridBackup: e.target.checked })} />Simulated grid backup</label><label className="flex gap-2 text-xs"><input type="checkbox" checked={device.gridExport} onChange={e => configure({ gridExport: e.target.checked })} />Simulated grid export when idle</label><label className="text-xs">Next command outcome<select className="w-full mt-2" value={device.commandOutcome} onChange={e => configure({ commandOutcome: e.target.value as Device["commandOutcome"] })}><option value="success">Acknowledge successfully</option><option value="failure">Fail acknowledgement</option><option value="timeout">Time out (6 seconds)</option></select></label></div>
    </div>}
    <Link className="action action-outline mt-5 w-full" href="/admin/maintenance">Inspect faults & maintenance</Link>
  </section>;
}

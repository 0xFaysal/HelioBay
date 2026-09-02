import type { Account, CommandName, Device, DeviceCommand, Fault, PlatformSnapshot, Session, Telemetry } from "../../types/index.ts";

const active = (s: Session) => s.status !== "completed";
export function locateSession(data: PlatformSnapshot, id: string) {
  for (const [ownerId, owner] of Object.entries(data.owners)) {
    const session = owner.sessions.find(s => s.id === id);
    if (session) return { ownerId, owner, session, booking: owner.bookings.find(b => b.id === session.bookingId) };
  }
  return undefined;
}
export function audit(data: PlatformSnapshot, actorId: string, action: string, targetId: string, detail: string, now: number) {
  data.network.audit.unshift({ id: `LOG-${now}-${data.network.audit.length}`, actorId, action, targetId, detail, createdAt: new Date(now).toISOString() });
  data.network.audit = data.network.audit.slice(0, 500);
}
export function addFault(data: PlatformSnapshot, device: Device, code: Fault["code"], message: string, now: number, severity: Fault["severity"] = "critical") {
  if (data.network.faults.some(f => f.deviceId === device.id && f.code === code && f.status !== "resolved")) return;
  const iso = new Date(now).toISOString();
  data.network.faults.unshift({ id: `F-${device.id}-${now}-${code}`, stationId: device.stationId, deviceId: device.id, severity, code, message, status: "open", createdAt: iso, updatedAt: iso });
  audit(data, "simulator", "Fault detected", device.id, message, now);
}
export function assertStart(data: PlatformSnapshot, actor: Account | null, deviceId: string, sessionId: string | undefined, override = false) {
  if (!actor) throw new Error("Sign in before starting charging.");
  const device = data.network.devices.find(d => d.id === deviceId);
  const station = data.network.stations.find(s => s.id === device?.stationId);
  const bay = data.network.bays.find(b => b.stationId === device?.stationId && b.id === device?.bayId);
  const found = sessionId ? locateSession(data, sessionId) : undefined;
  if (!device || !station || !bay || !found) throw new Error("Select a valid booking and session for this device.");
  if (actor.role !== "admin" && actor.id !== found.ownerId) throw new Error("This charging session belongs to another owner.");
  if (override && actor.role !== "admin") throw new Error("Only an administrator can override a booking time.");
  if (found.session.deviceId !== deviceId || found.booking?.stationId !== station.id || found.booking.bayId !== bay.id) throw new Error("Session, bay and device assignment do not match.");
  if (!found.booking || !["upcoming", "charging"].includes(found.booking.status) || found.session.status === "completed") throw new Error("The booking is no longer valid.");
  if (!override && new Date(found.booking.start).getTime() + found.booking.duration * 60000 < Date.parse(data.network.lastTick)) throw new Error("The reservation has expired. An administrator must confirm a time override.");
  if (!station.online || !device.online) throw new Error("Station and ESP32 must be online.");
  if (!bay.enabled || bay.blocked || bay.maintenance || station.maintenance) throw new Error("This bay is disabled, blocked or under maintenance.");
  if (!device.vehicleDetected) throw new Error("A vehicle must be detected before charging can start.");
  if (!found.owner.payments.some(p => p.id === found.booking!.paymentId && p.kind === "payment" && p.status === "succeeded" && p.amount >= found.booking!.advance)) throw new Error("A successful payment authorization is required.");
  if (data.network.faults.some(f => f.deviceId === deviceId && f.severity === "critical" && f.status !== "resolved") || device.sensorFault) throw new Error("Resolve the blocking device fault first.");
  if (device.stationBattery < 10 && !device.gridBackup && device.solarPower < 1) throw new Error("Insufficient station energy. Enable grid backup or restore solar power.");
  const vehicle = found.owner.vehicles.find(v => v.id === found.session.vehicleId);
  if (!vehicle || vehicle.battery >= (found.session.targetBattery ?? 100)) throw new Error("The vehicle is missing or already at its charge limit.");
  for (const owner of Object.values(data.owners)) {
    if (owner.sessions.some(s => s.id !== sessionId && active(s) && s.stationId === station.id && (s.bayId ?? owner.bookings.find(b => b.id === s.bookingId)?.bayId) === bay.id)) throw new Error("Another active session already owns this bay.");
    if (owner.sessions.some(s => s.id !== sessionId && active(s) && s.vehicleId === found.session.vehicleId)) throw new Error("This vehicle has another active session.");
  }
  return { device, station, bay, ...found };
}

export function finishSession(data: PlatformSnapshot, sessionId: string, reason: string, now: number) {
  const found = locateSession(data, sessionId);
  if (!found || found.session.status === "completed") return;
  const { session: s, booking: b, owner, ownerId } = found;
  if (!b) return;
  const station = data.network.stations.find(x => x.id === s.stationId);
  const rate = b.unitPrice ?? station?.price ?? 18;
  const discount = b.discountRate ?? (b.discount > 0 ? 10 : 0);
  s.status = "completed";
  s.power = 0;
  s.updatedAt = s.completedAt = new Date(now).toISOString();
  s.stopReason = reason;
  s.finalCost = Math.round(s.energy * rate * (1 - discount / 100)) + b.fee;
  b.status = "completed";
  const device = data.network.devices.find(d => d.id === s.deviceId);
  if (device) device.mosfetOn = false;
  const balance = s.finalCost - b.advance;
  const settlementId = `SETTLE-${s.id}`;
  if (!owner.payments.some(p => p.id === settlementId)) {
    owner.payments.unshift({ id: settlementId, bookingId: b.id, amount: Math.abs(balance), method: "Demo settlement", kind: balance < 0 ? "refund" : "payment", status: "succeeded", createdAt: s.completedAt, description: balance < 0 ? "Unused advance returned · simulated" : "Session balance · simulated" });
    if (balance < 0) data.network.refunds.unshift({ id: `RF-${s.id}`, paymentId: settlementId, bookingId: b.id, ownerId, amount: -balance, status: "succeeded", reason: "Unused charging advance (automatic)", createdAt: s.completedAt });
  }
  audit(data, "simulator", "Session completed", s.id, reason, now);
}

export function issueCommand(data: PlatformSnapshot, actor: Account | null, deviceId: string, command: CommandName, sessionId: string | undefined, override: boolean, now: number, commandId: string) {
  if (!actor) throw new Error("Sign in to send a device command.");
  const device = data.network.devices.find(d => d.id === deviceId);
  if (!device) throw new Error("Device not found.");
  const found = sessionId ? locateSession(data, sessionId) : undefined;
  if (actor.role !== "admin" && (!found || found.ownerId !== actor.id || found.session.deviceId !== deviceId || ["RESTART", "TEST"].includes(command))) throw new Error("Administrator access is required for this command.");
  if (command === "START") assertStart(data, actor, deviceId, sessionId, override);
  if (["STOP", "PAUSE", "EMERGENCY_STOP"].includes(command) && (!found || found.session.status === "completed")) throw new Error("No active session is selected.");
  if (command !== "EMERGENCY_STOP" && data.network.commands.some(c => c.deviceId === deviceId && c.status === "pending")) throw new Error("Wait for the current command acknowledgement or timeout.");
  if (command === "RESTART" && Object.values(data.owners).some(o => o.sessions.some(s => s.deviceId === deviceId && ["starting", "charging", "paused"].includes(s.status)))) throw new Error("Stop the active session before restarting this device.");
  if (command === "EMERGENCY_STOP") {
    for (const c of data.network.commands) if (c.deviceId === deviceId && c.status === "pending") c.status = "failed";
    finishSession(data, sessionId!, "Emergency stop", now);
    addFault(data, device, "EMERGENCY", "Emergency stop latched. Inspect and resolve before restarting.", now);
  }
  const cmd: DeviceCommand = {
    commandId, command, sessionId, stationId: device.stationId, bayId: device.bayId, deviceId,
    maximumMinutes: found?.booking?.duration ?? 30, issuedAt: new Date(now).toISOString(), expiresAt: new Date(now + 6000).toISOString(),
    status: "pending", actorId: actor.id, override, outcome: device.commandOutcome,
  };
  data.network.commands.unshift(cmd);
  data.network.commands = data.network.commands.slice(0, 200);
  if (found) {
    found.session.commandId = commandId;
    if (command === "START") found.session.status = "starting";
  }
  audit(data, actor.id, `${command} requested`, deviceId, `${commandId}${override ? " · confirmed admin time override" : ""}`, now);
  return cmd;
}

export function estimateRemainingMinutes(capacityWh: number, battery: number | null, voltage: number | null, current: number | null, taper: number, target = 100) {
  if (battery === null || !voltage || !current || current <= 0 || taper <= 0) return null;
  return Math.max(0, capacityWh * (target - battery) / 100 / (voltage * current * taper) * 60);
}

// Pure deterministic step: input is cloned, all clocks are supplied by the caller.
export function advanceEngine(input: PlatformSnapshot, now: number): PlatformSnapshot {
  const data = structuredClone(input);
  const n = data.network;
  const wallSeconds = Math.max(0, Math.min(5, (now - Date.parse(n.lastTick)) / 1000));
  const seconds = wallSeconds * n.demoSpeed;
  const iso = new Date(now).toISOString();
  for (const c of n.commands.filter(c => c.status === "pending")) {
    const d = n.devices.find(d => d.id === c.deviceId);
    const found = c.sessionId ? locateSession(data, c.sessionId) : undefined;
    if (now < Date.parse(c.issuedAt) + 1200) continue;
    if (c.outcome === "timeout" || !d?.online) {
      if (now < Date.parse(c.expiresAt)) continue;
      c.status = "timed-out";
      if (found?.session.status === "starting") found.session.status = "car-detected";
      audit(data, "simulator", "Command timed out", c.deviceId, c.commandId, now);
      continue;
    }
    let failure = c.outcome === "failure" ? "ESP32 rejected the command (injected test failure)." : "";
    if (c.command === "START" && !failure) {
      try { assertStart(data, { id: c.actorId, role: c.override || c.actorId === "demo-admin" ? "admin" : "owner", demo: true, name: "", email: "" }, c.deviceId, c.sessionId, c.override); }
      catch (e) { failure = (e as Error).message; }
    }
    c.status = failure ? "failed" : "acknowledged";
    if (failure && found?.session.status === "starting") found.session.status = "car-detected";
    if (!failure && d) {
      if (c.command === "START" && found) { found.session.status = "charging"; found.session.updatedAt = iso; found.booking!.status = "charging"; d.mosfetOn = true; }
      if (c.command === "PAUSE" && found) { found.session.status = "paused"; found.session.power = 0; d.mosfetOn = false; }
      if (c.command === "STOP") finishSession(data, c.sessionId!, "Stopped by user", now);
      if (c.command === "TEST") d.testMode = !d.testMode;
      if (c.command === "RESTART") { d.mosfetOn = false; d.lastSeen = iso; }
    }
    n.acknowledgements.unshift({ commandId: c.commandId, deviceId: c.deviceId, success: !failure, state: d?.mosfetOn ? "CHARGING" : "IDLE", message: failure || `${c.command} acknowledged by simulated ESP32`, receivedAt: iso });
    n.acknowledgements = n.acknowledgements.slice(0, 200);
    audit(data, "simulator", failure ? "Command failed" : "Command acknowledged", c.deviceId, failure || c.commandId, now);
  }
  for (const d of n.devices) {
    const pair = Object.entries(data.owners).flatMap(([ownerId, o]) => o.sessions.map(s => ({ ownerId, o, s }))).find(x => x.s.deviceId === d.id && active(x.s));
    const station = n.stations.find(s => s.id === d.stationId)!;
    const bay = n.bays.find(b => b.stationId === d.stationId && b.id === d.bayId);
    const s = pair?.s;
    if (s && ["charging", "starting", "paused", "offline", "fault"].includes(s.status)) {
      if (!d.vehicleDetected) finishSession(data, s.id, "Vehicle removed — automatic safety stop", now);
      else if (!d.online || !station.online) { s.status = "offline"; s.power = 0; d.mosfetOn = false; addFault(data, d, "OFFLINE", "Device offline. Output interrupted in simulator; real hardware needs an independent watchdog.", now, "warning"); }
      else if (!bay?.enabled || bay.blocked || bay.maintenance || station.maintenance) finishSession(data, s.id, "Bay taken out of service", now);
      else if (d.sensorFault || n.faults.some(f => f.deviceId === d.id && f.severity === "critical" && f.status !== "resolved")) { s.status = "fault"; s.power = 0; d.mosfetOn = false; }
    }
    if (d.stationBattery < 15) addFault(data, d, "LOW_BATTERY", d.gridBackup ? "Low station battery — simulated grid backup available." : "Low station battery — restore energy before charging.", now, "warning");
    const charging = s?.status === "charging" && d.mosfetOn && d.online;
    const battery = s?.battery ?? 64;
    const voltage = 3.0 + battery * .012;
    const taper = battery > 80 ? n.pricing.taperFactor : 1;
    const current = charging ? .48 * taper : 0;
    const watts = voltage * current;
    const useGrid = charging && d.stationBattery < 15 && d.gridBackup;
    const source: Telemetry["source"] = useGrid ? "GRID" : charging ? d.solarPower >= watts ? "SOLAR" : "STORAGE" : d.gridExport ? "EXPORT" : "SOLAR";
    if (charging && s && pair) {
      const vehicle = pair.o.vehicles.find(v => v.id === s.vehicleId);
      const booking = pair.o.bookings.find(b => b.id === s.bookingId);
      if (vehicle && booking) {
        if (d.stationBattery < 10 && !d.gridBackup && d.solarPower < watts) { s.status = "paused"; d.mosfetOn = false; s.power = 0; }
        else {
          // kWh here is an explicitly scaled EV-equivalent, not measured prototype Wh.
          const power = watts * n.pricing.demoScalingFactor / 1000;
          const remainingSeconds = Math.max(0, booking.duration * 60 - s.elapsed);
          const capacityLeft = Math.max(0, vehicle.capacity * ((s.targetBattery ?? 100) - s.battery) / 100);
          const dt = Math.min(seconds, remainingSeconds, power ? capacityLeft / power * 3600 : seconds);
          const wh = watts * dt / 3600;
          const delta = wh * n.pricing.demoScalingFactor / 1000;
          s.energy += delta; s.energyWh = (s.energyWh ?? 0) + wh; s.elapsed += dt; s.power = power;
          s.battery = Math.min(s.targetBattery ?? 100, s.initialBattery + s.energy / vehicle.capacity * 100);
          vehicle.battery = s.battery; s.updatedAt = iso;
          s.solar = useGrid ? 0 : Math.min(100, watts ? d.solarPower / watts * 100 : 100);
          s.points = [...s.points, { minute: s.elapsed / 60, power }].slice(-60);
          d.stationBattery = Math.max(0, Math.min(100, d.stationBattery + (d.solarPower - watts) * dt / 3600 * 2));
          if (useGrid) n.gridWh += wh;
          if (s.battery >= (s.targetBattery ?? 100) - .000001 || s.elapsed >= booking.duration * 60 - .000001) finishSession(data, s.id, s.battery >= (s.targetBattery ?? 100) - .000001 ? "Charge limit reached" : "Reserved duration reached", now);
        }
      }
    }
    if (d.online) {
      n.solarWh += d.solarPower * seconds / 3600;
      if (d.gridExport && !d.mosfetOn) n.exportWh += d.solarPower * seconds / 3600;
      d.lastSeen = iso;
      const flow = d.mosfetOn && s?.status === "charging";
      const t: Telemetry = {
        deviceId: d.id, bayId: d.bayId, online: true, occupied: d.vehicleDetected, charging: flow,
        solarVoltage: d.sensorFault ? null : 5.8, solarCurrent: d.sensorFault ? null : d.solarPower / 5.8, solarPower: d.sensorFault ? null : d.solarPower,
        carBatteryVoltage: d.sensorFault ? null : 3 + (s?.battery ?? battery) * .012, carBatteryPercent: d.sensorFault ? null : s?.battery ?? battery,
        chargingCurrent: d.sensorFault ? null : flow ? current : 0, chargingPower: d.sensorFault ? null : flow ? watts : 0,
        energyWh: s?.energyWh ?? d.telemetry?.energyWh ?? 0, stationBatteryPercent: d.stationBattery, source, timestamp: iso, simulated: true,
      };
      d.telemetry = t; d.timeline = [...d.timeline, t].slice(-60);
    }
  }
  n.lastTick = iso;
  if (seconds > 0) n.energyHistory = [...n.energyHistory, { timestamp: iso, solarWh: n.solarWh, gridWh: n.gridWh, exportWh: n.exportWh }].slice(-240);
  return data;
}

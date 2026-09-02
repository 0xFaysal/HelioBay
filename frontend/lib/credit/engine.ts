import type { Actor, Command, Payment, Snapshot, StartInput, StopReason } from "./model.ts";
import { affordableEnergy, energyCost, validateTopup } from "./money.ts";
import { bayState, walletView } from "./selectors.ts";

export function audit(data: Snapshot, actorId: string, action: string, reference: string, reason: string, now: number) {
  let n = data.revision++;
  while (data.audit.some(a => a.id === `AUD-${now}-${n}`)) n++;
  data.audit.unshift({ id: `AUD-${now}-${n}`, actorId, action, reference, reason, at: new Date(now).toISOString() });
  data.audit = data.audit.slice(0, 500);
}
export function actor(data: Snapshot, who: Actor | null, admin = false) {
  const user = data.users.find(u => u.id === who?.id);
  if (!who || !user) throw new Error("Sign in to continue.");
  if (user.status !== "active") throw new Error("This account is blocked. Contact the station operator.");
  if (admin && user.role !== "admin") throw new Error("Administrator access required.");
  return user;
}
export function validateStart(data: Snapshot, who: Actor | null, input: StartInput, existingId?: string, now = Date.parse(data.lastTick)) {
  const user = actor(data, who);
  const ownerId = user.role === "admin" ? input.ownerId ?? user.id : user.id;
  const owner = data.users.find(u => u.id === ownerId);
  if (owner?.status !== "active") throw new Error("The selected owner is blocked or unavailable.");
  const vehicle = data.vehicles.find(v => v.id === input.vehicleId && v.ownerId === ownerId);
  const station = data.stations.find(s => s.id === input.stationId);
  const bay = data.bays.find(b => b.id === input.bayId && b.stationId === input.stationId);
  const device = data.devices.find(d => d.id === station?.deviceId);
  if (!vehicle || !station || !bay || !device) throw new Error("Select a valid vehicle, station and bay.");
  if (!station.online || !device.online || now - Date.parse(device.lastSeen) > data.policy.communicationTimeoutMs) throw new Error("Station device is offline or its communication has timed out.");
  if (!bay.enabled || bay.fault || bay.deviceId !== device.id) throw new Error("This bay is disabled, faulty or incorrectly assigned.");
  if (!bay.plugged) throw new Error("Connect the plug to your car first. Plug detection is required.");
  if (vehicle.connector !== bay.connector) throw new Error("This vehicle uses a different connector.");
  if (vehicle.battery >= data.policy.targetBattery) throw new Error("Vehicle battery is already at the charge limit.");
  if (data.sessions.some(s => s.id !== existingId && s.state !== "completed" && (s.bayId === bay.id || s.ownerId === ownerId || s.vehicleId === vehicle.id))) throw new Error("This bay or owner already has an active charging session.");
  const available = existingId ? data.sessions.find(s => s.id === existingId)?.reservedMinor ?? 0 : walletView(data, ownerId).availableMinor;
  if (available < 1) throw new Error("Insufficient credit. Add Credits before charging.");
  return { user, ownerId, vehicle, station, bay, device, available };
}
export function startSession(data: Snapshot, who: Actor | null, input: StartInput, now: number) {
  const id = `SES-${input.requestId}`;
  const existing = data.sessions.find(s => s.id === id);
  if (existing) { if (existing.ownerId !== who?.id && who?.role !== "admin") throw new Error("Session belongs to another user."); return existing; }
  const { ownerId, vehicle, station, bay, device, available } = validateStart(data, who, input, undefined, now);
  const iso = new Date(now).toISOString(); const commandId = `CMD-${input.requestId}`;
  const session = { id, ownerId, stationId: station.id, bayId: bay.id, deviceId: device.id, vehicleId: vehicle.id, state: "pending" as const, createdAt: iso, updatedAt: iso, initialBattery: vehicle.battery, battery: vehicle.battery, targetBattery: data.policy.targetBattery, energyMWh: 0, elapsedMs: 0, tariffMinor: station.priceMinor, startingBalanceMinor: walletView(data, ownerId).balanceMinor, reservedMinor: available, costMinor: 0, commandId, points: [], events: [{ at: iso, message: "START requested; credits reserved. Waiting for device acknowledgement." }] };
  data.sessions.unshift(session);
  data.commands.unshift({ id: commandId, sessionId: id, deviceId: device.id, bayId: bay.id, command: "START", status: "pending", outcome: device.outcome, issuedAt: iso, expiresAt: new Date(now + 6000).toISOString(), actorId: who!.id, message: "Awaiting Station Controller acknowledgement." });
  audit(data, who!.id, "START requested", id, "Direct bay charging with wallet hold", now);
  return session;
}
export function finish(data: Snapshot, sessionId: string, reason: StopReason, now: number) {
  const s = data.sessions.find(s => s.id === sessionId); if (!s || s.state === "completed") return;
  const wallet = data.wallets.find(w => w.userId === s.ownerId)!;
  s.costMinor = Math.min(s.reservedMinor, energyCost(s.energyMWh, s.tariffMinor));
  if (s.costMinor > wallet.balanceMinor) throw new Error("Wallet invariant violated: reserved credit must cover the charge.");
  wallet.balanceMinor -= s.costMinor;
  s.state = "completed"; s.stopReason = reason; s.completedAt = s.updatedAt = new Date(now).toISOString(); s.endingBalanceMinor = wallet.balanceMinor;
  s.events.push({ at: s.completedAt, message: `Session ended: ${reason}. Unused reserved credits released.` });
  if (!data.ledger.some(l => l.id === `DEBIT-${s.id}`)) data.ledger.unshift({ id: `DEBIT-${s.id}`, userId: s.ownerId, kind: "charging-debit", amountMinor: -s.costMinor, balanceAfterMinor: wallet.balanceMinor, reference: s.id, reason, status: "posted", sandbox: false, at: s.completedAt });
  for (const c of data.commands) if (c.sessionId === s.id && c.status === "pending" && c.command === "START") { c.status = "failed"; c.message = `Stopped before acknowledgement: ${reason}`; }
  audit(data, "engine", "Session settled", s.id, reason, now);
}
export function sendCommand(data: Snapshot, who: Actor | null, deviceId: string, command: Command["command"], sessionId: string | undefined, now: number, id: string) {
  const user = actor(data, who); const device = data.devices.find(d => d.id === deviceId);
  if (!device) throw new Error("Device not found.");
  if (command === "START") throw new Error("Use the direct charging start contract.");
  const s = data.sessions.find(s => s.id === sessionId && s.deviceId === deviceId);
  if (["STOP", "EMERGENCY_STOP"].includes(command) && (!s || s.state === "completed" || user.role !== "admin" && s.ownerId !== user.id)) throw new Error("Select an active session you are authorized to control.");
  if (["TEST", "RESTART"].includes(command)) { actor(data, who, true); if (data.sessions.some(s => s.deviceId === deviceId && s.state !== "completed")) throw new Error("Stop every bay on this device before testing or restarting."); }
  if (command !== "EMERGENCY_STOP" && data.commands.some(c => c.deviceId === deviceId && c.sessionId === sessionId && c.status === "pending")) throw new Error("Wait for acknowledgement or timeout before retrying.");
  const stopReason = command === "EMERGENCY_STOP" ? "EMERGENCY_STOP" : user.role === "admin" ? "ADMIN_STOPPED" : "USER_STOPPED";
  if (command === "EMERGENCY_STOP" && s) { finish(data, s.id, stopReason, now); const bay = data.bays.find(b => b.id === s.bayId)!; bay.fault = true; data.faults.unshift({ id: `FAULT-${id}`, stationId: s.stationId, deviceId, bayId: bay.id, severity: "critical", status: "open", message: "Emergency stop latched", note: "", at: new Date(now).toISOString() }); }
  const result: Command = { id, sessionId, deviceId, bayId: s?.bayId, command, status: "pending", outcome: device.outcome, issuedAt: new Date(now).toISOString(), expiresAt: new Date(now + 6000).toISOString(), actorId: user.id, message: "Awaiting Station Controller acknowledgement.", stopReason };
  data.commands.unshift(result); audit(data, user.id, `${command} requested`, deviceId, sessionId ?? "Device check", now); return result;
}
export function createPayment(data: Snapshot, who: Actor | null, amountMinor: number, requestId: string, now: number): Payment {
  const user = actor(data, who); validateTopup(amountMinor, data.policy.maxTopupMinor);
  const existing = data.payments.find(p => p.requestId === requestId && p.userId === user.id); if (existing) return existing;
  const payment = { id: `TOP-${requestId}`, userId: user.id, amountMinor, requestId, status: "pending" as const, sandbox: true as const, createdAt: new Date(now).toISOString() };
  data.payments.unshift(payment); return payment;
}
export function advance(input: Snapshot, now: number): Snapshot {
  const data = structuredClone(input); const iso = new Date(now).toISOString();
  const dt = Math.max(0, Math.min(5000, now - Date.parse(data.lastTick))) * data.policy.demoSpeed;
  // A payment is credited only after its simulated gateway submission verifies.
  for (const p of data.payments) if (p.status === "pending" && p.submittedAt && now - Date.parse(p.submittedAt) >= 2000 && p.demoOutcome !== "pending") {
    p.status = p.demoOutcome === "success" ? "verified" : p.demoOutcome === "failure" ? "failed" : "cancelled";
    if (p.status === "verified" && !data.ledger.some(l => l.reference === p.id)) {
      const wallet = data.wallets.find(w => w.userId === p.userId)!;
      if (wallet.balanceMinor + p.amountMinor > 1_000_000_000) { p.status = "failed"; continue; }
      wallet.balanceMinor += p.amountMinor; p.verifiedAt = iso;
      data.ledger.unshift({ id: `CREDIT-${p.id}`, userId: p.userId, kind: "top-up", amountMinor: p.amountMinor, balanceAfterMinor: wallet.balanceMinor, reference: p.id, reason: "Verified demo of SSLCOMMERZ Sandbox payment", status: "posted", sandbox: true, at: iso });
      audit(data, "demo-verifier", "Payment verified", p.id, "Idempotent credit ledger posting", now);
    }
  }
  for (const c of data.commands.filter(c => c.status === "pending")) {
    if (now - Date.parse(c.issuedAt) < 1200) continue;
    const device = data.devices.find(d => d.id === c.deviceId)!; const s = data.sessions.find(s => s.id === c.sessionId);
    if ((!device.online || c.outcome === "timeout") && now < Date.parse(c.expiresAt)) continue;
    c.status = !device.online || c.outcome === "timeout" ? "timed-out" : c.outcome === "failure" ? "failed" : "acknowledged";
    if (c.status === "acknowledged" && c.command === "START" && s) {
      try { validateStart(data, { id: c.actorId, role: data.users.find(u => u.id === c.actorId)!.role }, { stationId: s.stationId, bayId: s.bayId, vehicleId: s.vehicleId, ownerId: s.ownerId, requestId: s.id }, s.id); s.state = "charging"; s.updatedAt = iso; }
      catch (e) { c.status = "failed"; c.message = (e as Error).message; }
    }
    if (c.status !== "acknowledged" && c.command === "START" && s) finish(data, s.id, c.status === "timed-out" ? "DEVICE_OFFLINE" : "FAULT", now);
    if (c.status === "acknowledged" && c.command === "STOP" && s) finish(data, s.id, c.stopReason ?? "USER_STOPPED", now);
    if (!c.message.startsWith("Connect") && c.status === "acknowledged") c.message = `${c.command} acknowledged by simulated Station Controller.`;
    else if (c.status === "timed-out") c.message = "Device acknowledgement timed out. Inspect connection and retry.";
    else if (c.status === "failed" && c.message === "Awaiting Station Controller acknowledgement.") c.message = "Device rejected the command. Inspect and retry.";
    s?.events.push({ at: iso, message: c.message }); audit(data, "engine", `Command ${c.status}`, c.id, c.message, now);
  }
  for (const s of data.sessions.filter(s => s.state !== "completed")) {
    const bay = data.bays.find(b => b.id === s.bayId)!; const d = data.devices.find(d => d.id === s.deviceId)!; const station = data.stations.find(p => p.id === s.stationId)!;
    if (!d.online || !station.online || now - Date.parse(d.lastSeen) > data.policy.communicationTimeoutMs) { finish(data, s.id, "DEVICE_OFFLINE", now); continue; }
    if (!bay.plugged) { finish(data, s.id, "PLUG_DISCONNECTED", now); continue; }
    if (bay.fault || !bay.enabled || data.users.find(u => u.id === s.ownerId)?.status !== "active") { finish(data, s.id, "FAULT", now); continue; }
    if (s.state !== "charging") continue;
    const vehicle = data.vehicles.find(v => v.id === s.vehicleId)!;
    const voltage = 3 + s.battery * .012; const current = .48 * (s.battery >= 80 ? .65 : 1); const watts = voltage * current;
    const affordable = affordableEnergy(s.reservedMinor, s.tariffMinor);
    const capacity = Math.max(0, Math.floor(vehicle.capacityWh * 1000 * (s.targetBattery - s.initialBattery) / 100));
    const increment = Math.max(0, Math.floor(watts * data.policy.modelScale * dt / 3600));
    s.energyMWh = Math.min(s.energyMWh + increment, affordable, capacity);
    s.costMinor = energyCost(s.energyMWh, s.tariffMinor);
    s.elapsedMs += dt; s.battery = Math.min(s.targetBattery, s.initialBattery + s.energyMWh / (vehicle.capacityWh * 1000) * 100); vehicle.battery = s.battery; s.updatedAt = iso;
    const source = d.stationBattery < 10 && d.gridBackup ? "GRID" : d.solarW >= watts ? "SOLAR" : "STORAGE";
    s.points.push({ at: iso, voltage, current, powerW: watts, energyMWh: s.energyMWh, battery: s.battery, source, simulated: true }); s.points = s.points.slice(-60); s.events = s.events.slice(-100);
    if (s.energyMWh >= affordable) finish(data, s.id, "CREDIT_EXHAUSTED", now);
    else if (s.energyMWh >= capacity) finish(data, s.id, "BATTERY_FULL", now);
    else if (d.stationBattery < 5 && !d.gridBackup && d.solarW < watts) { bay.fault = true; finish(data, s.id, "FAULT", now); }
  }
  for (const d of data.devices) if (d.online) d.lastSeen = iso;
  data.commands = data.commands.slice(0, 200); data.lastTick = iso; data.revision++;
  return data;
}
export function adjust(data: Snapshot, who: Actor | null, userId: string, amountMinor: number, reason: string, now: number, requestId: string, kind: "adjustment" | "reversal" = "adjustment") {
  const user = actor(data, who, true); if (!Number.isSafeInteger(amountMinor) || amountMinor === 0 || Math.abs(amountMinor) > 1_000_000_000 || reason.trim().length < 8) throw new Error("Enter a non-zero credit adjustment and a meaningful reason (8+ characters).");
  if (data.ledger.some(l => l.id === requestId)) return;
  const wallet = data.wallets.find(w => w.userId === userId); if (!wallet) throw new Error("Wallet not found.");
  if (walletView(data, userId).availableMinor + amountMinor < 0) throw new Error("Adjustment cannot spend credits reserved by an active session.");
  if (wallet.balanceMinor + amountMinor > 1_000_000_000) throw new Error("Wallet maximum exceeded.");
  wallet.balanceMinor += amountMinor; data.ledger.unshift({ id: requestId, userId, kind, amountMinor, balanceAfterMinor: wallet.balanceMinor, reference: requestId, reason: reason.trim(), status: "posted", sandbox: false, at: new Date(now).toISOString() }); audit(data, user.id, "Wallet adjustment", requestId, reason, now);
}
export { bayState };

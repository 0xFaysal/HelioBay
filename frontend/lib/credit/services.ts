"use client";
import { z } from "zod";
import { useCreditStore, transaction } from "@/store/credit-store";
import { isDemo, apiBaseUrl } from "@/lib/config";
import { firebaseAuth, firebaseConfigured } from "@/lib/firebase/client";
import { createApiClient } from "@/lib/api/client";
import { actor, adjust, advance, audit, createPayment, finish, sendCommand, startSession } from "./engine";
import { baySchema, deviceSchema, paymentSchema, policySchema, snapshotSchema, stationSchema, userSchema, vehicleSchema, type Coordinates, type Device, type Payment, type Policy, type Snapshot, type StartInput, type Station, type Bay, type Vehicle, type User } from "./model";
import { gatewayUrl, validateTopup } from "./money";
import { distance } from "./selectors";

const request = createApiClient({ baseUrl: apiBaseUrl, token: async () => firebaseConfigured ? await firebaseAuth().currentUser?.getIdToken() ?? null : null, unauthorized: () => window.dispatchEvent(new Event("heliobay:unauthorized")) });
const who = () => useCreditStore.getState().account;
const snapshot = () => useCreditStore.getState().data;
const encoded = encodeURIComponent;
async function mutation(path: string, body: unknown, method = "POST", key = crypto.randomUUID()) {
  const data = await request(path, snapshotSchema, { method, body, idempotencyKey: key }); useCreditStore.setState({ data }); return data;
}
export const creditService = {
  async refresh(signal?: AbortSignal) {
    if (isDemo) { await useCreditStore.persist.rehydrate(); return; }
    const identity = who()?.id; useCreditStore.setState({ loading: true, error: "" });
    try {
      if (identity) { const data = await request("/platform/snapshot", snapshotSchema, { signal }); if (who()?.id === identity) useCreditStore.setState({ data }); }
      else await creditService.stations.nearest(undefined, signal);
    } catch (e) { if (!signal?.aborted) useCreditStore.setState({ error: (e as Error).message }); throw e; }
    finally { useCreditStore.setState({ loading: false }); }
  },
  stations: {
    async nearest(location?: Coordinates, signal?: AbortSignal) {
      if (isDemo) return snapshot().stations.map(s => ({ ...s, distanceKm: location ? distance(location, s) : undefined })).sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0));
      const result = await request(`/stations${location ? `?lat=${location.lat}&lng=${location.lng}&sort=distance` : ""}`, z.object({ stations: z.array(stationSchema), bays: z.array(baySchema), devices: z.array(deviceSchema), policy: policySchema }), { signal });
      useCreditStore.setState(s => ({ data: { ...s.data, ...result } })); return result.stations;
    },
    async save(station: Station) {
      const parsed = stationSchema.parse(station);
      if (!isDemo) return mutation(`/admin/stations/${encoded(parsed.id)}`, parsed, "PUT");
      return transaction(data => {
        const user = actor(data, who(), true); const existing = data.stations.find(s => s.id === parsed.id);
        if (data.stations.some(s => s.deviceId === parsed.deviceId && s.id !== parsed.id)) throw new Error("A primary ESP32 can control only one station.");
        if (existing && existing.deviceId !== parsed.deviceId) {
          if (data.sessions.some(s => s.stationId === parsed.id && s.state !== "completed")) throw new Error("Stop all station sessions before assigning a device.");
          const d = data.devices.find(d => d.id === existing.deviceId)!; d.id = parsed.deviceId;
          for (const b of data.bays.filter(b => b.stationId === parsed.id)) b.deviceId = parsed.deviceId;
        }
        if (existing) Object.assign(existing, parsed); else {
          data.stations.push(parsed); data.devices.push({ id: parsed.deviceId, stationId: parsed.id, online: true, lastSeen: new Date().toISOString(), firmware: "heliobay-demo/3.0", stationBattery: 80, solarW: 1.8, gridBackup: true, gridExport: false, outcome: "success" });
          data.bays.push({ id: `${parsed.id}-BAY01`, stationId: parsed.id, deviceId: parsed.deviceId, number: 1, relayChannel: 1, connector: "CCS2", enabled: true, plugged: false, fault: false });
        }
        if (!parsed.online) for (const s of data.sessions.filter(s => s.stationId === parsed.id)) finish(data, s.id, "DEVICE_OFFLINE", Date.now());
        audit(data, user.id, "Station saved", parsed.id, "One primary ESP32; existing bays retain their channels", Date.now());
      });
    },
  },
  bays: {
    async save(bay: Bay) {
      const parsed = baySchema.parse(bay); if (!isDemo) return mutation(`/admin/bays/${encoded(parsed.id)}`, parsed, "PUT");
      return transaction(data => {
        const user = actor(data, who(), true); const station = data.stations.find(s => s.id === parsed.stationId);
        if (!station || station.deviceId !== parsed.deviceId) throw new Error("Bays must use the station’s primary ESP32.");
        if (data.bays.some(b => b.id !== parsed.id && b.stationId === parsed.stationId && (b.relayChannel === parsed.relayChannel || b.number === parsed.number))) throw new Error("Bay numbers and relay channels must be unique within a station.");
        const existing = data.bays.find(b => b.id === parsed.id);
        if (existing && (existing.relayChannel !== parsed.relayChannel || existing.connector !== parsed.connector) && data.sessions.some(s => s.bayId === parsed.id && s.state !== "completed")) throw new Error("Stop charging before changing the relay or connector.");
        if (existing) Object.assign(existing, parsed); else data.bays.push(parsed);
        if (!parsed.enabled || parsed.fault) for (const s of data.sessions.filter(s => s.bayId === parsed.id)) finish(data, s.id, "FAULT", Date.now());
        audit(data, user.id, "Bay configured", parsed.id, `Relay ${parsed.relayChannel}; ${parsed.connector}`, Date.now());
      });
    },
    async plug(bayId: string, plugged: boolean) {
      if (!isDemo) throw new Error("Plug presence is supplied by ESP32 telemetry in API mode.");
      return transaction(data => { const user = actor(data, who()); const bay = data.bays.find(b => b.id === bayId); if (!bay) throw new Error("Bay not found."); const active = data.sessions.find(s => s.bayId === bayId && s.state !== "completed"); if (active && active.ownerId !== user.id && user.role !== "admin") throw new Error("This bay belongs to another active user."); bay.plugged = plugged; if (!plugged && active) finish(data, active.id, "PLUG_DISCONNECTED", Date.now()); audit(data, user.id, plugged ? "Demo plug connected" : "Demo plug removed", bayId, "Explicit physical-input simulation", Date.now()); });
    },
  },
  charging: {
    async start(input: StartInput) {
      if (isDemo) return transaction(data => startSession(data, who(), input, Date.now()));
      const data = await mutation("/charging-sessions/start", input, "POST", input.requestId); const s = data.sessions.find(s => s.commandId && s.state === "pending" && s.bayId === input.bayId); if (!s) throw new Error("Backend did not return a pending charging session."); return s;
    },
    async stop(id: string, emergency = false) { const s = snapshot().sessions.find(s => s.id === id); if (!s) throw new Error("Session not found."); return creditService.devices.command(s.deviceId, emergency ? "EMERGENCY_STOP" : "STOP", id); },
  },
  devices: {
    async command(deviceId: string, command: "STOP" | "EMERGENCY_STOP" | "TEST" | "RESTART", sessionId?: string) {
      if (!isDemo) return mutation(`/devices/${encoded(deviceId)}/commands`, { command, sessionId });
      return transaction(data => sendCommand(data, who(), deviceId, command, sessionId, Date.now(), crypto.randomUUID()));
    },
    async configure(id: string, patch: Partial<Device>) {
      if (!isDemo) throw new Error("Demo hardware injection is disabled in API mode.");
      return transaction(data => { const user = actor(data, who(), true); const device = data.devices.find(d => d.id === id); if (!device) throw new Error("Device not found."); Object.assign(device, deviceSchema.parse({ ...device, ...patch, id, stationId: device.stationId })); Object.assign(data, advance(data, Date.now())); audit(data, user.id, "Demo device input", id, JSON.stringify(patch), Date.now()); });
    },
    async fault(bayId: string) { if (!isDemo) throw new Error("Fault injection is Demo Mode only."); return transaction(data => { const user = actor(data, who(), true); const bay = data.bays.find(b => b.id === bayId); if (!bay) throw new Error("Bay not found."); bay.fault = true; data.faults.unshift({ id: crypto.randomUUID(), stationId: bay.stationId, bayId, deviceId: bay.deviceId, severity: "critical", message: "Simulated sensor fault", status: "open", note: "", at: new Date().toISOString() }); for (const s of data.sessions.filter(s => s.bayId === bayId)) finish(data, s.id, "FAULT", Date.now()); audit(data, user.id, "Fault injected", bayId, "Explicit demo test", Date.now()); }); },
    async full(sessionId: string) { if (!isDemo) throw new Error("Battery injection is Demo Mode only."); return transaction(data => { const user = actor(data, who(), true); const s = data.sessions.find(s => s.id === sessionId); if (!s || s.state !== "charging") throw new Error("Select a charging session."); s.battery = 100; const v = data.vehicles.find(v => v.id === s.vehicleId); if (v) v.battery = 100; finish(data, s.id, "BATTERY_FULL", Date.now()); audit(data, user.id, "Demo full battery", s.id, "Battery sense test", Date.now()); }); },
  },
  wallet: {
    async topup(amountMinor: number, requestId: string) {
      validateTopup(amountMinor, snapshot().policy.maxTopupMinor);
      if (isDemo) { const payment = await transaction(data => createPayment(data, who(), amountMinor, requestId, Date.now())); return { paymentId: payment.id, GatewayPageURL: `/wallet/sandbox/${payment.id}` }; }
      const result = await request("/wallet/top-ups", z.object({ paymentId: z.string(), GatewayPageURL: z.string() }), { method: "POST", body: { amountMinor, currency: "BDT" }, idempotencyKey: requestId }); return { ...result, GatewayPageURL: gatewayUrl(result.GatewayPageURL) };
    },
    async payment(id: string, signal?: AbortSignal): Promise<Payment> {
      if (isDemo) return transaction(data => { Object.assign(data, advance(data, Date.now())); const user = actor(data, who()); const p = data.payments.find(p => p.id === id && (p.userId === user.id || user.role === "admin")); if (!p) throw new Error("Payment reference not found for this account."); return p; });
      const payment = await request(`/wallet/payments/${encoded(id)}`, paymentSchema, { signal }); if (payment.status === "verified") await creditService.refresh(signal); return payment;
    },
    async submitDemo(id: string, outcome: "success" | "failure" | "cancel" | "pending") {
      if (!isDemo) throw new Error("Only the backend can process payment callbacks.");
      return transaction(data => { const user = actor(data, who()); const p = data.payments.find(p => p.id === id && p.userId === user.id); if (!p) throw new Error("Payment not found."); if (p.status !== "pending" || p.submittedAt) return; p.submittedAt = new Date().toISOString(); p.demoOutcome = outcome; });
    },
    async adjust(userId: string, amountMinor: number, reason: string, requestId: string, kind: "adjustment" | "reversal" = "adjustment") { if (!isDemo) return mutation(`/admin/users/${encoded(userId)}/wallet-adjustments`, { amountMinor, reason, kind }, "POST", requestId); return transaction(data => adjust(data, who(), userId, amountMinor, reason, Date.now(), requestId, kind)); },
  },
  users: {
    async update(patch: Partial<User>) { if (!isDemo) return mutation("/me", patch, "PATCH"); return transaction(data => { const user = actor(data, who()); const { name, phone, city, preferences, savedStations } = patch; Object.assign(user, userSchema.parse({ ...user, ...Object.fromEntries(Object.entries({ name, phone, city, preferences, savedStations }).filter(([, v]) => v !== undefined)) })); }); },
    async status(id: string, status: User["status"], reason: string) { if (!isDemo) return mutation(`/admin/users/${encoded(id)}`, { status, reason }, "PATCH"); return transaction(data => { const admin = actor(data, who(), true); if (reason.trim().length < 8) throw new Error("A meaningful reason is required."); const user = data.users.find(u => u.id === id); if (!user || user.role === "admin") throw new Error("Administrator accounts cannot be blocked here."); user.status = status; if (status === "blocked") for (const s of data.sessions.filter(s => s.ownerId === id)) finish(data, s.id, "FAULT", Date.now()); audit(data, admin.id, `User ${status}`, id, reason, Date.now()); }); },
  },
  vehicles: {
    async save(input: Vehicle) { const parsed = vehicleSchema.parse(input); if (!isDemo) return mutation(`/vehicles/${encoded(parsed.id)}`, parsed, "PUT"); return transaction(data => { const user = actor(data, who()); if (parsed.ownerId !== user.id) throw new Error("Vehicle owner mismatch."); if (data.sessions.some(s => s.vehicleId === parsed.id && s.state !== "completed")) throw new Error("Stop charging before editing this vehicle."); if (data.vehicles.some(v => v.ownerId === user.id && v.id !== parsed.id && v.plate.toLowerCase() === parsed.plate.toLowerCase())) throw new Error("This plate already exists."); if (parsed.isDefault) for (const v of data.vehicles.filter(v => v.ownerId === user.id)) v.isDefault = false; const found = data.vehicles.find(v => v.id === parsed.id); if (found) Object.assign(found, parsed); else data.vehicles.push(parsed); }); },
    async remove(id: string) { if (!isDemo) return mutation(`/vehicles/${encoded(id)}`, {}, "DELETE"); return transaction(data => { const user = actor(data, who()); if (!data.vehicles.some(v => v.id === id && v.ownerId === user.id)) throw new Error("Vehicle not found."); if (data.sessions.some(s => s.vehicleId === id && s.state !== "completed")) throw new Error("Stop charging before removing this vehicle."); data.vehicles = data.vehicles.filter(v => v.id !== id); const remaining = data.vehicles.filter(v => v.ownerId === user.id); if (!remaining.some(v => v.isDefault) && remaining[0]) remaining[0].isDefault = true; }); },
  },
  admin: {
    async policy(input: Policy, rollback = false) { const policy = policySchema.parse(input); if (!isDemo) return mutation("/admin/tariffs", { ...policy, rollback }, "PATCH"); return transaction(data => { const user = actor(data, who(), true); const previous = data.policy; data.policy = rollback ? data.previousPolicy ?? previous : policy; data.previousPolicy = previous; for (const s of data.stations) s.priceMinor = data.policy.defaultTariffMinor; audit(data, user.id, "Tariff policy changed", "POLICY", "Applies to new sessions; active session tariffs stay fixed", Date.now()); }); },
    async fault(id: string, status: "acknowledged" | "resolved", note: string) { if (!isDemo) return mutation(`/admin/faults/${encoded(id)}`, { status, note }, "PATCH"); return transaction(data => { const user = actor(data, who(), true); if (note.trim().length < 8) throw new Error("Add a meaningful inspection note."); const fault = data.faults.find(f => f.id === id); if (!fault) throw new Error("Fault not found."); fault.status = status; fault.note = note; if (status === "resolved") { const b = data.bays.find(b => b.id === fault.bayId); if (b) b.fault = data.faults.some(f => f.bayId === b.id && f.status !== "resolved"); } audit(data, user.id, `Fault ${status}`, id, note, Date.now()); }); },
  },
};
export type CreditServices = typeof creditService;
export type { Snapshot };

"use client";
import { z } from "zod";
import { useCreditStore, transaction } from "@/store/credit-store";
import { isDemo } from "@/lib/config";
import { backend } from "@/lib/api/backend";
import { mapPayment, resourcePayment, resourceSession, mapSession, mapCommand, resourceWallet } from "@/lib/api/resources";
import { actor, adjust, advance, audit, createPayment, finish, sendCommand, startSession } from "./engine";
import { baySchema, deviceSchema, policySchema, stationSchema, userSchema, vehicleSchema, type Coordinates, type Device, type Payment, type Policy, type Snapshot, type StartInput, type Station, type Bay, type Vehicle, type User } from "./model";
import { gatewayUrl, validateTopup } from "./money";
import { energyPolicySchema, type EnergyPolicy } from "../energy/model";
import { createEnergyRecord } from "../energy/adapter";
import { distance } from "./selectors";

const request = backend.request;
let refreshSequence = 0;
const who = () => useCreditStore.getState().account;
const snapshot = () => useCreditStore.getState().data;
const encoded = encodeURIComponent;
async function mutation(path: string, body: unknown, method = "POST", key = crypto.randomUUID()) {
  const identity = who()?.id;
  await request(path, z.unknown(), { method, body, idempotencyKey: key });
  if (who()?.id !== identity) throw new Error("The signed-in account changed. Refresh before continuing.");
  await creditService.refresh(); return snapshot();
}
export const creditService = {
  async refresh(signal?: AbortSignal) {
    if (isDemo) { await useCreditStore.persist.rehydrate(); return; }
    const identity = who()?.id; const sequence = ++refreshSequence;
    useCreditStore.setState({ loading: snapshot().users.length === 0 && Boolean(identity) });
    try {
      if (identity) { const data = await backend.load(who()!.role, signal); if (who()?.id === identity && sequence === refreshSequence) useCreditStore.setState({data:{...data,revision:sequence},error:""}); }
      else await creditService.stations.nearest(undefined, signal);
    } catch (e) { if (!signal?.aborted && who()?.id === identity) useCreditStore.setState({ error: (e as Error).message }); throw e; }
    finally { if (who()?.id === identity) useCreditStore.setState({ loading: false }); }
  },
  energy: {
    async configure(stationId: string, policy: EnergyPolicy) {
      const parsed = energyPolicySchema.parse(policy);
      if (!isDemo) return mutation(`/admin/stations/${encoded(stationId)}/energy-policy`, parsed, "PUT");
      return transaction(data => {
        const user = actor(data, who(), true);
        const station = data.stations.find(s => s.id === stationId);
        const controller = data.devices.find(d => d.id === station?.deviceId);
        if (!station || !controller) throw new Error("Station not found.");
        let record = data.energy.find(e => e.stationId === stationId);
        if (!record) { record = createEnergyRecord(stationId, controller.stationBattery, Date.now()); data.energy.push(record); }
        record.policy = parsed;
        audit(data, user.id, "Energy policy updated", stationId, "Battery limits and configured grid tariffs; past energy charges unchanged", Date.now());
      });
    },
  },
  stations: {
    async nearest(location?: Coordinates, signal?: AbortSignal) {
      if (isDemo) return snapshot().stations.map(s => ({ ...s, distanceKm: location ? distance(location, s) : undefined })).sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0));
      const result = await backend.directory(signal, location);
      useCreditStore.setState(s => ({ data: { ...s.data, ...result } })); return result.stations;
    },
    async save(station: Station) {
      const parsed = stationSchema.parse(station);
      if (!isDemo) return mutation(`/admin/stations/${encoded(parsed.id)}`, parsed, "PUT");
      return transaction(data => {
        const user = actor(data, who(), true); const existing = data.stations.find(s => s.id === parsed.id);
        if (data.stations.some(s => s.deviceId === parsed.deviceId && s.id !== parsed.id)) throw new Error("A primary Station Controller can control only one station.");
        if (existing && existing.deviceId !== parsed.deviceId) {
          if (data.sessions.some(s => s.stationId === parsed.id && s.state !== "completed") || data.commands.some(c => c.deviceId === existing.deviceId && c.status === "pending")) throw new Error("Stop all station sessions and resolve pending commands before assigning a device.");
          const d = data.devices.find(d => d.id === existing.deviceId)!; d.id = parsed.deviceId;
          for (const b of data.bays.filter(b => b.stationId === parsed.id)) b.deviceId = parsed.deviceId;
        }
        if (existing) Object.assign(existing, parsed); else {
          data.stations.push(parsed); data.devices.push({ id: parsed.deviceId, stationId: parsed.id, online: true, lastSeen: new Date().toISOString(), firmware: "heliobay-demo/3.0", stationBattery: 80, solarW: 23000, gridBackup: true, gridExport: true, outcome: "success" });
          data.bays.push({ id: `${parsed.id}-BAY01`, stationId: parsed.id, deviceId: parsed.deviceId, number: 1, relayChannel: 1, connector: "CCS2", enabled: true, plugged: false, fault: false });
        }
        if (!parsed.online) for (const s of data.sessions.filter(s => s.stationId === parsed.id)) finish(data, s.id, "DEVICE_OFFLINE", Date.now());
        audit(data, user.id, "Station saved", parsed.id, "One primary Station Controller; existing bays retain their channels", Date.now());
      });
    },
  },
  bays: {
    async save(bay: Bay) {
      const parsed = baySchema.parse(bay); if (!isDemo) return mutation(`/admin/bays/${encoded(parsed.id)}`, parsed, "PUT");
      return transaction(data => {
        const user = actor(data, who(), true); const station = data.stations.find(s => s.id === parsed.stationId);
        if (!station || station.deviceId !== parsed.deviceId) throw new Error("Bays must use the station’s primary Station Controller.");
        if (data.bays.some(b => b.id !== parsed.id && b.stationId === parsed.stationId && (b.relayChannel === parsed.relayChannel || b.number === parsed.number))) throw new Error("Bay numbers and bay assignments must be unique within a station.");
        const existing = data.bays.find(b => b.id === parsed.id);
        if (existing && (existing.relayChannel !== parsed.relayChannel || existing.connector !== parsed.connector) && data.sessions.some(s => s.bayId === parsed.id && s.state !== "completed")) throw new Error("Stop charging before changing the bay assignment or connector.");
        if (existing) Object.assign(existing, parsed); else data.bays.push(parsed);
        if (!parsed.enabled || parsed.fault) for (const s of data.sessions.filter(s => s.bayId === parsed.id)) finish(data, s.id, "FAULT", Date.now());
        audit(data, user.id, "Bay configured", parsed.id, `Assignment ${parsed.relayChannel}; ${parsed.connector}`, Date.now());
      });
    },
    async plug(bayId: string, plugged: boolean) {
      if (!isDemo) throw new Error("Plug presence is supplied by Station Controller telemetry in API mode.");
      return transaction(data => { const user = actor(data, who()); const bay = data.bays.find(b => b.id === bayId); if (!bay) throw new Error("Bay not found."); const active = data.sessions.find(s => s.bayId === bayId && s.state !== "completed"); if (active && active.ownerId !== user.id && user.role !== "admin") throw new Error("This bay belongs to another active user."); bay.plugged = plugged; if (!plugged && active) finish(data, active.id, "PLUG_DISCONNECTED", Date.now()); audit(data, user.id, plugged ? "Demo plug connected" : "Demo plug removed", bayId, "Explicit physical-input simulation", Date.now()); });
    },
  },
  charging: {
    async sync(id:string,signal?:AbortSignal) {
      if(isDemo)return;
      const identity=who()?.id;if(!identity)return;
      const raw=await request(`${who()?.role==="admin"?"/admin":""}/charging-sessions/${encoded(id)}`,resourceSession,{signal});
      const session=mapSession(raw);
      const wallet=session.state==="completed" ? await request(who()?.role==="admin"?`/admin/users/${encoded(raw.ownerId)}/wallet`:"/me/wallet",resourceWallet,{signal}):null;
      if(who()?.id!==identity)return;
      useCreditStore.setState(s=>({data:{...s.data,lastTick:new Date().toISOString(),sessions:[session,...s.data.sessions.filter(p=>p.id!==id)],commands:[...raw.commands.map(mapCommand),...s.data.commands.filter(c=>c.sessionId!==id)],wallets:wallet?[wallet,...s.data.wallets.filter(w=>w.userId!==wallet.userId)]:s.data.wallets}}));
    },
    async start(input: StartInput) {
      if (isDemo) return transaction(data => startSession(data, who(), input, Date.now()));
      const result = await request("/charging-sessions/start",z.object({id:z.string()}),{method:"POST",body:{stationId:input.stationId,bayId:input.bayId,vehicleId:input.vehicleId},idempotencyKey:input.requestId}); await creditService.refresh(); return result;
    },
    async stop(id: string, emergency = false, adminReason?: string) { const s = snapshot().sessions.find(s => s.id === id); if (!s) throw new Error("Session not found."); return creditService.devices.command(s.deviceId, emergency ? "EMERGENCY_STOP" : "STOP", id, adminReason); },
  },
  devices: {
    async command(deviceId: string, command: "STOP" | "EMERGENCY_STOP" | "TEST" | "RESTART", sessionId?: string, adminReason?: string) {
      if (!isDemo) {
        if (sessionId) return mutation(who()?.role === "admin" ? `/admin/charging-sessions/${encoded(sessionId)}/stop` : `/charging-sessions/${encoded(sessionId)}/stop`,who()?.role === "admin" ? {confirmed:true,reason:adminReason} : {emergency:command === "EMERGENCY_STOP"});
        return mutation(`/admin/devices/${encoded(deviceId)}/commands`,{type:command,confirmed:true,reason:"Operator confirmed controller maintenance"});
      }
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
      if (amountMinor % 100 !== 0) throw new Error("Choose a whole number of Credits for SSLCOMMERZ.");
      const result = await request("/wallet/top-ups",z.object({transactionId:z.string(),GatewayPageURL:z.string().nullable(),status:z.string()}),{method:"POST",body:{credits:amountMinor/100},idempotencyKey:requestId});
      if (!result.GatewayPageURL) throw new Error(`Payment ${result.transactionId} is ${result.status.toLowerCase()}. Check payment history before creating another top-up.`);
      return {paymentId:result.transactionId,GatewayPageURL:result.GatewayPageURL.startsWith("/wallet/sandbox/")?result.GatewayPageURL:gatewayUrl(result.GatewayPageURL)};
    },
    async payment(id: string, signal?: AbortSignal): Promise<Payment> {
      if (isDemo) return transaction(data => { Object.assign(data, advance(data, Date.now())); const user = actor(data, who()); const p = data.payments.find(p => p.id === id && (p.userId === user.id || user.role === "admin")); if (!p) throw new Error("Payment reference not found for this account."); return p; });
      const payment=mapPayment(await request(`/wallet/top-ups/${encoded(id)}`,resourcePayment,{signal})); await creditService.refresh(signal); return payment;
    },
    async submitDemo(id: string, outcome: "success" | "failure" | "cancel" | "pending") {
      if (!isDemo) throw new Error("Only the backend can process payment callbacks.");
      return transaction(data => { const user = actor(data, who()); const p = data.payments.find(p => p.id === id && p.userId === user.id); if (!p) throw new Error("Payment not found."); if (p.status !== "pending" || p.submittedAt) return; p.submittedAt = new Date().toISOString(); p.demoOutcome = outcome; });
    },
    async submitLocal(id:string,outcome:"success"|"failure"|"cancel") {
      if(isDemo)throw new Error("Local API sandbox is unavailable in browser demo mode.");
      const result=mapPayment(await request(`/wallet/top-ups/${encoded(id)}/local-sandbox`,resourcePayment,{method:"POST",body:{outcome}}));
      await creditService.refresh();
      return result;
    },
    async adjust(userId: string, amountMinor: number, reason: string, requestId: string, kind: "adjustment" | "reversal" = "adjustment", ledgerId?:string) { if (!isDemo) return mutation(`/admin/users/${encoded(userId)}/wallet/adjustments`, kind==="reversal"?{ ledgerId, reason, kind:"REVERSAL" }:{ amountMinor:Math.abs(amountMinor).toString(), reason, kind:amountMinor<0?"ADMIN_DEBIT":"ADMIN_CREDIT" }, "POST", requestId); return transaction(data => {const original=kind==="reversal"?data.ledger.find(l=>l.id===ledgerId&&l.userId===userId):undefined;if(kind==="reversal"&&!original)throw new Error("Select the original ledger entry to reverse.");return adjust(data, who(), userId, original?-original.amountMinor:amountMinor, reason, Date.now(), requestId, kind);}); },
  },
  notifications:{async read(id:string){if(isDemo)return transaction(data=>{const n=data.notifications.find(n=>n.id===id);if(n)n.readAt=new Date().toISOString();});await request(`/me/notifications/${encoded(id)}/read`,z.unknown(),{method:"PATCH",body:{}});useCreditStore.setState(s=>({data:{...s.data,notifications:s.data.notifications.map(n=>n.id===id?{...n,readAt:new Date().toISOString()}:n)}}));}},
  users: {
    async update(patch: Partial<User>) { if (!isDemo) return mutation("/me", patch, "PATCH"); return transaction(data => { const user = actor(data, who()); const { name, phone, city, preferences, savedStations } = patch; Object.assign(user, userSchema.parse({ ...user, ...Object.fromEntries(Object.entries({ name, phone, city, preferences, savedStations }).filter(([, v]) => v !== undefined)) })); }); },
    async status(id: string, status: User["status"], reason: string) { if (!isDemo) return mutation(`/admin/users/${encoded(id)}`, { status:status==="active"?"ACTIVE":"BLOCKED", reason }, "PATCH"); return transaction(data => { const admin = actor(data, who(), true); if (reason.trim().length < 8) throw new Error("A meaningful reason is required."); const user = data.users.find(u => u.id === id); if (!user || user.role === "admin") throw new Error("Administrator accounts cannot be blocked here."); user.status = status; if (status === "blocked") for (const s of data.sessions.filter(s => s.ownerId === id)) finish(data, s.id, "FAULT", Date.now()); audit(data, admin.id, `User ${status}`, id, reason, Date.now()); }); },
  },
  vehicles: {
    async save(input: Vehicle) { const parsed = vehicleSchema.parse(input); if (!isDemo) { const exists=snapshot().vehicles.some(v=>v.id===parsed.id);return mutation(`/me/vehicles${exists?`/${encoded(parsed.id)}`:""}`,{name:parsed.name,plate:parsed.plate,capacityWh:parsed.capacityWh,connectorType:parsed.connector==="Type 2"?"TYPE_2":parsed.connector,estimatedSocPct:Math.round(parsed.battery),isDefault:parsed.isDefault},exists?"PATCH":"POST"); } return transaction(data => { const user = actor(data, who()); if (parsed.ownerId !== user.id) throw new Error("Vehicle owner mismatch."); if (data.sessions.some(s => s.vehicleId === parsed.id && s.state !== "completed")) throw new Error("Stop charging before editing this vehicle."); if (data.vehicles.some(v => v.ownerId === user.id && v.id !== parsed.id && v.plate.toLowerCase() === parsed.plate.toLowerCase())) throw new Error("This plate already exists."); if (parsed.isDefault) for (const v of data.vehicles.filter(v => v.ownerId === user.id)) v.isDefault = false; const found = data.vehicles.find(v => v.id === parsed.id); if (found) Object.assign(found, parsed); else data.vehicles.push(parsed); }); },
    async remove(id: string) { if (!isDemo) return mutation(`/me/vehicles/${encoded(id)}`, undefined, "DELETE"); return transaction(data => { const user = actor(data, who()); if (!data.vehicles.some(v => v.id === id && v.ownerId === user.id)) throw new Error("Vehicle not found."); if (data.sessions.some(s => s.vehicleId === id && s.state !== "completed")) throw new Error("Stop charging before removing this vehicle."); data.vehicles = data.vehicles.filter(v => v.id !== id); const remaining = data.vehicles.filter(v => v.ownerId === user.id); if (!remaining.some(v => v.isDefault) && remaining[0]) remaining[0].isDefault = true; }); },
  },
  admin: {
    async policy(input: Policy, rollback = false) { const policy = policySchema.parse(input); if (!isDemo) return mutation("/admin/tariffs", { ...policy, rollback }, "PATCH"); return transaction(data => { const user = actor(data, who(), true); const previous = data.policy; data.policy = rollback ? data.previousPolicy ?? previous : policy; data.previousPolicy = previous; for (const s of data.stations) s.priceMinor = data.policy.defaultTariffMinor; audit(data, user.id, "Tariff policy changed", "POLICY", "Applies to new sessions; active session tariffs stay fixed", Date.now()); }); },
    async fault(id: string, status: "acknowledged" | "resolved", note: string) { if (!isDemo) return mutation(`/admin/faults/${encoded(id)}/${status === "acknowledged" ? "acknowledge" : "resolve"}`, { confirmed:true, reason:note }, "POST"); return transaction(data => { const user = actor(data, who(), true); if (note.trim().length < 8) throw new Error("Add a meaningful inspection note."); const fault = data.faults.find(f => f.id === id); if (!fault) throw new Error("Fault not found."); fault.status = status; fault.note = note; if (status === "resolved") { const b = data.bays.find(b => b.id === fault.bayId); if (b) b.fault = data.faults.some(f => f.bayId === b.id && f.status !== "resolved"); } audit(data, user.id, `Fault ${status}`, id, note, Date.now()); }); },
  },
};
export type CreditServices = typeof creditService;
export type { Snapshot };

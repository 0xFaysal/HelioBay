"use client";
import { z } from "zod";
import { createApiClient } from "@/lib/api/client";
import { apiBaseUrl } from "@/lib/config";
import { firebaseAuth, firebaseConfigured } from "@/lib/firebase/client";
import { getSnapshot, useDemoStore } from "@/store/demo-store";
import type { PlatformServices } from "./contracts";
import { bookingSchema, commandSchema, networkSchema, ownerSchema, sessionSchema, snapshotSchema, stationSchema, telemetrySchema } from "./schemas";

export const apiRequest = createApiClient({
  baseUrl: apiBaseUrl,
  token: async () => firebaseConfigured ? await firebaseAuth().currentUser?.getIdToken() ?? null : null,
  unauthorized: () => { useDemoStore.getState().setAccount(null); window.dispatchEvent(new Event("heliobay:unauthorized")); },
});
const key = (id: string) => encodeURIComponent(id);
const ok = z.union([z.null(), z.object({ success: z.literal(true) })]);
async function refresh(signal?: AbortSignal) {
  const state = useDemoStore.getState();
  useDemoStore.setState({ apiLoading: true, apiError: "" });
  try {
    if (state.activeId) {
      // Backend scopes this snapshot by the verified token; admin gets network-wide data.
      const result = await apiRequest("/platform/snapshot", snapshotSchema, { signal });
      if (state.activeId !== useDemoStore.getState().activeId) return;
      useDemoStore.setState(result);
    } else {
      const stations = await apiRequest("/stations", z.array(stationSchema), { signal });
      useDemoStore.setState(s => ({ network: { ...s.network, stations } }));
    }
  } catch (e) {
    if (!signal?.aborted) useDemoStore.setState({ apiError: (e as Error).message });
    throw e;
  } finally { useDemoStore.setState({ apiLoading: false }); }
}
async function mutate(path: string, body?: unknown, method = "PATCH") {
  await apiRequest(path, ok, { method, body });
  await refresh();
}
export const apiPlatform: PlatformServices = {
  snapshot: getSnapshot, refresh,
  async saveOwner(owner) {
    const { profile, vehicles, selectedVehicleId, savedStations, notificationsRead, preferences } = owner;
    const result = await apiRequest("/me", ownerSchema, { method: "PATCH", body: { profile, vehicles, selectedVehicleId, savedStations, notificationsRead, preferences } });
    useDemoStore.getState().update(() => result);
  },
  stations: {
    async list(signal) {
      const stations = await apiRequest("/stations", z.array(stationSchema), { signal });
      useDemoStore.setState(s => ({ network: { ...s.network, stations } }));
      return stations;
    },
    get: id => getSnapshot().network.stations.find(s => s.id === id),
  },
  bookings: {
    async reserve(input) {
      const authorization = await apiRequest("/payments/simulate", z.object({ authorizationId: z.string(), authorized: z.literal(true) }), { method: "POST", body: input, idempotencyKey: `pay-${input.requestId}` });
      const result = await apiRequest("/bookings", bookingSchema, { method: "POST", body: { ...input, authorizationId: authorization.authorizationId }, idempotencyKey: input.requestId });
      useDemoStore.getState().update(d => ({ ...d, bookings: [result, ...d.bookings.filter(b => b.id !== result.id)] }));
      return result;
    },
    async cancel(id) {
      const result = await apiRequest(`/bookings/${key(id)}`, z.object({ refundedAmount: z.number().nonnegative() }), { method: "PATCH", body: { status: "cancelled" } });
      await refresh(); return result.refundedAmount;
    },
  },
  charging: {
    async enter(bookingId) {
      const result = await apiRequest("/charging-sessions/prepare", sessionSchema, { method: "POST", body: { bookingId }, idempotencyKey: `prepare-${bookingId}` });
      useDemoStore.getState().update(d => ({ ...d, sessions: [result, ...d.sessions.filter(s => s.id !== result.id)] }));
      return result;
    },
    async command(id, command, override = false) {
      const path = command === "START" ? "/charging-sessions/start" : `/charging-sessions/${key(id)}/${command === "STOP" || command === "EMERGENCY_STOP" ? "stop" : "commands"}`;
      const result = await apiRequest(path, commandSchema, { method: "POST", body: { sessionId: id, command, override }, idempotencyKey: crypto.randomUUID() });
      useDemoStore.setState(s => ({ network: { ...s.network, commands: [result, ...s.network.commands] } }));
      return result;
    },
    async presence() { throw new Error("Vehicle presence must come from backend telemetry in API mode."); },
  },
  devices: {
    async command(deviceId, command, sessionId, override = false) {
      const result = await apiRequest(`/admin/devices/${key(deviceId)}/commands`, commandSchema, { method: "POST", body: { command, sessionId, override }, idempotencyKey: crypto.randomUUID() });
      useDemoStore.setState(s => ({ network: { ...s.network, commands: [result, ...s.network.commands] } }));
      return result;
    },
    configure: async () => { throw new Error("Simulation injection is unavailable in API mode."); },
  },
  telemetry: { get: (stationId, signal) => apiRequest(`/stations/${key(stationId)}/telemetry`, z.array(telemetrySchema), { signal }) },
  payments: { simulate: input => apiPlatform.bookings.reserve(input), approveRefund: id => mutate(`/admin/refunds/${key(id)}`, { status: "approved" }) },
  admin: {
    refresh,
    saveStation: station => mutate(`/admin/stations/${key(station.id)}`, station, "PUT"),
    updateBay: (stationId, id, patch) => mutate(`/admin/stations/${key(stationId)}/bays/${key(id)}`, patch),
    updateBooking: (id, patch) => mutate(`/bookings/${key(id)}`, patch),
    updateFault: (id, status, note) => mutate(`/admin/faults/${key(id)}`, { status, note }),
    addMaintenance: (deviceId, note) => mutate("/admin/maintenance", { deviceId, note }, "POST"),
    savePricing: pricing => mutate("/admin/pricing", pricing),
    rollbackPricing: () => mutate("/admin/pricing/rollback", {}, "POST"),
    setSpeed: async () => { throw new Error("Demo acceleration is disabled in API mode."); },
  },
};
export const getApiNetwork = (signal?: AbortSignal) => apiRequest("/admin/network", networkSchema, { signal });

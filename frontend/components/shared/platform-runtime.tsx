"use client";
import { useEffect, useState } from "react";
import { useDemoStore, demoTransaction } from "@/store/demo-store";
import { advanceEngine } from "@/lib/demo/engine";
import { isDemo, wsUrl } from "@/lib/config";
import { platform } from "@/lib/platform";
import { createWebSocketClient } from "@/lib/realtime/client";
import { firebaseAuth, firebaseConfigured } from "@/lib/firebase/client";
import type { RealtimeEvent } from "@/lib/platform/contracts";

function applyEvent(event: RealtimeEvent) {
  if (event.type === "invalidate") { void platform.refresh().catch(() => {}); return; }
  useDemoStore.setState(state => {
    if (event.type === "telemetry") {
      const t = event.data;
      if (t.simulated) return { realtimeError: "Rejected simulated telemetry in API mode.", realtimeStatus: "error" };
      const devices = state.network.devices.map(d => d.id !== t.deviceId || d.telemetry && Date.parse(d.telemetry.timestamp) >= Date.parse(t.timestamp) ? d : {
        ...d, telemetry: t, online: t.online, vehicleDetected: t.occupied, mosfetOn: t.charging, lastSeen: t.timestamp,
        stationBattery: t.stationBatteryPercent, timeline: [...d.timeline, t].slice(-60),
      });
      return { network: { ...state.network, devices } };
    }
    if (event.type === "acknowledgement") {
      const ack = event.data;
      const command = state.network.commands.find(c => c.commandId === ack.commandId && c.deviceId === ack.deviceId);
      if (!command || command.status !== "pending" || Date.parse(ack.receivedAt) < Date.parse(command.issuedAt)) return state;
      return { network: { ...state.network, acknowledgements: [ack, ...state.network.acknowledgements].slice(0, 200), commands: state.network.commands.map(c => c.commandId === ack.commandId ? { ...c, status: ack.success ? "acknowledged" : "failed" } : c) } };
    }
    const session = event.data;
    const owners = Object.fromEntries(Object.entries(state.owners).map(([id, owner]) => [id, owner.bookings.some(b => b.id === session.bookingId) && !owner.sessions.some(s => s.id === session.id && (s.status === "completed" || Date.parse(s.updatedAt) >= Date.parse(session.updatedAt))) ? {
      ...owner, sessions: [session, ...owner.sessions.filter(s => s.id !== session.id)],
    } : owner]));
    return { owners };
  });
}

export function PlatformRuntime() {
  const hydrated = useDemoStore(s => s.hydrated);
  const activeId = useDemoStore(s => s.activeId);
  const [retry, setRetry] = useState(0);
  useEffect(() => { const again = () => setRetry(n => n + 1); window.addEventListener("heliobay:reconnect", again); return () => window.removeEventListener("heliobay:reconnect", again); }, []);
  useEffect(() => {
    if (!hydrated) return;
    if (isDemo) {
      let disposed = false;
      let busy = false;
      const sync = (event: StorageEvent) => { if (event.key === "heliobay-demo-v1" && event.newValue) void useDemoStore.persist.rehydrate(); };
      window.addEventListener("storage", sync);
      const tick = async () => {
        if (busy || disposed) return;
        busy = true;
        try {
          await demoTransaction(data => {
            if (disposed || Date.now() - Date.parse(data.network.lastTick) < 900) return;
            Object.assign(data, advanceEngine(data, Date.now()));
          });
        } finally { busy = false; }
      };
      const timer = setInterval(() => void tick().catch(() => useDemoStore.setState({ realtimeError: "Demo storage is unavailable. Refresh to recover." })), 1000);
      return () => { disposed = true; clearInterval(timer); window.removeEventListener("storage", sync); };
    }
    const controller = new AbortController();
    void platform.refresh(controller.signal).catch(() => {});
    const client = createWebSocketClient(wsUrl, async () => firebaseConfigured ? await firebaseAuth().currentUser?.getIdToken() ?? null : null);
    const disconnect = client.connect(applyEvent, (realtimeStatus, realtimeError = "") => useDemoStore.setState({ realtimeStatus, realtimeError }));
    // Marks unknown delivery honestly; never changes device output after a timeout.
    const timer = setInterval(() => {
      const commands = useDemoStore.getState().network.commands;
      if (commands.some(c => c.status === "pending" && Date.parse(c.expiresAt) < Date.now())) useDemoStore.setState(s => ({ network: { ...s.network, commands: s.network.commands.map(c => c.status === "pending" && Date.parse(c.expiresAt) < Date.now() ? { ...c, status: "timed-out" } : c) } }));
    }, 1000);
    return () => { controller.abort(); disconnect(); clearInterval(timer); };
  }, [hydrated, activeId, retry]);
  return null;
}

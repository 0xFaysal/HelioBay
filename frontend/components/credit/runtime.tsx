"use client";
import { useEffect, useState } from "react";
import { isDemo, wsUrl } from "@/lib/config";
import { useCreditStore, transaction } from "@/store/credit-store";
import { creditService } from "@/lib/credit/services";
import { advance } from "@/lib/credit/engine";
import { snapshotSchema } from "@/lib/credit/model";
import { firebaseAuth, firebaseConfigured } from "@/lib/firebase/client";

export function PlatformRuntime() {
  const ready = useCreditStore(s => s.ready); const identity = useCreditStore(s => s.account?.id); const [retry, setRetry] = useState(0);
  useEffect(() => { const handler = () => setRetry(x => x + 1); window.addEventListener("heliobay:reconnect", handler); return () => window.removeEventListener("heliobay:reconnect", handler); }, []);
  useEffect(() => {
    if (!ready) return;
    let disposed = false; let busy = false; let socket: WebSocket | undefined; let reconnect: ReturnType<typeof setTimeout> | undefined; let retries = 0;
    const abort = new AbortController();
    if (isDemo) {
      const sync = (e: StorageEvent) => { if (e.key === "heliobay-credit-v3") void useCreditStore.persist.rehydrate(); };
      window.addEventListener("storage", sync);
      const timer = setInterval(async () => {
        if (busy) return; busy = true;
        try { await transaction(data => { if (!disposed && Date.now() - Date.parse(data.lastTick) >= 900) Object.assign(data, advance(data, Date.now())); }); }
        catch { useCreditStore.setState({ error: "Demo storage is unavailable. Refresh to recover." }); }
        finally { busy = false; }
      }, 1000);
      return () => { disposed = true; clearInterval(timer); window.removeEventListener("storage", sync); };
    }
    void creditService.refresh(abort.signal).catch(() => {});
    async function connect() {
      if (disposed) return;
      if (!wsUrl) { useCreditStore.setState({ connection: "Realtime not configured" }); return; }
      try {
        const url = new URL(wsUrl); if (!["ws:", "wss:"].includes(url.protocol) || url.username || url.password || url.search) throw new Error("Invalid backend WebSocket URL");
        const token = firebaseConfigured ? await firebaseAuth().currentUser?.getIdToken() : null;
        if (disposed) return;
        socket = new WebSocket(wsUrl);
        socket.onopen = () => { socket?.send(JSON.stringify({ type: "authenticate", token })); useCreditStore.setState({ connection: "Backend connected · awaiting validated data" }); retries = 0; };
        socket.onmessage = e => {
          if (disposed || useCreditStore.getState().account?.id !== identity) return;
          try {
            const envelope = JSON.parse(String(e.data)); if (envelope.type !== "snapshot") throw new Error("Unsupported event");
            const data = snapshotSchema.parse(envelope.data);
            if (data.sessions.some(s => s.points.some(p => p.simulated))) throw new Error("Simulated telemetry rejected in API mode");
            if (data.revision >= useCreditStore.getState().data.revision) useCreditStore.setState({ data, connection: "LIVE · backend verified", error: "" });
          } catch { useCreditStore.setState({ connection: "Invalid realtime payload rejected" }); }
        };
        socket.onerror = () => useCreditStore.setState({ connection: "Realtime error · data may be stale" });
        socket.onclose = event => { if (disposed) return; useCreditStore.setState({ connection: "Disconnected · last known data" }); if (event.code === 4401) { window.dispatchEvent(new Event("heliobay:unauthorized")); return; } if (retries < 5) reconnect = setTimeout(connect, 1000 * 2 ** retries++); };
      } catch { useCreditStore.setState({ connection: "Realtime unavailable · retry connection" }); }
    }
    void connect();
    return () => { disposed = true; abort.abort(); clearTimeout(reconnect); if (socket) { socket.onclose = null; socket.close(); } };
  }, [ready, identity, retry]);
  return null;
}

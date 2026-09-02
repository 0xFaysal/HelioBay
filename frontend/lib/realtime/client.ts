import type { RealtimeClient } from "@/lib/platform/contracts";
import { realtimeSchema } from "@/lib/platform/schemas";

export function createWebSocketClient(url: string, getToken: () => Promise<string | null>): RealtimeClient {
  return {
    connect(onEvent, onStatus) {
      let socket: WebSocket | undefined;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let disposed = false;
      let retries = 0;
      async function open() {
        if (disposed) return;
        if (!url) { onStatus("disconnected", "Realtime URL is not configured. REST data may still be available."); return; }
        let parsed: URL;
        try { parsed = new URL(url); } catch { onStatus("error", "Invalid WebSocket URL."); return; }
        if (!["ws:", "wss:"].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search) { onStatus("error", "Use a WS(S) backend URL without credentials or query tokens."); return; }
        onStatus("connecting");
        try {
          const token = await getToken();
          if (disposed) return;
          socket = new WebSocket(url);
          socket.onopen = () => {
            socket?.send(JSON.stringify({ type: "authenticate", token }));
            onStatus("connected"); retries = 0;
          };
          socket.onmessage = event => {
            try {
              const result = realtimeSchema.safeParse(JSON.parse(String(event.data)));
              if (!result.success) { onStatus("error", "Invalid realtime payload rejected. Displaying the last validated data."); return; }
              onEvent(result.data);
            } catch { onStatus("error", "Malformed realtime message rejected."); }
          };
          socket.onerror = () => onStatus("error", "Realtime connection failed. No simulated values have been substituted.");
          socket.onclose = event => {
            if (disposed) return;
            onStatus("disconnected", event.code === 4401 ? "Realtime authorization expired. Sign in again." : "Realtime disconnected. Reconnecting with backoff…");
            if (event.code === 4401) { window.dispatchEvent(new Event("heliobay:unauthorized")); return; }
            if (retries < 5) timer = setTimeout(open, Math.min(30000, 1000 * 2 ** retries++));
          };
        } catch { onStatus("error", "Unable to initialize realtime. Retry the connection."); }
      }
      void open();
      return () => { disposed = true; clearTimeout(timer); if (socket) { socket.onclose = null; socket.close(); } };
    },
  };
}

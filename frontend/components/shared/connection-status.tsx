"use client";
import { RefreshCw, Radio, WifiOff } from "lucide-react";
import { useDemoStore } from "@/store/demo-store";
import { isDemo } from "@/lib/config";
import { Button } from "@/components/ui/button";

export function ConnectionStatus() {
  const state = useDemoStore(s => s.realtimeStatus);
  const error = useDemoStore(s => s.apiError || s.realtimeError);
  const loading = useDemoStore(s => s.apiLoading);
  const speed = useDemoStore(s => s.network.demoSpeed);
  return <div className={`connection-strip ${error ? "connection-error" : ""}`} role={error ? "alert" : "status"}>
    {error ? <WifiOff size={15} /> : <Radio size={15} />}
    <span>{isDemo ? `Simulation · ${speed}× demo time · shared on this browser` : `API mode · Realtime ${state}`}{error ? ` — ${error}` : ""}</span>
    {!isDemo && <Button size="sm" variant="outline" disabled={loading} onClick={() => window.dispatchEvent(new Event("heliobay:reconnect"))}><RefreshCw size={13} />{loading ? "Connecting…" : "Retry connection"}</Button>}
  </div>;
}

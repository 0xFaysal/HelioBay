"use client";
import { useDemoStore } from "@/store/demo-store";
import { Status } from "@/components/admin/shared";
import { dateTime } from "@/lib/services/booking-rules";

export function CommandStatusPanel({ deviceId }: { deviceId: string }) {
  const command = useDemoStore(s => s.network.commands.find(c => c.deviceId === deviceId));
  const ack = useDemoStore(s => s.network.acknowledgements.find(a => a.commandId === command?.commandId));
  return <div className="command-panel" aria-live="polite"><div className="flex justify-between gap-3 items-center"><h3 className="text-sm font-medium">Command acknowledgement</h3><Status good={command?.status === "acknowledged"} danger={command?.status === "failed" || command?.status === "timed-out"}>{command?.status ?? "No command"}</Status></div>{command ? <><p className="font-mono text-xs mt-3">{command.command} · {command.commandId}</p><p className="text-xs muted mt-2">{command.status === "pending" ? "Sent to backend transport. Waiting for simulated ESP32 response in Demo Mode." : command.status === "timed-out" ? "No acknowledgement received. Delivery is unknown; inspect telemetry before retrying." : ack?.message ?? "Command superseded by a safety action."}</p><p className="text-[10px] muted mt-2">Issued {dateTime(command.issuedAt)}</p></> : <p className="text-xs muted mt-3">Start, stop or test the device to see the command lifecycle.</p>}</div>;
}

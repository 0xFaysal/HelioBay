import type { PlatformSnapshot } from "@/types";
import { allPayments, allSessions } from "./selectors";
export function dhakaDay(iso: string) { return new Date(Date.parse(iso) + 6 * 3600000).toISOString().slice(0, 10); }
export function analytics(data: PlatformSnapshot, from: string, to: string) {
  const points = [];
  const sessions = allSessions(data); const payments = allPayments(data);
  for (let time = Date.parse(`${from}T00:00:00Z`), end = Date.parse(`${to}T00:00:00Z`); time <= end && points.length < 93; time += 86400000) {
    const date = new Date(time).toISOString().slice(0, 10);
    const list = sessions.filter(s => dhakaDay(s.createdAt) === date);
    const energy = list.reduce((n, s) => n + s.energy, 0);
    const solar = list.reduce((n, s) => n + s.energy * s.solar / 100, 0);
    const exported = data.network.energyHistory.reduce((sum, p, i, history) => dhakaDay(p.timestamp) === date ? sum + Math.max(0, p.exportWh - (history[i - 1]?.exportWh ?? p.exportWh)) / 1000 : sum, 0);
    const meterDelta = (key: "solarWh" | "gridWh" | "exportWh") => data.network.energyHistory.reduce((sum, p, i, history) => dhakaDay(p.timestamp) === date ? sum + Math.max(0, p[key] - (history[i - 1]?.[key] ?? p[key])) : sum, 0);
    points.push({ date, solar, demand: energy, grid: Math.max(0, energy - solar), exported, generationWh: meterDelta("solarWh"), gridBackupWh: meterDelta("gridWh"), exportWh: meterDelta("exportWh"),
      revenue: payments.filter(p => dhakaDay(p.createdAt) === date).reduce((n, p) => n + (p.kind === "refund" ? -p.amount : p.amount), 0),
      sessions: list.length, duration: list.length ? list.reduce((n, s) => n + s.elapsed / 60, 0) / list.length : 0,
    });
  }
  return points;
}

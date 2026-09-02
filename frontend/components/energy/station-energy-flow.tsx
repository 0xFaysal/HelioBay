"use client";
import { useId } from "react";
import { Sun, BatteryMedium, CarFront, UtilityPole, Network } from "lucide-react";
import { motion } from "motion/react";
import type { StationTelemetry } from "@/lib/energy/model";
import { flowDescription } from "@/lib/energy/dispatch";

export function StationEnergyFlow({ telemetry: t, fresh }: { telemetry: StationTelemetry; fresh: boolean }) {
  const id = useId().replaceAll(":", "");
  const battery = t.battery.powerKw, grid = t.grid.importPowerKw - t.grid.exportPowerKw;
  const edges = [
    { key: "solar", path: "M130 170 H240", power: t.solar.powerKw, reverse: false, x: 184, y: 153, label: "Solar to manager" },
    { key: "battery", path: "M320 133 V80", power: Math.abs(battery), reverse: battery < 0, x: 375, y: 112, label: battery < 0 ? "Battery to manager" : "Manager to battery" },
    { key: "ev", path: "M400 170 H510", power: t.evLoad.powerKw, reverse: false, x: 453, y: 153, label: "Manager to EV bays" },
    { key: "grid", path: "M320 263 V207", power: Math.abs(grid), reverse: grid < 0, x: 375, y: 242, label: grid < 0 ? "Manager to national grid" : "National grid to manager" },
  ];
  return <motion.figure className={`station-energy-flow ${fresh ? "" : "is-stale"}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} aria-label="Station energy flow">
    <div className="flow-canvas">
      <svg viewBox="0 0 640 345" className="flow-paths" role="img" aria-label={fresh ? flowDescription(t) : "Energy flow unavailable: controller offline or telemetry stale"}>
        <defs><marker id={`${id}-arrow`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 Z" fill="currentColor" /></marker></defs>
        {edges.map(edge => <g key={edge.key} className={`flow-edge ${fresh && edge.power > .000001 ? "active" : ""} ${edge.reverse ? "reverse" : ""}`}>
          <title>{edge.label}: {fresh ? `${edge.power.toFixed(2)} kW` : "unavailable"}</title>
          <path d={edge.path} fill="none" markerEnd={edge.reverse ? undefined : `url(#${id}-arrow)`} markerStart={edge.reverse ? `url(#${id}-arrow)` : undefined} />
          <text x={edge.x} y={edge.y} textAnchor="middle">{fresh ? `${edge.power.toFixed(1)} kW` : "—"}</text>
        </g>)}
      </svg>
      <div className="flow-node node-solar"><Sun aria-hidden="true" /><strong>Solar Panels</strong><small>Renewable supply</small></div>
      <div className="flow-node node-manager"><Network aria-hidden="true" /><strong>Smart Energy Manager</strong><small>{fresh ? "Automatic dispatch" : "Connection unavailable"}</small></div>
      <div className="flow-node node-battery"><BatteryMedium aria-hidden="true" /><strong>Station Battery</strong><small>{t.battery.socPct.toFixed(0)}% · {fresh ? t.battery.state : "last known"}</small></div>
      <div className="flow-node node-ev"><CarFront aria-hidden="true" /><strong>EV Charging Bays</strong><small>{t.evLoad.activeSessions} active sessions</small></div>
      <div className="flow-node node-grid"><UtilityPole aria-hidden="true" /><strong>National Grid</strong><small>{fresh ? grid > 0 ? "Importing" : grid < 0 ? "Exporting" : "Standby" : "Last known state"}</small></div>
    </div>
    <figcaption><span className="flow-indicator" aria-hidden="true" />{fresh ? flowDescription(t) : "Controller offline or telemetry stale. Active paths are paused."}</figcaption>
    <div className="flow-path-summary">{edges.map(edge => <span key={edge.key}>{edge.label} <strong>{fresh ? `${edge.power.toFixed(2)} kW` : "Unavailable"}</strong></span>)}</div>
    <p className="text-xs muted mt-4">Station auxiliary load: {t.auxiliaryKw.toFixed(2)} kW. Curtailed surplus: {t.curtailedKw.toFixed(2)} kW. Battery + charging / − discharging.</p>
  </motion.figure>;
}

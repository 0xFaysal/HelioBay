"use client";
import { useReducedMotion } from "motion/react";
import { ResponsiveContainer, CartesianGrid, XAxis, YAxis, Tooltip, Legend, LineChart, Line } from "recharts";
export interface ChartSeries { key: string; label: string; color: string; dashed?: boolean }
export default function EnergyChart({ rows, series, unit, label }: { rows: Record<string, string | number>[]; series: ChartSeries[]; unit: string; label: string }) {
  const reduced = useReducedMotion();
  return <div className="energy-chart" role="group" aria-label={label}>
    <ResponsiveContainer width="100%" height="100%" minWidth={1}>
      <LineChart data={rows} margin={{ top: 12, right: 12, bottom: 5, left: 0 }} accessibilityLayer>
        <CartesianGrid strokeDasharray="3 4" vertical={false} stroke="#e6ece8" />
        <XAxis dataKey="label" tick={{ fontSize: 10 }} minTickGap={30} axisLine={false} tickLine={false} />
        <YAxis width={52} tick={{ fontSize: 10 }} unit={unit} axisLine={false} tickLine={false} />
        <Tooltip formatter={(value, name) => [`${Number(value).toFixed(2)} ${unit}`, name]} contentStyle={{ borderRadius: 10, fontSize: 12 }} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {series.map(s => <Line key={s.key} dataKey={s.key} name={s.label} stroke={s.color} strokeDasharray={s.dashed ? "5 4" : undefined} strokeWidth={2} dot={rows.length === 1} isAnimationActive={!reduced && rows.length < 20} />)}
      </LineChart>
    </ResponsiveContainer>
  </div>;
}

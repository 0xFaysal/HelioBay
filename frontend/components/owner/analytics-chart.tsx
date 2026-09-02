"use client";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export default function AnalyticsChart(
  {
    data,
    label = "Energy (kWh)"
  }: {
    data: {
      label: string;
      value: number;
    }[];
    label?: string;
  }
) {
  return (
    <div
      className="h-[220px] w-full min-w-0"
      role="img"
      aria-label={`${label}: ${data.map(d => `${d.label} ${d.value}`).join(", ")}`}><ResponsiveContainer width="100%" height="100%" minWidth={0}><AreaChart
          data={data}
          margin={{
            top: 15,
            right: 12,
            bottom: 0,
            left: -25
          }}>
          <defs><linearGradient id="energyFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#00cb68" stopOpacity={.17} />
              <stop offset="100%" stopColor="#00cb68" stopOpacity={0} />
            </linearGradient></defs>
          <CartesianGrid stroke="#edf0ed" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{
              fontSize: 10,
              fill: "#65716b"
            }}
            axisLine={false}
            tickLine={false} />
          <YAxis
            tick={{
              fontSize: 10,
              fill: "#65716b"
            }}
            axisLine={false}
            tickLine={false} />
          <Tooltip
            contentStyle={{
              borderRadius: 10,
              border: "1px solid #dce6e0",
              fontSize: 12
            }}
            formatter={v => [v, label]} />
          <Area
            type="monotone"
            dataKey="value"
            stroke="#00b65a"
            strokeWidth={2.5}
            fill="url(#energyFill)"
            isAnimationActive={false} />
        </AreaChart></ResponsiveContainer></div>
  );
}

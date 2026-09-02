"use client";
import { useState } from "react";
import { money } from "@/lib/services/booking-rules";

export function PricingCalculator() {
  const [energy, setEnergy] = useState(20);
  const [rate, setRate] = useState(18);

  return (
    <div className="panel">
      <h2 className="text-xl">A clearer idea of your next charge.</h2>
      <p className="text-xs muted mt-2 mb-6">Adjust the energy you need to explore a sample estimate.</p>
      <label className="form-field">Energy to add: {energy}kWh<input
          type="range"
          min={5}
          max={80}
          step={1}
          value={energy}
          onChange={e => setEnergy(Number(e.target.value))}
          className="accent-[#009c50]" /></label>
      <label className="form-field">Sample charging rate<select className="select-input" value={rate} onChange={e => setRate(Number(e.target.value))}>
          <option value={15}>AC charging · ৳15/kWh</option>
          <option value={18}>DC charging · ৳18/kWh</option>
          <option value={20}>Rapid charging · ৳20/kWh</option>
        </select></label>
      <div className="data-row">
        <span>Energy</span>
        <span>{money(energy * rate)}</span>
      </div>
      <div className="data-row">
        <span>Booking fee</span>
        <span>৳20</span>
      </div>
      <div className="data-row">
        <span>Estimated total</span>
        <strong className="text-2xl">{money(energy * rate + 20)}</strong>
      </div>
      <p className="text-[10px] muted mt-3">Illustrative pricing in BDT. Actual delivered energy determines the simulated final bill.</p>
    </div>
  );
}

"use client";
import { useState } from "react";
import { credits, energyCost, affordableEnergy } from "@/lib/credit/money";
export function PricingCalculator(){
  const [energy,setEnergy]=useState(20); const [rate,setRate]=useState(1800);
  return <section className="panel"><h2 className="text-xl">A clearer idea of your next charge.</h2><p className="text-xs muted mt-2 mb-6">Illustrative tariffs, not a quote. Check your station for its current price.</p><label className="form-field">Energy to add: {energy} kWh<input type="range" min={1} max={80} step={1} value={energy} onChange={e=>setEnergy(Number(e.target.value))} className="accent-[#009c50]"/></label><label className="form-field">Sample charging tariff<select className="select-input" value={rate} onChange={e=>setRate(Number(e.target.value))}>{[1500,1800,2000].map(r=><option value={r} key={r}>{credits(r)} / kWh</option>)}</select></label><div className="data-row"><span>Estimated energy cost</span><strong>{credits(energyCost(energy*1000000,rate))}</strong></div><div className="data-row"><span>100.00 Credits can deliver up to</span><span>{(affordableEnergy(10000,rate)/1000000).toFixed(2)} kWh</span></div><p className="text-[10px] muted mt-3">Money uses integer minor units. The estimate excludes charging losses and battery limits; final cost follows delivered energy.</p></section>;
}

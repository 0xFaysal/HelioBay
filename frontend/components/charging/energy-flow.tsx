import "@/app/energy.css";
import { Sun, BatteryMedium, UtilityPole } from "lucide-react";

// Public explanation, deliberately not a linear dispatch diagram.
export function EnergyFlow() {
  return <div className="public-energy-benefits">{[
    [Sun, "Solar first", "Fresh solar energy supplies charging demand as it is generated."],
    [BatteryMedium, "Storage that supports", "Surplus solar charges storage. Stored energy supports charging when sunshine is limited."],
    [UtilityPole, "A two-way connection", "The grid supplies any remaining demand and receives surplus after storage is charged."],
  ].map(([Icon, label, detail]) => { const Symbol = Icon as typeof Sun; return <div key={String(label)}><Symbol size={23} aria-hidden="true" /><h3>{String(label)}</h3><p>{String(detail)}</p></div>; })}</div>;
}

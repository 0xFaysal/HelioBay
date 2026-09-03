import type { Payment, Session, Snapshot } from "./model.ts";
import { bdt, credits } from "./money.ts";

export const stopReasonText: Record<string, string> = {
  BATTERY_FULL: "Battery target reached", CREDIT_EXHAUSTED: "Session credit limit reached", PLUG_DISCONNECTED: "Plug disconnected",
  USER_STOPPED: "Stopped by owner", ADMIN_STOPPED: "Stopped by administrator", EMERGENCY_STOP: "Emergency stop — inspection required",
  DEVICE_OFFLINE: "Station connection lost", FAULT: "Stopped for safety inspection",
};
export const receiptTime = (iso: string) => new Date(iso).toLocaleString("en-GB", { timeZone: "Asia/Dhaka", year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
export interface ReceiptData {
  reference: string; title: string; userName: string; amount: string; equivalent: string; status: string; sandbox: boolean;
  groups: { title: string; fields: [string, string][] }[]; note: string; stationHref?: string;
}
export function chargingReceipt(data: Snapshot, s: Session): ReceiptData {
  const station = data.stations.find(p => p.id === s.stationId), bay = data.bays.find(b => b.id === s.bayId), vehicle = data.vehicles.find(v => v.id === s.vehicleId);
  return {
    reference: s.id, title: "Charging receipt", userName: data.users.find(u => u.id === s.ownerId)?.name ?? s.ownerId,
    amount: credits(s.costMinor), equivalent: bdt(s.costMinor), status: s.state === "completed" ? "Settled from prepaid credits" : "In progress — not settled", sandbox: s.dataSource === "SIMULATOR" || s.dataSource === "DIGITAL_TWIN",
    groups: [
      { title: "Charging location", fields: [["Station", station?.name ?? s.stationId], ["Address", station?.address ?? "Not recorded"], ["Bay", bay ? `Bay ${String(bay.number).padStart(2, "0")}` : s.bayId], ["Vehicle", vehicle ? `${vehicle.name} · ${vehicle.plate}` : s.vehicleId], ["Connector", bay?.connector ?? vehicle?.connector ?? "Not recorded"]] },
      { title: "Session details", fields: [["Started (Dhaka)", s.startedAt ? receiptTime(s.startedAt) : s.energyMWh === 0 ? "Charging did not start" : `Not recorded · requested ${receiptTime(s.createdAt)}`], ["Ended (Dhaka)", s.completedAt ? receiptTime(s.completedAt) : "Still charging"], ["Duration", `${(s.elapsedMs / 60000).toFixed(2)} minutes`], ["Energy delivered", `${(s.energyMWh / 1000000).toFixed(4)} kWh`], ["Rate", `${credits(s.tariffMinor)} / kWh`], ["Session result", stopReasonText[s.stopReason ?? ""] ?? "In progress"]] },
      { title: "Credit settlement", fields: [[s.backendStatus ? "Initial credit authorization" : "Opening balance", credits(s.startingBalanceMinor)], ["Credits used", credits(s.costMinor)], ["Equivalent BDT", bdt(s.costMinor)], ["Closing balance", s.endingBalanceMinor == null ? "Available after settlement" : credits(s.endingBalanceMinor)], ["Unused credit hold released", s.state === "completed" ? credits(Math.max(0, s.reservedMinor - s.costMinor)) : "Held until completion"], ["Payment status", s.state === "completed" ? "Posted to wallet ledger" : "Not yet posted"]] },
    ],
    note: `${s.dataSource === "SIMULATOR" ? "Simulator charging: no physical energy delivery is certified. " : ""}1 BDT = 1 HelioBay Credit. Opening balance is recorded at session request; closing balance is recorded at settlement and includes any intervening wallet activity. This receipt is not a tax invoice.`,
    stationHref: station ? `/stations/${station.id}` : undefined,
  };
}
export function topupReceipt(data: Snapshot, p: Payment): ReceiptData {
  const ledger = data.ledger.find(l => l.reference === p.id && l.kind === "top-up");
  const posted = p.status === "verified" && Boolean(ledger);
  return {
    reference: p.id, title: posted ? "Credit top-up receipt" : "Credit top-up record", userName: data.users.find(u => u.id === p.userId)?.name ?? p.userId,
    amount: credits(posted ? p.amountMinor : 0), equivalent: bdt(posted ? p.amountMinor : 0), status: posted ? "Verified · credits posted" : `${p.status} · no credit receipt issued`, sandbox: p.sandbox,
    groups: [
      { title: "Payment details", fields: [["Provider", "SSLCOMMERZ"], ["Environment", p.sandbox ? "Sandbox" : "Production"], ["SSLCOMMERZ transaction reference", p.providerReference ?? `${p.id} (merchant reference)`], ["Requested (Dhaka)", receiptTime(p.createdAt)], ["Verified (Dhaka)", p.verifiedAt ? receiptTime(p.verifiedAt) : "Not verified"], ["Payment status", p.status], ["Payment amount", bdt(p.amountMinor)]] },
      { title: "Credit purchase", fields: [["Conversion rate", "1 BDT = 1 Credit"], ["Credits added", credits(posted ? p.amountMinor : 0)], ["Equivalent BDT", bdt(posted ? p.amountMinor : 0)], ["Opening balance", ledger ? credits(ledger.balanceAfterMinor - ledger.amountMinor) : "Not posted"], ["Closing balance", ledger ? credits(ledger.balanceAfterMinor) : "No balance change"], ["Ledger reference", ledger?.id ?? "No entry"]] },
      { title: "Charging allocation", fields: [["Station / bay / vehicle", "Not applicable — network wallet top-up"], ["Charging time / energy / duration", "Not applicable — credits have not been allocated to a session"]] },
    ],
    note: p.sandbox ? "Sandbox payment. This is not a real financial transaction or a tax invoice. A merchant reference is shown if a provider reference has not been supplied." : "Keep this reference for payment enquiries. This receipt is not a tax invoice.",
  };
}

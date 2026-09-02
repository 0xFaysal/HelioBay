"use client";
import "@/app/receipts.css";
import { useState } from "react";
import Link from "next/link";
import { Printer, CheckCircle2 } from "lucide-react";
import { Brand } from "@/components/shared/brand";
import { Button } from "@/components/ui/button";
import { useCreditData } from "@/store/credit-store";
import { chargingReceipt, topupReceipt, receiptTime, type ReceiptData } from "@/lib/credit/receipts";
import { isDemo } from "@/lib/config";

export function Receipt({ data }: { data: ReceiptData }) {
  const [generatedAt] = useState(() => new Date().toISOString()); const [compact, setCompact] = useState(false);
  return <div className="receipt-preview">
    <div className="receipt-toolbar no-print"><label>Print layout<select className="credit-filter" value={compact ? "compact" : "a4"} onChange={e => setCompact(e.target.value === "compact")}><option value="a4">A4 document</option><option value="compact">Compact receipt</option></select></label><Button variant="outline" onClick={() => window.print()}><Printer size={16} />Print receipt</Button></div>
    <article className={`printable-receipt ${compact ? "receipt-compact" : ""}`} aria-label={data.title}>
      <header className="receipt-brand-row"><Brand /><span>{data.sandbox ? "Sandbox" : "Charging network"}</span></header>
      <div className="receipt-title"><p>YOUR ENERGY, ACCOUNTED FOR</p><h2>{data.title}</h2><div className="receipt-reference">{data.reference}</div></div>
      <div className="receipt-customer"><div><small>ISSUED TO</small><strong>{data.userName}</strong></div><div><small>STATUS</small><span><CheckCircle2 size={14} aria-hidden="true" />{data.status}</span></div></div>
      <div className="receipt-total"><span>{data.title.startsWith("Charging") ? "Credits used" : "Credits added"}</span><strong>{data.amount}</strong><small>Equivalent {data.equivalent}</small></div>
      {data.groups.map(group => <section className="receipt-section" key={group.title}><h3>{group.title}</h3><dl>{group.fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></section>)}
      <footer className="receipt-footer"><p>{data.note}</p>{isDemo && !data.sandbox && <p>Simulated charging record. No physical energy delivery or real payment is certified.</p>}<p>Generated {receiptTime(generatedAt)} · Asia/Dhaka</p><div><strong>Need help with this receipt?</strong><p>Contact the station operator and quote the reference above.{data.stationHref && <> <Link href={data.stationHref}>View station details.</Link></>}</p></div><span>Thank you for charging with HelioBay.</span></footer>
    </article>
  </div>;
}
export function ChargingReceipt({ sessionId }: { sessionId: string }) {
  const data = useCreditData(); const s = data.sessions.find(s => s.id === sessionId);
  return s ? <Receipt key={s.id} data={chargingReceipt(data, s)} /> : <p className="notice">Charging receipt unavailable.</p>;
}
export function TopupReceipt({ paymentId }: { paymentId: string }) {
  const data = useCreditData(); const p = data.payments.find(p => p.id === paymentId);
  return p ? <Receipt key={p.id} data={topupReceipt(data, p)} /> : <p className="notice">Payment record unavailable. Refresh payment status to retrieve the verified record.</p>;
}

import Link from "next/link";
import { MapPin, Wallet, PlugZap, ArrowUpRight } from "lucide-react";
import { PublicShell, FinalCTA } from "@/components/shared/public-shell";
import { AssetImage } from "@/components/shared/asset-image";
import { Reveal } from "@/components/shared/reveal";
import { FAQ } from "@/components/shared/faq";

export const metadata = {
  title: "How HelioBay works"
};

export default function Page() {
  return (
    <PublicShell>
      <div className="container-wide">
        <div className="page-intro max-w-[650px]">
          <div className="eyebrow">DESIGNED AROUND YOUR DAY</div>
          <h1>A smarter charge.<br />An easier everyday.</h1>
          <p>No guesswork. No unnecessary waiting. Just the right energy, in the right place, at the right time.</p>
        </div>
        <div className="relative h-[380px] rounded-2xl overflow-hidden mb-16"><AssetImage
            src="/images/station.webp"
            alt="Solar charging canopy in a green urban neighborhood"
            fill
            priority
            sizes="100vw" /></div>
        <div className="grid-three pb-20">{[{
            icon: MapPin,
            n: "01",
            title: "Find your kind of station.",
            text: "Explore nearby stations on a map or in a list. Sort by distance, price, available bays or renewable contribution to find a spot that fits."
          }, {
            icon: Wallet,
            n: "02",
            title: "Add Credits. Arrive. Connect.",
            text: "Top up your wallet from 10 Credits. Travel to an available station, connect the charging plug, then select your vehicle, station and bay."
          }, {
            icon: PlugZap,
            n: "03",
            title: "Plug in. Breathe out.",
            text: "Press Start Charging after plug detection. The charger must acknowledge before energy flows. Follow credit usage live; charging stops at full battery, your credit limit, or when you stop."
          }].map(s => <Reveal className="step-card" key={s.n}>
            <div className="flex justify-between">
              <s.icon size={25} />
              <span className="step-number">{s.n}</span>
            </div>
            <h3>{s.title}</h3>
            <p>{s.text}</p>
          </Reveal>)}</div>
        <section id="faq" className="grid-two pb-20 scroll-mt-28">
          <div>
            <div className="eyebrow">A LITTLE CLARITY</div>
            <h2 className="editorial-heading">Good questions.<br />Straight answers.</h2>
            <p className="text-sm muted mt-5 max-w-sm">Get to know your new charging companion before your first stop.</p>
            <Link href="/stations" className="action action-outline mt-6">Explore stations <ArrowUpRight size={14} /></Link>
          </div>
          <FAQ />
        </section>
      </div>
      <FinalCTA />
    </PublicShell>
  );
}

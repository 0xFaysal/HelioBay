import { Sun, BatteryMedium, Leaf } from "lucide-react";
import { PublicShell, FinalCTA } from "@/components/shared/public-shell";
import { AssetImage } from "@/components/shared/asset-image";
import { EnergyFlow } from "@/components/charging/energy-flow";

export const metadata = {
  title: "A brighter energy future"
};

export default function Page() {
  return (
    <PublicShell>
      <div className="container-wide">
        <div className="page-intro">
          <div className="eyebrow">EVERY JOURNEY CAN MAKE A DIFFERENCE</div>
          <h1>A lighter footprint.<br />A brighter way forward.</h1>
          <p>We’re designing a charging network that makes better use of the energy around us.</p>
        </div>
        <div className="grid-two items-center pb-20">
          <div className="relative h-[430px] rounded-2xl overflow-hidden"><AssetImage
              src="/images/station.webp"
              alt="Solar panels above electric vehicle charging bays with tropical greenery"
              fill
              priority
              sizes="(max-width:600px)100vw,50vw" /></div>
          <div className="px-4">
            <h2 className="editorial-heading">Start with the sun.<br />Keep the good going.</h2>
            <p className="text-sm muted mt-5">Solar canopies turn an ordinary parking space into a source of clean energy. Smart storage saves that energy for later, while grid backup supports reliable charging.</p>
            <EnergyFlow />
            <p className="text-[11px] muted">The energy-flow graphic shows the proposed system architecture. It is not live telemetry.</p>
          </div>
        </div>
        <div className="grid-three pb-20">{[{
            icon: Sun,
            title: "Solar comes first.",
            text: "Our sample stations prioritize onsite generation. The demo network averages 83% solar contribution across its five stations."
          }, {
            icon: BatteryMedium,
            title: "Save the sunshine.",
            text: "Station batteries can shift solar production into periods when the sun is lower, helping make better use of each kilowatt-hour."
          }, {
            icon: Leaf,
            title: "Understand your impact.",
            text: "Your dashboard multiplies delivered solar energy by an illustrative factor of 0.4 kg CO₂ per kWh. This is an educational estimate, not a certified carbon calculation."
          }].map(p => <article className="step-card" key={p.title}>
            <p.icon size={28} className="text-green-700" />
            <h3>{p.title}</h3>
            <p>{p.text}</p>
          </article>)}</div>
        <section className="sustain-card mb-20">
          <div className="eyebrow">TRANSPARENCY MATTERS</div>
          <h2 className="text-3xl mt-5">A concept, with a clear direction.</h2>
          <p className="text-sm muted mt-5 max-w-3xl">HelioBay is currently a frontend prototype. Station images are original AI-generated concepts. Locations, energy mixes, session telemetry, and impact figures are sample data. Real environmental reporting will need metered generation, verified grid-emissions factors, and independently reviewed methodology.</p>
        </section>
      </div>
      <FinalCTA />
    </PublicShell>
  );
}

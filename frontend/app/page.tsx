import Link from "next/link";

import {
  ArrowRight,
  ArrowUpRight,
  MapPin,
  Sun,
  Zap,
  CalendarCheck,
  ChartNoAxesCombined,
  CreditCard,
  Leaf,
  ShieldCheck,
  Play,
  BatteryCharging,
  ChevronRight,
} from "lucide-react";

import { PublicShell, FinalCTA } from "@/components/shared/public-shell";
import { AssetImage } from "@/components/shared/asset-image";
import { Reveal } from "@/components/shared/reveal";
import { EnergyFlow } from "@/components/charging/energy-flow";

export default function HomePage() {
  return (
    <PublicShell>
      <section className="hero">
        <AssetImage
          src="/images/hero.webp"
          alt="Silver electric vehicle charging under a solar canopy surrounded by greenery — HelioBay concept"
          fill
          priority
          sizes="100vw"
          className="hero-image" />
        <div className="container-wide hero-inner">
          <Reveal>
            <div className="eyebrow text-[#dceadc]">POWERED BY THE SUN. BUILT AROUND YOU.</div>
            <h1>Clean energy.<br />Ready when<br /><span>you are.</span></h1>
            <p>Solar-powered EV charging that fits your day.<br />Find your bay. Plug in. Move forward.</p>
            <div className="actions">
              <Link href="/stations" className="action action-primary">Find a Station <ArrowUpRight size={16} /></Link>
              <Link href="/how-it-works" className="action action-outline"><Play size={13} />See How It Works</Link>
            </div>
          </Reveal>
          <div className="hero-station">
            <div className="flex justify-between text-[9px] uppercase tracking-widest mb-3">
              <span><span className="status-dot" />Network preview</span>
              <Sun size={14} className="text-[#008d47]" />
            </div>
            <div className="text-[13px] font-semibold">HelioBay Green Point</div>
            <div className="flex justify-between text-[10px] mt-2 text-muted-foreground">
              <span>3 bays available</span>
              <span>92% solar powered</span>
            </div>
            <Link
              href="/stations/green-point"
              className="flex justify-between items-center mt-4 pt-3 border-t text-[10px] font-medium">Your next clean charge <ArrowUpRight size={13} /></Link>
          </div>
          <div className="hero-foot">
            <span className="flex items-center gap-2"><ShieldCheck size={14} />Smart charging. Zero guesswork.</span>
            <span className="flex items-center gap-2"><MapPin size={13} />Starting a cleaner journey in Dhaka</span>
          </div>
        </div>
      </section>
      <div className="container-wide stats-strip">
        <div>
          <div className="eyebrow !text-[9px]">THE NETWORK, AT A GLANCE</div>
          <small>Live demo network</small>
        </div>
        {[
          ["05", "Connected stations"],
          ["19", "Charging bays"],
          ["83%", "Avg. solar energy"],
          ["24/7", "Always connected"]
        ].map(([value, label]) => <div key={label}>
          <strong>{value}</strong>
          <small>{label}</small>
        </div>)}
      </div>


      <section className="section container-wide">
        <Reveal className="section-heading">
          <div>
            <div className="eyebrow">LESS PLANNING. MORE LIVING.</div>
            <h2>Your next charge.<br />Three simple steps.</h2>
          </div>
          <p>From finding the perfect spot to getting back on the road. We make every charge feel effortless.</p>
        </Reveal>
        <div className="grid-three">{[{
            icon: MapPin,
            title: "Discover your spot.",
            text: "Find a nearby solar station. See availability, charging speeds, and clear pricing before you arrive.",
            href: "/stations",
            link: "Explore the network"
          }, {
            icon: CalendarCheck,
            title: "Make it yours.",
            text: "Choose your time, reserve your bay, and leave the waiting behind. Your spot is ready when you are.",
            href: "/stations",
            link: "Book a charging bay"
          }, {
            icon: Zap,
            title: "Recharge. Reconnect.",
            text: "Plug in and take a moment for yourself. Follow your charge in real time, right from your dashboard.",
            href: "/dashboard",
            link: "Meet your dashboard"
          }].map((item, i) => <Reveal className="step-card" delay={i * .08} key={item.title}>
            <div className="flex justify-between items-center">
              <span className="icon-tile"><item.icon size={23} strokeWidth={1.5} /></span>
              <span className="step-number">0{i + 1}</span>
            </div>
            <h3>{item.title}</h3>
            <p>{item.text}</p>
            <Link href={item.href} className="inline-flex gap-2 items-center text-[11px] font-semibold mt-6">
              {item.link}

              <ArrowRight size={13} />
            </Link>
          </Reveal>)}</div>
      </section>


      <section className="section soft-section"><div className="container-wide">
          <Reveal className="section-heading">
            <div>
              <div className="eyebrow">THOUGHTFULLY CONNECTED</div>
              <h2>More than a place to plug in.</h2>
            </div>
            <Link href="/how-it-works" className="text-xs flex gap-2 items-center">The HelioBay difference <ArrowUpRight size={15} /></Link>
          </Reveal>
          <div className="grid-two">
            <Reveal className="feature-photo">
              <AssetImage
                src="/images/station.webp"
                alt="Modern solar charging canopy and green-accent chargers in a landscaped urban setting"
                fill
                sizes="(max-width:600px) 100vw,50vw" />
              <div className="feature-photo-label">
                <Sun size={25} className="text-[#00954b]" />
                <div>
                  <strong className="text-xs">A brighter kind of energy.</strong>
                  <p className="text-[10px] text-muted-foreground">Harvested here. Ready for your journey.</p>
                </div>
              </div>
            </Reveal>
            <Reveal className="feature-list">{[{
                icon: CalendarCheck,
                title: "Your time, respected.",
                text: "Smart reservations and live bay availability mean less waiting and more of your day back."
              }, {
                icon: ChartNoAxesCombined,
                title: "Every watt, understood.",
                text: "See your charging progress, energy mix, and environmental impact in one beautifully simple dashboard."
              }, {
                icon: CreditCard,
                title: "Nothing hidden. Ever.",
                text: "Upfront pricing, automated billing, and easy-to-find receipts. A clear view of every charge."
              }].map(item => <div className="feature-row" key={item.title}>
                <item.icon size={24} className="shrink-0 mt-1" strokeWidth={1.5} />
                <div>
                  <h3>{item.title}</h3>
                  <p>{item.text}</p>
                </div>
              </div>)}</Reveal>
          </div>
        </div></section>


      <section className="section container-wide"><div className="grid-two items-center">
          <Reveal>
            <div className="eyebrow">A CLEANER ENERGY CYCLE</div>
            <h2 className="editorial-heading max-w-[430px]">Good energy.<br />Put to better use.</h2>
            <p className="text-sm text-muted-foreground mt-5 max-w-[450px]">We connect sunlight, smart storage, and your electric vehicle. Solar comes first. Stored energy keeps you moving. The grid has your back.</p>
            <EnergyFlow />
            <Link href="/sustainability" className="text-xs font-semibold inline-flex gap-2 items-center">See how we make a difference <ArrowUpRight size={15} /></Link>
          </Reveal>
          <Reveal className="sustain-card">
            <Leaf size={31} strokeWidth={1.4} className="text-[#8be0a6]" />
            <h3 className="text-[29px] leading-tight mt-6">Small stops.<br />A meaningful difference.</h3>
            <p className="text-sm muted mt-4">A glimpse of what a cleaner network can do.</p>
            <div className="grid grid-cols-2 gap-6">
              <div className="sustain-metric">
                <strong>83<span className="text-[24px]">%</span></strong>
                <small>Average solar contribution</small>
              </div>
              <div className="sustain-metric">
                <strong>0.4<span className="text-[18px]">kg</span></strong>
                <small>Illustrative CO₂ avoided / kWh</small>
              </div>
            </div>
            <p className="text-[9px] muted mt-5">Prototype estimates, not verified environmental claims.</p>
          </Reveal>
        </div></section>


      <section className="section soft-section"><div className="container-wide grid-two items-center">
          <Reveal>
            <div className="eyebrow">YOUR CHARGE. IN YOUR HANDS.</div>
            <h2 className="editorial-heading">Stay connected.<br />Even while you unplug.</h2>
            <p className="text-sm text-muted-foreground max-w-[390px] my-6">A clear view of your energy, wherever the day takes you. Your bookings, live charge, and next adventure — all in one place.</p>
            <Link href="/dashboard" className="action action-dark">Explore your dashboard <ArrowUpRight size={15} /></Link>
            <p className="text-[10px] text-muted-foreground mt-4">Works beautifully on your phone. No app download needed.</p>
          </Reveal>
          <Reveal><div className="phone-preview">
              <div className="phone-notch" />
              <div className="flex justify-between text-[10px]">
                <strong>heliobay</strong>
                <span className="status-dot mt-1" />
              </div>
              <p className="text-[10px] muted mt-6">A little charge. A lot of possibility.</p>
              <h3 className="text-[22px] mt-1">Looking good, Alex.</h3>
              <div className="bg-white rounded-xl p-4 mt-5 border">
                <div className="flex justify-between text-[10px]">
                  <span>Current charge</span>
                  <BatteryCharging size={15} className="text-green-700" />
                </div>
                <div className="text-[46px] tracking-tighter mt-2">64<span className="text-[19px] muted">%</span></div>
                <div className="h-1.5 rounded bg-[#edf2ed] my-3"><div className="w-[64%] h-full rounded bg-primary" /></div>
                <p className="text-[9px] muted">Ready for whatever comes next.</p>
              </div>
              <div className="bg-[#153c29] text-white rounded-xl p-4 mt-3">
                <span className="text-[9px] text-[#9ed3ad]">YOUR NEXT STOP</span>
                <h4 className="text-xs mt-3">HelioBay Green Point</h4>
                <div className="text-[9px] mt-2 text-[#c8d8ce]">Tomorrow · 10:00 AM · Bay 01</div>
                <div className="text-[9px] flex justify-between mt-4 border-t border-white/20 pt-3">Everything is ready <ChevronRight size={12} /></div>
              </div>
              <div className="text-[8px] muted text-center mt-5">Dashboard preview · Sample account</div>
            </div></Reveal>
        </div></section>
      <FinalCTA />
    </PublicShell>
  );
}

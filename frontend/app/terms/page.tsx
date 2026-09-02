import { PublicShell } from "@/components/shared/public-shell";

export const metadata = {
  title: "Prototype terms"
};

export default function Page() {
  return (
    <PublicShell><article className="container-wide max-w-[760px] py-16">
        <div className="eyebrow">A CLEAR UNDERSTANDING</div>
        <h1 className="text-4xl mt-5 mb-8">Prototype terms of use</h1>
        <div className="space-y-7 text-sm muted">
          <p>HelioBay is an interactive demonstration of a solar EV charging experience. It is not an operational charging network or a payment service.</p>
          <section>
            <h2 className="text-xl text-foreground mb-2">Credits and sandbox payments</h2>
            <p>In Demo Mode, stations, telemetry and wallet entries are simulated in your browser. In API Mode, SSLCOMMERZ Sandbox checkout is created and verified by the backend. Sandbox transactions are tests, not real purchases.</p>
          </section>
          <section>
            <h2 className="text-xl text-foreground mb-2">Safe use</h2>
            <p>Never use this interface to determine whether a physical charger is safe, energized, stopped, or ready. Use the real equipment’s instructions and physical emergency stop. Demo access and client-side route guards are not production security controls.</p>
          </section>
          <section>
            <h2 className="text-xl text-foreground mb-2">Demo rules</h2>
            <p>1 BDT equals 1 Credit. Minimum top-up is 10 Credits. Charging holds available credit, debits delivered energy at the fixed session tariff, then releases unused credit. The demo stops before credit can become negative. Adjustments and reversals remain visible in the audited ledger.</p>
          </section>
          <section>
            <h2 className="text-xl text-foreground mb-2">Availability</h2>
            <p>Local data may be lost when browser storage is cleared. There is no guarantee of station availability, charging performance, financial settlement, or environmental benefit. Production launch requires a real backend, reviewed terms, provider agreements, and verified device integration.</p>
          </section>
        </div>
      </article></PublicShell>
  );
}

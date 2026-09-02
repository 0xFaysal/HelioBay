import { PublicShell } from "@/components/shared/public-shell";

export const metadata = {
  title: "Prototype privacy notice"
};

export default function Page() {
  return (
    <PublicShell><article className="container-wide max-w-[760px] py-16">
        <div className="eyebrow">YOUR DATA, EXPLAINED</div>
        <h1 className="text-4xl mt-5 mb-8">Prototype privacy notice</h1>
        <div className="space-y-7 text-sm muted">
          <p>This notice describes the HelioBay demonstration frontend, not a deployed commercial charging service.</p>
          <section>
            <h2 className="text-xl text-foreground mb-2">Browser-local demo data</h2>
            <p>Demo names, vehicle details, reservations, simulated payments, and preferences are stored in this browser. They persist across refreshes but are not synchronized across devices. Use fictional details. Clearing the site’s browser storage removes this data.</p>
          </section>
          <section>
            <h2 className="text-xl text-foreground mb-2">Authentication</h2>
            <p>When Firebase is configured, email/password and Google sign-in are processed by Firebase Authentication. Passwords are not stored in the demo store. A Firebase login does not turn simulated bookings into real reservations.</p>
          </section>
          <section>
            <h2 className="text-xl text-foreground mb-2">Location and external services</h2>
            <p>Location is requested only after you choose “Near me” and is held in memory to calculate distances. The map loads tiles from OpenStreetMap. Directions open Google Maps in a new tab. Those services receive their normal browser requests.</p>
          </section>
          <section>
            <h2 className="text-xl text-foreground mb-2">Before production</h2>
            <p>A deployed service needs its own reviewed privacy policy, data retention controls, account deletion, consent handling, access controls, and contact details. Do not use this prototype to collect sensitive or real financial information.</p>
          </section>
        </div>
      </article></PublicShell>
  );
}

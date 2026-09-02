import { PublicShell } from "@/components/shared/public-shell";
import { Discovery } from "@/components/stations/discovery";
export const metadata = { title: "Find your charging station" };
export default function Page() { return <PublicShell><div className="container-wide"><div className="page-intro"><div className="eyebrow">GOOD ENERGY. CLOSE BY.</div><h1>Find your next charge.</h1><p>Real-time possibilities. A little closer to wherever you’re going.</p></div><Discovery /></div></PublicShell>; }

import { StationDetail } from "@/components/stations/station-detail";
import { stations } from "@/lib/demo/seed";
import { isDemo } from "@/lib/config";
type Props = { params: Promise<{ stationId: string }> };
export async function generateMetadata({ params }: Props) {
  const id = (await params).stationId;
  const s = isDemo ? stations.find(s => s.id === id) : undefined;
  return { title: s?.name ?? "Station details", description: s ? `${s.name} · ${s.address}` : "HelioBay station availability and charging reservations.", openGraph: { title: s?.name ?? "HelioBay station", images: s ? [s.image] : [] }, twitter: { title: s?.name ?? "HelioBay station", images: s ? [s.image] : [] } };
}
export default async function Page({ params }: Props) { return <StationDetail id={(await params).stationId} />; }

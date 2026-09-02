import { StationDetails } from "@/components/credit/stations";
export default async function Page({params}: {params: Promise<{stationId:string}>}) { return <StationDetails id={(await params).stationId} />; }

import { ConnectAndStart } from "@/components/credit/charging";
export default async function Page({searchParams}: {searchParams: Promise<{station?:string;bay?:string}>}) { const p=await searchParams; return <ConnectAndStart stationId={p.station} bayId={p.bay} />; }

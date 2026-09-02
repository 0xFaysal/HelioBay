import { AdminStations } from "@/components/credit/admin-stations";
export default async function Page({params}:{params:Promise<{stationId:string}>}) { const {stationId}=await params; return <AdminStations id={stationId}/>; }

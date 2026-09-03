import { AdminStations } from "@/components/credit/admin-stations";
import { ApiStationDetail } from "@/components/credit/api-admin";
import { isDemo } from "@/lib/config";
export default async function Page({params}:{params:Promise<{stationId:string}>}) { const {stationId}=await params; return isDemo?<AdminStations id={stationId}/>:<ApiStationDetail id={stationId}/>; }

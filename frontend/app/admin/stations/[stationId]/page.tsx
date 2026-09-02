import { AdminStations } from '@/components/admin/stations';
export default async function Page({ params }: { params: Promise<{stationId:string}> }) { return <AdminStations stationId={(await params).stationId} />; }

import { AdminDevices } from '@/components/admin/devices';
export default async function Page({ searchParams }: { searchParams: Promise<{device?:string}> }) { return <AdminDevices initialId={(await searchParams).device} />; }

import { Charging } from "@/components/credit/charging";
export default async function Page({ params }: { params: Promise<{sessionId: string}> }) { return <Charging id={(await params).sessionId} />; }

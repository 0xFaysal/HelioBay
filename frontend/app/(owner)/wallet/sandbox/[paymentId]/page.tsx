import { SandboxPayment } from "@/components/credit/wallet";
export default async function Page({ params }: {params: Promise<{paymentId:string}>}) { return <SandboxPayment id={(await params).paymentId} />; }

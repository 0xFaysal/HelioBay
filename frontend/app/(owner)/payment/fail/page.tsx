import { PaymentResult } from "@/components/credit/wallet";
export default async function Page({searchParams}: {searchParams: Promise<{paymentId?:string}>}) { const {paymentId}=await searchParams; return <PaymentResult key={paymentId} id={paymentId} />; }

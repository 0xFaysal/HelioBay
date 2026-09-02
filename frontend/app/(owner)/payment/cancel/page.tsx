import { PaymentResult } from "@/components/credit/wallet";
export default async function Page({searchParams}: {searchParams: Promise<{paymentId?:string}>}) { return <PaymentResult id={(await searchParams).paymentId} />; }

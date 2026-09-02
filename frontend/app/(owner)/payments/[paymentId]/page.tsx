import { Receipt } from "@/components/owner/payments";

export const metadata = {
  title: "Transaction receipt"
};

export default async function Page(
  {
    params
  }: {
    params: Promise<{
      paymentId: string;
    }>;
  }
) {
  return <Receipt id={(await params).paymentId} />;
}

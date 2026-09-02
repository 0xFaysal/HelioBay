import { LiveCharging } from "@/components/charging/live-charging";

export const metadata = {
  title: "Live charging"
};

export default async function Page(
  {
    params
  }: {
    params: Promise<{
      sessionId: string;
    }>;
  }
) {
  return <LiveCharging id={(await params).sessionId} />;
}

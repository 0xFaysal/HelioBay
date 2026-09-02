import { BookingDetail } from "@/components/owner/bookings";

export const metadata = {
  title: "Booking details"
};

export default async function Page(
  {
    params
  }: {
    params: Promise<{
      bookingId: string;
    }>;
  }
) {
  return <BookingDetail id={(await params).bookingId} />;
}

export type Role = "owner" | "admin";
export interface Account { id: string; name: string; email: string; role: Role; demo: boolean }
export interface Vehicle { id: string; name: string; plate: string; connector: "CCS2" | "Type 2"; capacity: number; battery: number; isDefault: boolean }
export interface Station { id: string; name: string; address: string; landmark: string; lat: number; lng: number; distance: number; price: number; solar: number; power: number; available: number; bays: number; online: boolean; connector: "CCS2" | "Type 2"; battery: number; amenities: string[]; image: string; deviceId: string }
export type BookingStatus = "upcoming" | "charging" | "completed" | "cancelled";
export interface Booking { id: string; stationId: string; vehicleId: string; start: string; duration: number; bayId: string; status: BookingStatus; estimate: number; advance: number; fee: number; discount: number; paymentId: string; createdAt: string }
export type ChargingStatus = "waiting" | "car-detected" | "starting" | "charging" | "paused" | "completed" | "offline" | "fault";
export interface Session { id: string; bookingId: string; stationId: string; vehicleId: string; status: ChargingStatus; battery: number; initialBattery: number; energy: number; elapsed: number; power: number; solar: number; updatedAt: string; createdAt: string; points: { minute: number; power: number }[] }
export interface Payment { id: string; bookingId: string; amount: number; method: string; kind: "payment" | "refund"; status: "succeeded" | "refunded"; createdAt: string; description: string }
export interface OwnerData { profile: { name: string; phone: string; city: string }; vehicles: Vehicle[]; selectedVehicleId: string; bookings: Booking[]; sessions: Session[]; payments: Payment[]; savedStations: string[]; notificationsRead: boolean; preferences: { booking: boolean; charging: boolean; offers: boolean } }
export interface BookingInput { stationId: string; vehicleId: string; start: string; duration: number; method: string; promo: string; requestId: string }

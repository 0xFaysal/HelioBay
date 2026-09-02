import type { Account, OwnerData, Station } from "@/types";

export const demoAccounts: Record<"owner" | "admin", Account> = {
  owner: {
    id: "demo-owner",
    name: "Alex Morgan",
    email: "owner@heliobay.demo",
    role: "owner",
    demo: true
  },

  admin: {
    id: "demo-admin",
    name: "Station Partner",
    email: "admin@heliobay.demo",
    role: "admin",
    demo: true
  }
};

export const stations: Station[] = [{
  id: "green-point",
  name: "HelioBay Green Point",
  address: "Road 11, Banani, Dhaka",
  landmark: "Banani Lake",
  lat: 23.7937,
  lng: 90.4066,
  distance: 1.2,
  price: 18,
  solar: 92,
  power: 60,
  available: 3,
  bays: 4,
  online: true,
  connector: "CCS2",
  battery: 84,
  amenities: ["Wi-Fi", "Coffee", "Restrooms", "24/7 security"],
  image: "/images/station.webp",
  deviceId: "ST001"
}, {
  id: "gulshan-grove",
  name: "HelioBay Gulshan Grove",
  address: "Gulshan Avenue, Dhaka",
  landmark: "Gulshan Lake Park",
  lat: 23.8002,
  lng: 90.4157,
  distance: 2.4,
  price: 20,
  solar: 86,
  power: 120,
  available: 2,
  bays: 6,
  online: true,
  connector: "CCS2",
  battery: 72,
  amenities: ["Wi-Fi", "Coffee", "Shopping"],
  image: "/images/hero.webp",
  deviceId: "ST002"
}, {
  id: "dhanmondi-lake",
  name: "HelioBay Lakeside",
  address: "Road 27, Dhanmondi, Dhaka",
  landmark: "Dhanmondi Lake",
  lat: 23.7509,
  lng: 90.3747,
  distance: 5.6,
  price: 15,
  solar: 78,
  power: 22,
  available: 1,
  bays: 3,
  online: true,
  connector: "Type 2",
  battery: 66,
  amenities: ["Park", "Restrooms", "Coffee"],
  image: "/images/station.webp",
  deviceId: "ST003"
}, {
  id: "uttara-north",
  name: "HelioBay North Park",
  address: "Sector 7, Uttara, Dhaka",
  landmark: "Uttara North Metro",
  lat: 23.8759,
  lng: 90.3795,
  distance: 8.1,
  price: 17,
  solar: 95,
  power: 60,
  available: 0,
  bays: 4,
  online: true,
  connector: "CCS2",
  battery: 90,
  amenities: ["Wi-Fi", "Restrooms", "24/7 security"],
  image: "/images/station.webp",
  deviceId: "ST004"
}, {
  id: "tejgaon-hub",
  name: "HelioBay City Hub",
  address: "Tejgaon Link Road, Dhaka",
  landmark: "Nabisco intersection",
  lat: 23.7721,
  lng: 90.3995,
  distance: 3.8,
  price: 16,
  solar: 64,
  power: 50,
  available: 0,
  bays: 2,
  online: false,
  connector: "CCS2",
  battery: 45,
  amenities: ["Coffee", "Restrooms"],
  image: "/images/hero.webp",
  deviceId: "ST005"
}];

export function createOwnerData(name = "Alex Morgan", seeded = true, now = new Date(), ownerId = "sample"): OwnerData {
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(10, 0, 0, 0);
  const before = new Date(now);
  before.setDate(Math.max(1, before.getDate() - 3));
  before.setHours(14, 0, 0, 0);
  if (before >= now) before.setTime(now.getTime() - 3600000);
  const old = before.toISOString();

  const result: OwnerData = {
    profile: {
      name,
      phone: "+880 1712 345678",
      city: "Dhaka"
    },

    vehicles: [{
      id: "ev-01",
      name: "My electric crossover",
      plate: "DHAKA METRO-GA 42-1829",
      connector: "CCS2",
      capacity: 60,
      battery: 64,
      isDefault: true
    }],

    selectedVehicleId: "ev-01",

    bookings: seeded ? [{
      id: "HB-DEMO01",
      stationId: "green-point",
      vehicleId: "ev-01",
      start: tomorrow.toISOString(),
      duration: 60,
      bayId: "BAY01",
      status: "upcoming",
      estimate: 560,
      advance: 168,
      fee: 20,
      discount: 0,
      paymentId: "TX-DEMO01",
      createdAt: now.toISOString()
    }, {
      id: "HB-DEMO02",
      stationId: "gulshan-grove",
      vehicleId: "ev-01",
      start: old,
      duration: 45,
      bayId: "BAY02",
      status: "completed",
      estimate: 380,
      advance: 380,
      fee: 20,
      discount: 0,
      paymentId: "TX-DEMO02",
      createdAt: old
    }, {
      id: "HB-DEMO03",
      stationId: "green-point",
      vehicleId: "ev-01",
      start: old,
      duration: 30,
      bayId: "BAY01",
      status: "cancelled",
      estimate: 290,
      advance: 87,
      fee: 20,
      discount: 0,
      paymentId: "TX-DEMO03",
      createdAt: old
    }] : [],

    sessions: seeded ? [{
      id: "CS-DEMO02",
      bookingId: "HB-DEMO02",
      stationId: "gulshan-grove",
      vehicleId: "ev-01",
      status: "completed",
      battery: 80,
      initialBattery: 50,
      energy: 18,
      elapsed: 2700,
      power: 0,
      solar: 86,
      updatedAt: old,
      createdAt: old,

      points: [{
        minute: 0,
        power: 42
      }, {
        minute: 15,
        power: 48
      }, {
        minute: 30,
        power: 36
      }, {
        minute: 45,
        power: 0
      }]
    }] : [],

    payments: seeded ? [{
      id: "TX-DEMO01",
      bookingId: "HB-DEMO01",
      amount: 168,
      method: "bKash",
      kind: "payment",
      status: "succeeded",
      createdAt: now.toISOString(),
      description: "Reservation advance"
    }, {
      id: "TX-DEMO02",
      bookingId: "HB-DEMO02",
      amount: 380,
      method: "Card",
      kind: "payment",
      status: "succeeded",
      createdAt: old,
      description: "Charging session"
    }, {
      id: "TX-DEMO03",
      bookingId: "HB-DEMO03",
      amount: 87,
      method: "Nagad",
      kind: "payment",
      status: "refunded",
      createdAt: old,
      description: "Reservation advance"
    }, {
      id: "RF-DEMO03",
      bookingId: "HB-DEMO03",
      amount: 67,
      method: "Nagad",
      kind: "refund",
      status: "succeeded",
      createdAt: old,
      description: "Cancellation refund"
    }] : [],

    savedStations: ["green-point"],
    notificationsRead: false,

    preferences: {
      booking: true,
      charging: true,
      offers: false
    }
  };

  const vehicleId = `ev-${ownerId}`;

  result.vehicles = result.vehicles.map(v => ({
    ...v,
    id: vehicleId
  }));

  result.selectedVehicleId = vehicleId;

  result.bookings = result.bookings.map(b => ({
    ...b,
    vehicleId
  }));

  result.sessions = result.sessions.map(s => ({
    ...s,
    vehicleId
  }));

  return result;
}

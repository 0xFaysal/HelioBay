import type { NetworkData, OwnerData } from "../../types/index.ts";
import { createNetwork } from "./network-seed.ts";

// Keep Prompt 1 reservations and balances, but require a fresh device handshake.
export function migrateDemo(value: unknown) {
  const old = value as { owners?: Record<string, OwnerData>; network?: NetworkData };
  const owners = structuredClone(old.owners ?? {});
  const network = structuredClone(old.network ?? createNetwork());
  for (const owner of Object.values(owners)) {
    for (const session of owner.sessions) {
      if (session.deviceId) continue;
      const booking = owner.bookings.find(b => b.id === session.bookingId);
      const bay = network.bays.find(b => b.stationId === session.stationId && b.id === booking?.bayId);
      session.bayId = bay?.id;
      session.deviceId = bay?.deviceId;
      session.energyWh = session.energy * 1000 / network.pricing.demoScalingFactor;
      session.targetBattery = 100;
      session.power = 0;
      if (session.status !== "completed") {
        session.status = "waiting";
        if (booking?.status === "charging") booking.status = "upcoming";
      }
    }
  }
  return { owners, network };
}

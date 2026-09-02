"use client";
import { getOwnerData, useDemoStore, demoTransaction } from "@/store/demo-store";
import { platform } from "@/lib/platform";
import { isDemo } from "@/lib/config";
import { vehicleSchema } from "@/lib/platform/schemas";
import type { Vehicle, OwnerData } from "@/types";

async function update(fn: (d: OwnerData) => OwnerData) {
  const id = useDemoStore.getState().activeId;
  if (!id) throw new Error("Please sign in.");
  if (isDemo) await demoTransaction(data => { if (!data.owners[id]) throw new Error("Account not found."); data.owners[id] = fn(data.owners[id]); });
  else await platform.saveOwner(fn(structuredClone(getOwnerData())));
}
export const accountService = {
  async saveVehicle(vehicle: Vehicle) {
    const valid = vehicleSchema.parse(vehicle);
    if (!valid.name.trim() || !valid.plate.trim()) throw new Error("Enter a vehicle name and registration.");
    await update(current => {
      if (current.sessions.some(s => s.vehicleId === vehicle.id && s.status !== "completed")) throw new Error("Finish your charging session before editing this vehicle.");
      const previous = current.vehicles.find(v => v.id === vehicle.id);
      if (previous && previous.connector !== vehicle.connector && current.bookings.some(b => b.vehicleId === vehicle.id && ["upcoming", "charging"].includes(b.status))) throw new Error("Cancel active reservations before changing this vehicle’s connector.");
      if (current.vehicles.some(v => v.id !== vehicle.id && v.plate.toUpperCase() === vehicle.plate.toUpperCase())) throw new Error("A vehicle with this registration already exists.");
      return { ...current, vehicles: previous ? current.vehicles.map(v => v.id === vehicle.id ? valid : v) : [...current.vehicles, { ...valid, isDefault: !current.vehicles.length }], selectedVehicleId: current.selectedVehicleId || vehicle.id };
    });
  },
  async removeVehicle(id: string) {
    await update(d => {
      if (d.bookings.some(b => b.vehicleId === id && ["upcoming", "charging"].includes(b.status))) throw new Error("Cancel upcoming bookings or finish charging before removing this vehicle.");
      const vehicles = d.vehicles.filter(v => v.id !== id);
      if (vehicles.length && !vehicles.some(v => v.isDefault)) vehicles[0] = { ...vehicles[0], isDefault: true };
      return { ...d, vehicles, selectedVehicleId: d.selectedVehicleId === id ? vehicles[0]?.id ?? "" : d.selectedVehicleId };
    });
  },
  async selectVehicle(id: string) { await update(d => { if (!d.vehicles.some(v => v.id === id)) throw new Error("Vehicle not found."); return { ...d, selectedVehicleId: id }; }); },
  async defaultVehicle(id: string) { await update(d => { if (!d.vehicles.some(v => v.id === id)) throw new Error("Vehicle not found."); return { ...d, vehicles: d.vehicles.map(v => ({ ...v, isDefault: v.id === id })), selectedVehicleId: id }; }); },
  async toggleSaved(id: string) { await update(d => ({ ...d, savedStations: d.savedStations.includes(id) ? d.savedStations.filter(s => s !== id) : [...d.savedStations, id] })); },
  async saveProfile(profile: OwnerData["profile"]) { await update(d => ({ ...d, profile })); },
  async preference(key: keyof OwnerData["preferences"], value: boolean) { await update(d => ({ ...d, preferences: { ...d.preferences, [key]: value } })); },
  async readNotifications() { await update(d => ({ ...d, notificationsRead: true })); },
};

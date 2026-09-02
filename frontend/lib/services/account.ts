"use client";
import { getOwnerData, useDemoStore } from "@/store/demo-store";
import type { Vehicle, OwnerData } from "@/types";

export const accountService = {
  saveVehicle(vehicle: Vehicle) {
    if (!vehicle.name.trim() || !vehicle.plate.trim() || vehicle.capacity < 10 || vehicle.capacity > 200)
      throw new Error("Enter a name, registration, and battery size between 10 and 200 kWh.");

    const current = getOwnerData();

    if (current.sessions.some(s => s.vehicleId === vehicle.id && s.status !== "completed"))
      throw new Error("Finish your charging session before editing this vehicle.");

    const previous = current.vehicles.find(v => v.id === vehicle.id);
    if (previous && previous.connector !== vehicle.connector && current.bookings.some(b => b.vehicleId === vehicle.id && ["upcoming", "charging"].includes(b.status)))
      throw new Error("Cancel active reservations before changing this vehicle’s connector.");

    if (current.vehicles.some(v => v.id !== vehicle.id && v.plate.toUpperCase() === vehicle.plate.toUpperCase()))
      throw new Error("A vehicle with this registration already exists.");

    useDemoStore.getState().update(d => {
      const exists = d.vehicles.some(v => v.id === vehicle.id);

      const list = exists ? d.vehicles.map(v => v.id === vehicle.id ? vehicle : v) : [...d.vehicles, {
        ...vehicle,
        isDefault: !d.vehicles.length
      }];

      return {
        ...d,
        vehicles: list,
        selectedVehicleId: d.selectedVehicleId || vehicle.id
      };
    });
  },

  removeVehicle(id: string) {
    if (getOwnerData().bookings.some(b => b.vehicleId === id && ["upcoming", "charging"].includes(b.status)))
      throw new Error("Cancel upcoming bookings or finish charging before removing this vehicle.");

    useDemoStore.getState().update(d => {
      const vehicles = d.vehicles.filter(v => v.id !== id);

      if (vehicles.length && !vehicles.some(v => v.isDefault)) vehicles[0] = {
        ...vehicles[0],
        isDefault: true
      };

      return {
        ...d,
        vehicles,
        selectedVehicleId: d.selectedVehicleId === id ? vehicles[0]?.id ?? "" : d.selectedVehicleId
      };
    });
  },

  selectVehicle(id: string) {
    if (!getOwnerData().vehicles.some(v => v.id === id))
      return;

    useDemoStore.getState().update(d => ({
      ...d,
      selectedVehicleId: id
    }));
  },

  defaultVehicle(id: string) {
    useDemoStore.getState().update(d => ({
      ...d,

      vehicles: d.vehicles.map(v => ({
        ...v,
        isDefault: v.id === id
      })),

      selectedVehicleId: id
    }));
  },

  toggleSaved(id: string) {
    useDemoStore.getState().update(d => ({
      ...d,
      savedStations: d.savedStations.includes(id) ? d.savedStations.filter(s => s !== id) : [...d.savedStations, id]
    }));
  },

  saveProfile(profile: OwnerData["profile"]) {
    useDemoStore.getState().update(d => ({
      ...d,
      profile
    }));
  },

  preference(key: keyof OwnerData["preferences"], value: boolean) {
    useDemoStore.getState().update(d => ({
      ...d,

      preferences: {
        ...d.preferences,
        [key]: value
      }
    }));
  },

  readNotifications() {
    useDemoStore.getState().update(d => ({
      ...d,
      notificationsRead: true
    }));
  }
};

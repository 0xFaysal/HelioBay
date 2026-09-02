"use client";
import { create } from "zustand";
import { LocateFixed } from "lucide-react";
import type { Coordinates } from "@/lib/credit/model";
import { Button } from "@/components/ui/button";
interface LocationState {
  coordinates: Coordinates | null; accuracy: number | null; label: string;
  status: "idle" | "requesting" | "granted" | "denied" | "unavailable" | "timeout"; error: string;
}
// Visit-only, deliberately not persisted or copied into the user's profile.
export const useLocation = create<LocationState>(() => ({ coordinates: null, accuracy: null, label: "Location not shared", status: "idle", error: "" }));
export function LocationButton({ onLocate }: { onLocate: (coordinates: Coordinates) => void }) {
  const status = useLocation(s => s.status);
  function locate() {
    if (!navigator.geolocation) { useLocation.setState({ status: "unavailable", error: "Location is unavailable in this browser. Search a station or area instead." }); return; }
    useLocation.setState({ status: "requesting", error: "" });
    navigator.geolocation.getCurrentPosition(p => {
      const coordinates = { lat: p.coords.latitude, lng: p.coords.longitude };
      useLocation.setState({ coordinates, accuracy: p.coords.accuracy, status: "granted", label: "Your current location", error: "" });
      onLocate(coordinates);
    }, e => {
      const next = e.code === 1 ? "denied" : e.code === 3 ? "timeout" : "unavailable";
      useLocation.setState({ status: next, error: next === "denied" ? "Location permission denied. Search a station or area instead, or enable location in your browser." : next === "timeout" ? "Location request timed out. Retry or search a station or area." : "Your location could not be determined. Search a station or area instead." });
    }, { timeout: 10000, maximumAge: 30000, enableHighAccuracy: true });
  }
  return <Button variant="outline" onClick={locate} disabled={status === "requesting"}><LocateFixed size={16} />{status === "requesting" ? "Locating…" : "Use my location"}</Button>;
}

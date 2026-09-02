"use client";
import { useState } from "react";
import { create } from "zustand";
import { LocateFixed, MapPin } from "lucide-react";
import { useCreditData } from "@/store/credit-store";
import type { Coordinates } from "@/lib/credit/model";
import { creditService } from "@/lib/credit/services";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
interface LocationState { coordinates: Coordinates | null; label: string; status: "idle" | "requesting" | "granted" | "denied" | "unavailable" | "timeout" | "manual"; error: string }
export const useLocation = create<LocationState>(() => ({ coordinates: null, label: "Location not shared", status: "idle", error: "" }));
export function LocationPanel() {
  const location = useLocation(); const data = useCreditData(); const [manual, setManual] = useState("");
  function locate() {
    if (!navigator.geolocation) { useLocation.setState({ status: "unavailable", error: "Location is unavailable in this browser. Search an area below." }); return; }
    useLocation.setState({ status: "requesting", error: "" });
    navigator.geolocation.getCurrentPosition(p => { const coordinates = { lat: p.coords.latitude, lng: p.coords.longitude }; useLocation.setState({ coordinates, status: "granted", label: "Your current location", error: "" }); void creditService.stations.nearest(coordinates).catch(e => useLocation.setState({ error: e.message })); }, e => { const status = e.code === 1 ? "denied" : e.code === 3 ? "timeout" : "unavailable"; useLocation.setState({ status, error: status === "denied" ? "Location permission denied. Search an area instead." : status === "timeout" ? "Location request timed out. Retry or search manually." : "Your location could not be determined. Search an area instead." }); }, { timeout: 10000, maximumAge: 60000 });
  }
  return <section className="panel credit-location"><div><p className="text-sm font-medium flex gap-2 items-center"><MapPin size={16} />{location.label}</p><p className="text-xs muted mt-2">Share location to see nearest stations. It is used for this visit, not stored in your profile.</p>{location.error && <p className="error-text mt-2" role="alert">{location.error}</p>}<Button className="mt-4" variant="outline" onClick={locate} disabled={location.status === "requesting"}><LocateFixed size={15} />{location.status === "requesting" ? "Finding your location…" : "Use my location"}</Button></div><form onSubmit={e => { e.preventDefault(); const match = data.stations.find(s => `${s.name} ${s.address} ${s.landmark}`.toLowerCase().includes(manual.trim().toLowerCase())); if (!manual.trim() || !match) { useLocation.setState({ error: "No matching area. Try Gulshan, Banani, Dhanmondi, Uttara or Tejgaon." }); return; } const coordinates = { lat: match.lat, lng: match.lng }; useLocation.setState({ coordinates, label: `Near ${match.landmark}`, status: "manual", error: "" }); void creditService.stations.nearest(coordinates).catch(e => useLocation.setState({ error: e.message })); }}><Input aria-label="Manual location search" placeholder="Area or landmark" value={manual} onChange={e => setManual(e.target.value)} /><Button type="submit" variant="outline">Search area</Button></form></section>;
}

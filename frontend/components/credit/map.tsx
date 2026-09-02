"use client";
import { MapContainer, TileLayer, Marker, Circle, Tooltip, ZoomControl, useMap, useMapEvents } from "react-leaflet";
import { divIcon, type Marker as LeafletMarker } from "leaflet";
import { useEffect, useMemo, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import type { Coordinates, Station } from "@/lib/credit/model";
import { useCreditData } from "@/store/credit-store";
import { availableBays, deviceFresh } from "@/lib/credit/selectors";
import { useClock } from "@/hooks/use-clock";
import { useLocation } from "./location";

export type ViewportRequest = { sequence: number } & (
  { kind: "location" | "station"; coordinates: Coordinates } | { kind: "fit"; coordinates: Coordinates[] }
);
function ViewportController({ request }: { request: ViewportRequest | null }) {
  const map = useMap(); const applying = useRef(false); const handled = useRef(-1);
  const manual = useRef(false);
  const describe = () => { const center = map.getCenter(); const container = map.getContainer(); container.dataset.viewport = `${center.lat.toFixed(6)},${center.lng.toFixed(6)},${map.getZoom()}`; container.dataset.manualViewport = String(manual.current); };
  useMapEvents({
    dragstart: () => { manual.current = true; },
    zoomstart: () => { if (!applying.current) manual.current = true; },
    moveend: describe,
  });
  useEffect(() => {
    // This effect accepts explicit user commands only. Station data is never a dependency.
    if (!request || request.sequence === handled.current) return;
    handled.current = request.sequence; applying.current = true; manual.current = false;
    if (request.kind === "fit" && request.coordinates.length) map.fitBounds(request.coordinates.map(p => [p.lat, p.lng]), { padding: [60, 110], maxZoom: 14, animate: false });
    else if (request.kind !== "fit") map.setView([request.coordinates.lat, request.coordinates.lng], request.kind === "location" ? 14 : Math.max(14, map.getZoom()), { animate: false });
    applying.current = false;
  }, [map, request]);
  useEffect(() => {
    const container = map.getContainer(); let width = container.clientWidth, height = container.clientHeight;
    const center = map.getCenter(); container.dataset.viewport = `${center.lat.toFixed(6)},${center.lng.toFixed(6)},${map.getZoom()}`;
    const observer = new ResizeObserver(entries => {
      const { width: nextWidth, height: nextHeight } = entries[0].contentRect;
      if (nextWidth > 0 && nextHeight > 0 && (nextWidth !== width || nextHeight !== height)) {
        width = nextWidth; height = nextHeight; // Resize compensation preserves the geographic center; it does not fit station data.
        map.invalidateSize({ pan: true, animate: false, debounceMoveend: true });
      }
    });
    observer.observe(container); return () => observer.disconnect();
  }, [map]);
  return null;
}

const positionIcon = divIcon({ html: '<span class="user-location-dot"></span>', className: "user-position-marker", iconSize: [20, 20], iconAnchor: [10, 10] });
function StationMarker({ station, count, offline, selected, onSelect }: { station: Station; count: number; offline: boolean; selected: boolean; onSelect: (id: string) => void }) {
  const marker = useRef<LeafletMarker>(null);
  const state = offline ? "offline" : count > 0 ? "available" : "busy";
  const label = `${station.name} · ${offline ? "offline" : count + " bays available"}`;
  // A stable icon preserves the focused DOM node across realtime telemetry renders.
  const icon = useMemo(() => divIcon({
    html: `<span class="station-pin ${state} ${selected ? "selected" : ""}" aria-hidden="true"><span>${offline ? "–" : count}</span></span>`,
    className: "station-pin-wrapper", iconSize: [36, 44], iconAnchor: [18, 44],
  }), [state, selected, offline, count]);
  useEffect(() => {
    const instance = marker.current;
    if (!instance) return;
    let element: HTMLElement | undefined;
    const activate = (event: KeyboardEvent) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault(); event.stopPropagation(); onSelect(station.id);
    };
    const attach = () => {
      element?.removeEventListener("keydown", activate);
      element = instance.getElement();
      element?.setAttribute("role", "button"); element?.setAttribute("aria-label", label);
      element?.addEventListener("keydown", activate);
    };
    attach(); instance.on("add", attach);
    return () => { instance.off("add", attach); element?.removeEventListener("keydown", activate); };
  }, [icon, label, onSelect, station.id]);
  return <Marker ref={marker} title={label} alt={station.name} position={[station.lat, station.lng]} keyboard icon={icon} eventHandlers={{ click: () => onSelect(station.id) }}><Tooltip direction="top" offset={[0, -36]}>{station.name} · {offline ? "Offline" : count ? `${count} bays available` : "All bays occupied"}</Tooltip></Marker>;
}
export default function CreditMap({ stations, selected, onSelect, request }: { stations: Station[]; selected?: string; onSelect: (id: string) => void; request: ViewportRequest | null }) {
  const [error, setError] = useState(false); const data = useCreditData(); const location = useLocation(); const clock = useClock(); const now = clock || Date.parse(data.lastTick);
  return <>
    <MapContainer center={[23.7937, 90.4066]} zoom={12} scrollWheelZoom={false} zoomControl={false} trackResize={false} aria-label="HelioBay station map">
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution={'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'} eventHandlers={{ tileerror: () => setError(true) }} />
      <ZoomControl position="bottomright" /><ViewportController request={request} />
      {location.coordinates && <><Circle center={[location.coordinates.lat, location.coordinates.lng]} radius={location.accuracy ?? 0} pathOptions={{ color: "#2674d4", fillColor: "#2674d4", fillOpacity: .08, weight: 1 }} /><Marker position={[location.coordinates.lat, location.coordinates.lng]} icon={positionIcon} title="Your current location" alt="Your current location" keyboard><Tooltip>Your current location · accuracy ±{Math.round(location.accuracy ?? 0)} m</Tooltip></Marker></>}
      {stations.map(s => {
        const count = availableBays(data, s.id, now).length; const offline = !s.online || !deviceFresh(data, s.deviceId, now);
        return <StationMarker key={s.id} station={s} count={count} offline={offline} selected={selected === s.id} onSelect={onSelect} />;
      })}
    </MapContainer>
    {error && <div className="map-tile-notice" role="status">Map tiles are unavailable. Station pins, search and List view still work.</div>}
  </>;
}

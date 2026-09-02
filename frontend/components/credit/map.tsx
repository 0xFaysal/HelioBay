"use client";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import { divIcon } from "leaflet";
import { useEffect, useState } from "react";
import Link from "next/link";
import "leaflet/dist/leaflet.css";
import type { Station } from "@/lib/credit/model";
import { decimal } from "@/lib/credit/money";
function Focus({ station }: { station?: Station }) { const map = useMap(); useEffect(() => { if (station) map.setView([station.lat, station.lng], 13, { animate: false }); }, [station, map]); return null; }
export default function CreditMap({ stations, selected, onSelect }: { stations: Station[]; selected?: string; onSelect: (id: string) => void }) {
  const [error, setError] = useState(false);
  return <><MapContainer center={[23.7937, 90.4066]} zoom={12} scrollWheelZoom={false}><TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution={'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'} eventHandlers={{ tileerror: () => setError(true) }} /><Focus station={stations.find(s => s.id === selected)} />{stations.map(s => <Marker key={s.id} title={s.name} alt={s.name} position={[s.lat, s.lng]} icon={divIcon({ html: `<div class="map-marker ${selected === s.id ? "active" : ""}">⚡ ${decimal(s.priceMinor)}</div>`, className: "", iconSize: [90, 38], iconAnchor: [45, 38] })} eventHandlers={{ click: () => onSelect(s.id) }}><Popup><strong>{s.name}</strong><p>{s.address}</p><Link href={`/stations/${s.id}`}>View Station →</Link></Popup></Marker>)}</MapContainer>{error && <div className="map-unavailable" role="status">Map tiles are unavailable. Station markers and the complete station list still work.</div>}</>;
}

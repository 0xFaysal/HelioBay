"use client";
import Link from "next/link";
import { Heart, Sun, Zap, ArrowUpRight, MapPin } from "lucide-react";
import { motion } from "motion/react";
import { toast } from "sonner";
import { AssetImage } from "@/components/shared/asset-image";
import { useOwnerData } from "@/store/demo-store";
import { accountService } from "@/lib/services/account";
import { money } from "@/lib/services/booking-rules";
import type { Station } from "@/types";
export function StationCard({ station, selected, onSelect }: { station: Station; selected?: boolean; onSelect?: () => void }) {
 const data = useOwnerData(); const saved = data?.savedStations.includes(station.id);
 return <motion.article whileHover={{ y: -3 }} transition={{ duration: .2 }} className={`station-card ${selected ? "selected" : ""}`}><div className="station-card-photo"><AssetImage src={station.image} alt={`${station.name} solar charging concept`} fill sizes="(max-width:600px) 100vw,33vw" /><span className="absolute left-3 top-3 bg-white rounded-md px-2 py-1 text-[10px]"><span className={`status-dot ${!station.online ? "!bg-red-500" : station.available === 0 ? "!bg-amber-500" : ""}`} />{!station.online ? "Offline" : station.available > 0 ? `${station.available} bays available` : "All bays occupied"}</span><button onClick={() => { if (!data) { toast.info("Sign in to save your favorite stations."); return; } accountService.toggleSaved(station.id); }} aria-label={`${saved ? "Unsave" : "Save"} ${station.name}`} aria-pressed={!!saved} className="absolute right-3 top-3 bg-white p-2 rounded-lg"><Heart size={15} fill={saved ? "#00e676" : "none"} /></button></div><div className="station-card-body"><h3><Link href={`/stations/${station.id}`}>{station.name}</Link></h3><p className="text-[11px] muted mt-2 flex items-center gap-1"><MapPin size={12} />{station.address}</p><div className="flex gap-4 text-[10px] mt-4"><span className="flex gap-1 items-center"><Zap size={12} />{station.power} kW · {station.connector}</span><span className="flex gap-1 items-center text-[#007c3e]"><Sun size={12} />{station.solar}% solar</span></div><div className="flex items-center justify-between mt-5 pt-4 border-t"><span className="text-xs"><strong>{money(station.price)}</strong><span className="muted"> / kWh</span></span>{onSelect ? <button onClick={onSelect} className="text-[11px] flex items-center gap-2">{station.distance.toFixed(1)} km · Show on map <MapPin size={13} /></button> : <Link href={`/stations/${station.id}`} className="text-[11px] flex items-center gap-2">View station <ArrowUpRight size={14} /></Link>}</div></div></motion.article>;
}

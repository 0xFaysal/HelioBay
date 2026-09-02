"use client";
import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Search, Map, List, LocateFixed, RotateCcw, Heart } from "lucide-react";
import { toast } from "sonner";
import { stationService, distanceKm, liveStation } from "@/lib/services/stations";
import { useClock } from "@/hooks/use-clock";
import { ConnectionStatus } from "@/components/shared/connection-status";
import { useDemoStore } from "@/store/demo-store";
import { useOwnerData } from "@/store/demo-store";
import { StationCard } from "./station-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import type { Station } from "@/types";

const StationMap = dynamic(() => import("./station-map"), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full" />
});

export function Discovery() {
  const now = useClock();
  const network = useDemoStore(s => s.network);
  const owners = useDemoStore(s => s.owners);
  const [stations, setStations] = useState<Station[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [view, setView] = useState("list");
  const [available, setAvailable] = useState(false);
  const [connector, setConnector] = useState("");
  const [price, setPrice] = useState(25);
  const [distance, setDistance] = useState(100);
  const [solar, setSolar] = useState(0);
  const [sort, setSort] = useState("distance");
  const [saved, setSaved] = useState(false);
  const [selected, setSelected] = useState("green-point");

  const [location, setLocation] = useState<{
    lat: number;
    lng: number;
  }>();

  const [locating, setLocating] = useState(false);
  const [sheet, setSheet] = useState(false);
  const data = useOwnerData();

  const load = () => {
    setLoading(true);
    setError("");
    stationService.list().then(setStations).catch(() => setError("The station directory couldn’t load. Please try again.")).finally(() => setLoading(false));
  };

  useEffect(() => {
    let cancelled = false;

    stationService.list().then(s => {
      if (!cancelled) {
        setStations(s);
        setLoading(false);
      }
    }).catch(() => {
      if (!cancelled) {
        setError("The station directory couldn’t load.");
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => (network.stations.length ? network.stations.map(s => stationService.get(s.id)!) : stations).map(s => ({
    ...liveStation(s, Object.values(owners).flatMap(o => o.bookings), now),
    distance: location ? distanceKm(location, s) : s.distance
  })).filter(
    s => `${s.name} ${s.address} ${s.landmark}`.toLowerCase().includes(query.toLowerCase()) && (!available || s.available > 0 && s.online) && (!connector || connector === s.connector) && s.price <= price && s.distance <= distance && s.solar >= solar && (!saved || data?.savedStations.includes(s.id))
  ).sort(
    (a, b) => sort === "price" ? a.price - b.price : sort === "solar" ? b.solar - a.solar : a.distance - b.distance
  ), [
    stations,
    network,
    owners,
    query,
    available,
    connector,
    price,
    distance,
    solar,
    saved,
    data?.savedStations,
    now,
    sort,
    location
  ]);

  function locate() {
    if (!navigator.geolocation) {
      toast.error("Location isn’t supported by this browser.");
      return;
    }

    setLocating(true);

    navigator.geolocation.getCurrentPosition(p => {
      setLocation({
        lat: p.coords.latitude,
        lng: p.coords.longitude
      });

      setLocating(false);
      toast.success("Distances updated from your location.");
    }, () => {
      setLocating(false);
      toast.error("Location unavailable or permission denied. Showing distances from Banani, Dhaka.");
    }, {
      timeout: 10000
    });
  }

  function select(id: string) {
    setSelected(id);

    if (window.innerWidth < 850)
      setSheet(true);
  }

  const selectedStation = filtered.find(s => s.id === selected);

  return (
    <div className="pb-16"><ConnectionStatus />
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={17} className="absolute left-3 top-3.5 text-muted-foreground" />
          <Input
            aria-label="Search stations"
            placeholder="Search a station, neighborhood, or landmark"
            className="!pl-10"
            value={query}
            onChange={e => setQuery(e.target.value)} />
        </div>
        <Button variant="outline" onClick={locate} disabled={locating}>
          <LocateFixed size={15} />
          {locating ? "Locating…" : "Near me"}
        </Button>
        <div className="flex border rounded-lg overflow-hidden">
          <Button
            variant={view === "list" ? "secondary" : "ghost"}
            onClick={() => setView("list")}
            aria-pressed={view === "list"}><List size={15} />List</Button>
          <Button
            variant={view === "map" ? "secondary" : "ghost"}
            onClick={() => setView("map")}
            aria-pressed={view === "map"}><Map size={15} />Map</Button>
        </div>
      </div>
      <div className="filter-bar">
        <label className="filter-control flex gap-2 items-center"><input type="checkbox" checked={available} onChange={e => setAvailable(e.target.checked)} />Available now</label>
        <select
          aria-label="Connector filter"
          className="filter-control"
          value={connector}
          onChange={e => setConnector(e.target.value)}>
          <option value="">All connectors</option>
          <option>CCS2</option>
          <option>Type 2</option>
        </select>
        <select
          aria-label="Price filter"
          className="filter-control"
          value={price}
          onChange={e => setPrice(Number(e.target.value))}>
          <option value={25}>Any price</option>
          <option value={18}>Up to ৳18 / kWh</option>
          <option value={16}>Up to ৳16 / kWh</option>
        </select>
        <select
          aria-label="Distance filter"
          className="filter-control"
          value={distance}
          onChange={e => setDistance(Number(e.target.value))}>
          <option value={100}>Within 100 km</option>
          <option value={3}>Within 3 km</option>
          <option value={5}>Within 5 km</option>
          <option value={10}>Within 10 km</option>
        </select>
        <select
          aria-label="Solar energy filter"
          className="filter-control"
          value={solar}
          onChange={e => setSolar(Number(e.target.value))}>
          <option value={0}>Any solar mix</option>
          <option value={80}>80%+ solar</option>
          <option value={90}>90%+ solar</option>
        </select>
        <button
          className={`filter-control flex items-center gap-1 ${saved ? "bg-green-50" : ""}`}
          onClick={() => setSaved(!saved)}
          aria-pressed={saved}><Heart size={12} />Saved</button>
        <button
          className="text-[11px] muted flex gap-1 items-center ml-auto"
          onClick={() => {
            setQuery("");
            setAvailable(false);
            setConnector("");
            setPrice(25);
            setDistance(100);
            setSolar(0);
            setSaved(false);
            setSort("distance");
          }}><RotateCcw size={12} />Reset</button>
      </div>
      <div className="flex items-center justify-between gap-3 mb-6 text-xs">
        <p className="muted">{filtered.length}stations · {location ? "Your current location" : "Distances from Banani, Dhaka"}· Demo network</p>
        <select
          aria-label="Sort stations"
          className="filter-control"
          value={sort}
          onChange={e => setSort(e.target.value)}>
          <option value="distance">Nearest first</option>
          <option value="price">Lowest price</option>
          <option value="solar">Most solar</option>
        </select>
      </div>
      {loading ? <div className="grid-three">{[1, 2, 3].map(i => <Skeleton className="h-80" key={i} />)}</div> : error ? <div className="empty-state" role="alert">
        <p>{error}</p>
        <Button onClick={load}>Retry</Button>
      </div> : !filtered.length ? <div className="empty-state">
        <Search className="mx-auto muted" />
        <h3>No stations in this view.</h3>
        <p>Try a different neighborhood or broaden your filters.{saved && !data && " Sign in to see saved stations."}</p>
        <Button
          onClick={() => {
            setQuery("");
            setAvailable(false);
            setConnector("");
            setPrice(25);
            setDistance(100);
            setSolar(0);
            setSaved(false);
          }}>Clear filters</Button>
      </div> : <div className={view === "map" ? "map-layout" : "grid-three"}>{view === "map" ? <>
          <div className="map-results">{filtered.map(
              s => <StationCard key={s.id} station={s} selected={selected === s.id} onSelect={() => select(s.id)} />
            )}</div>
          <div className="map-panel"><StationMap stations={filtered} selected={selected} onSelect={select} /></div>
        </> : filtered.map(s => <StationCard key={s.id} station={s} />)}</div>}
      <Sheet open={sheet} onOpenChange={setSheet}><SheetContent side="bottom" className="p-5 rounded-t-2xl max-h-[80vh] overflow-auto">
          <SheetTitle>{selectedStation?.name ?? "Station details"}</SheetTitle>
          <SheetDescription>Selected station on the map</SheetDescription>
          {selectedStation && <StationCard station={selectedStation} />}
        </SheetContent></Sheet>
    </div>
  );
}

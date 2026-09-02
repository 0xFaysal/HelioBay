"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, MapPin, Grid2X2, Cpu, CalendarDays, Zap, Wallet, Undo2, ChartNoAxesCombined, Wrench, Settings, PanelLeftClose, PanelLeftOpen, Menu, Search, Bell, ChevronDown, LogOut, ArrowUpRight } from "lucide-react";
import { useAuth } from "@/components/shared/providers";
import { useDemoStore } from "@/store/demo-store";
import { ConnectionStatus } from "@/components/shared/connection-status";
import { Brand } from "@/components/shared/brand";
import { authService } from "@/lib/services/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { isDemo } from "@/lib/config";

export const adminLinks = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard }, { href: "/admin/stations", label: "Stations", icon: MapPin },
  { href: "/admin/bays", label: "Bays", icon: Grid2X2 }, { href: "/admin/devices", label: "Devices", icon: Cpu },
  { href: "/admin/bookings", label: "Bookings", icon: CalendarDays }, { href: "/admin/sessions", label: "Charging sessions", icon: Zap },
  { href: "/admin/payments", label: "Payments", icon: Wallet }, { href: "/admin/refunds", label: "Refunds", icon: Undo2 },
  { href: "/admin/analytics", label: "Analytics", icon: ChartNoAxesCombined }, { href: "/admin/maintenance", label: "Maintenance", icon: Wrench },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];
export function AdminShell({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth(); const router = useRouter(); const path = usePathname();
  const [collapsed, setCollapsed] = useState(false); const [drawer, setDrawer] = useState(false); const [search, setSearch] = useState(false);
  const [query, setQuery] = useState(""); const [notifications, setNotifications] = useState(false); const [profile, setProfile] = useState(false);
  const network = useDemoStore(s => s.network); const apiError = useDemoStore(s => s.apiError); const apiLoading = useDemoStore(s => s.apiLoading);
  useEffect(() => { if (!loading && !user) router.replace(`/auth/sign-in?role=admin&next=${encodeURIComponent(path)}`); }, [loading, user, router, path]);
  useEffect(() => { const key = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key === "k") { e.preventDefault(); setSearch(x => !x); } }; window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key); }, []);
  if (loading || !user) return <main className="container-wide py-16"><Skeleton className="h-12 w-72 mb-8" /><Skeleton className="h-96 w-full" /><p className="mt-4 muted" role="status">Loading administrator session…</p></main>;
  if (user.role !== "admin") return <main id="main-content" className="empty-state"><h1>Administrator access required.</h1><p>Your EV Owner account cannot access network operations.</p><Link className="action action-primary" href="/dashboard">Return to my dashboard</Link><Link className="action action-outline mt-3" href="/auth/sign-in?role=admin">Station partner sign-in</Link></main>;
  const nav = (mobile = false) => <nav aria-label={mobile ? "Mobile admin navigation" : "Admin navigation"}>{adminLinks.map(item => <Link key={item.href} href={item.href} title={collapsed ? item.label : undefined} aria-current={path === item.href || item.href !== "/admin" && path.startsWith(item.href + "/") ? "page" : undefined} onClick={() => setDrawer(false)}><item.icon size={18} /><span>{item.label}</span></Link>)}</nav>;
  const alerts = network.faults.filter(f => f.status !== "resolved");
  const current = adminLinks.find(l => l.href === path)?.label ?? "Station details";
  return <div className={`admin-shell ${collapsed ? "admin-collapsed" : ""}`}>
    <aside className="admin-sidebar"><Brand /><p className="admin-caption">STATION PARTNER</p>{nav()}<div className="admin-sidebar-bottom"><Link href="/stations"><ArrowUpRight size={16} /><span>Public network</span></Link><Button variant="ghost" aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} onClick={() => setCollapsed(!collapsed)}>{collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}<span>Collapse sidebar</span></Button></div></aside>
    <div className="admin-workspace"><header className="admin-topbar"><div className="flex items-center gap-3"><Button className="admin-mobile-menu" variant="outline" size="icon" aria-label="Open admin navigation" onClick={() => setDrawer(true)}><Menu /></Button><span className="text-sm">{current}</span></div><div className="flex items-center gap-2"><Button variant="outline" className="admin-search-trigger" onClick={() => setSearch(true)}><Search size={15} /><span>Search network</span><kbd>⌘ K</kbd></Button><Button variant="ghost" size="icon" aria-label={`Notifications, ${alerts.length} alerts`} onClick={() => setNotifications(true)}><Bell /></Button><Button variant="ghost" aria-label="Admin profile menu" onClick={() => setProfile(true)}><span className="avatar">SP</span><ChevronDown size={13} /></Button></div></header>
      <main id="main-content" className="admin-main"><ConnectionStatus />{!isDemo && apiError ? <section className="panel empty-state"><h1>Network data unavailable.</h1><p>No demo records are being shown. Use Retry connection above to reconnect to your backend.</p></section> : !isDemo && apiLoading && !network.stations.length ? <Skeleton className="h-96 w-full" /> : children}</main>
    </div>
    <Sheet open={drawer} onOpenChange={setDrawer}><SheetContent side="left" className="admin-drawer"><SheetTitle>Network operations</SheetTitle><SheetDescription>HelioBay station partner navigation</SheetDescription>{nav(true)}</SheetContent></Sheet>
    <Dialog open={search} onOpenChange={setSearch}><DialogContent className="!max-w-lg"><DialogTitle>Search your network</DialogTitle><DialogDescription>Pages, stations and devices. Press Escape to close.</DialogDescription><Input aria-label="Search network" autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Try devices, Green Point or ST001" /><div className="command-results">{[...adminLinks, ...network.stations.map(s => ({ href: `/admin/stations/${s.id}`, label: s.name })), ...network.devices.map(d => ({ href: `/admin/devices?device=${d.id}`, label: `${d.id} · ${d.bayId}` }))].filter(x => x.label.toLowerCase().includes(query.toLowerCase())).map(x => <Link key={x.href} href={x.href} onClick={() => setSearch(false)}>{x.label}<ArrowUpRight size={13} /></Link>)}</div></DialogContent></Dialog>
    <Dialog open={notifications} onOpenChange={setNotifications}><DialogContent><DialogTitle>Priority alerts</DialogTitle><DialogDescription>{alerts.length} unresolved network notices.</DialogDescription>{alerts.slice(0, 6).map(f => <Link className="notice" key={f.id} href="/admin/maintenance" onClick={() => setNotifications(false)}>{f.deviceId} · {f.message}</Link>)}{!alerts.length && <p className="muted">Everything is clear. No open faults.</p>}</DialogContent></Dialog>
    <Dialog open={profile} onOpenChange={setProfile}><DialogContent><DialogTitle>{user.name}</DialogTitle><DialogDescription>{user.email} · {user.demo ? "Demo Admin · not production authorization" : "Firebase administrator"}</DialogDescription><Link href="/admin/settings" className="action action-outline" onClick={() => setProfile(false)}>Network settings</Link>{user.demo && <Button variant="outline" onClick={() => { authService.demo("owner"); router.push("/dashboard"); }}>Switch to EV Owner demo</Button>}<Button variant="destructive" onClick={async () => { await authService.logout(); router.push("/auth/sign-in?role=admin"); }}><LogOut size={15} />Sign out</Button></DialogContent></Dialog>
  </div>;
}

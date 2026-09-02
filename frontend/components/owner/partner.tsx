"use client";
import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/shared/providers";
import { PublicShell } from "@/components/shared/public-shell";
import { stationService } from "@/lib/services/stations";
import { authService } from "@/lib/services/auth";
import { Button } from "@/components/ui/button";
export function Partner(){const {user,loading}=useAuth();const router=useRouter();useEffect(()=>{if(!loading&&(!user||user.role!=="admin"))router.replace("/auth/sign-in?role=admin");},[user,loading,router]);if(loading||!user||user.role!=="admin")return <main id="main-content" className="empty-state" role="status">Loading partner preview…</main>;const s=stationService.get("green-point")!;return <PublicShell><div className="container-wide pb-20"><div className="page-intro"><div className="eyebrow">STATION PARTNER · DEMO ADMIN</div><h1>Your network preview.</h1><p>A read-only partner landing page. The production admin console is outside this owner-frontend scope.</p></div><div className="notice notice-warning mb-7">This browser-local Admin account grants no production privileges. Real administrator roles must be verified on the backend.</div><div className="grid-three">{[["Station",s.name],["Device",s.deviceId],["Availability",`${s.available} of ${s.bays} bays`]].map(([l,v])=><div className="panel" key={l}><span className="text-xs muted">{l}</span><h2 className="text-xl mt-3">{v}</h2></div>)}</div><div className="flex flex-wrap gap-3 mt-7"><Link href="/stations/green-point" className="action action-primary">View station</Link><Button variant="outline" onClick={()=>{authService.demo("owner");router.push("/dashboard");}}>Switch to EV Owner demo</Button><Button variant="outline" onClick={async()=>{await authService.logout();router.push("/");}}>Sign out</Button></div></div></PublicShell>;}

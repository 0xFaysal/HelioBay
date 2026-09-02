"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { MotionConfig } from "motion/react";
import { Toaster, toast } from "sonner";
import { useCreditStore as useDemoStore, hydrateCredits as hydrateDemoStore } from "@/store/credit-store";
import { demoEnabled, firebaseAuth, firebaseConfigured } from "@/lib/firebase/client";
import { PlatformRuntime } from "@/components/credit/runtime";
import type { Account } from "@/types";

const AuthContext = createContext<{ user: Account | null; loading: boolean }>({ user: null, loading: true });
export const useAuth = () => useContext(AuthContext);
export function Providers({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<Account | null>(null);
  const [authReady, setAuthReady] = useState(!firebaseConfigured);
  const hydrated = useDemoStore(s => s.ready);
  const demoAccount = useDemoStore(s => s.account?.demo ? s.account : null);
  useEffect(() => {
    void hydrateDemoStore().catch(() => {
      useDemoStore.setState({ ready: true });
      toast.error("Browser storage is unavailable. Changes may not survive refresh.");
    });
  }, []);
  useEffect(() => {
    if (!firebaseConfigured || !hydrated) return;
    let disposed = false;
    const unsubscribe = onAuthStateChanged(firebaseAuth(), async u => {
      const result = u ? await u.getIdTokenResult().catch(() => null) : null;
      if (disposed) return;
      const account: Account | null = u ? { id: u.uid, name: u.displayName || "EV Owner", email: u.email || "", role: result?.claims.role === "admin" ? "admin" : "owner", demo: false } : null;
      setFirebaseUser(account); setAuthReady(true);
      if (account) useDemoStore.getState().setAccount(account);
      else if (useDemoStore.getState().account && !useDemoStore.getState().account?.demo) useDemoStore.getState().setAccount(null);
    }, () => { setAuthReady(true); toast.error("Unable to restore sign-in. Please sign in again."); });
    return () => { disposed = true; unsubscribe(); };
  }, [hydrated]);
  useEffect(() => {
    const expired = () => {
      setFirebaseUser(null); useDemoStore.getState().setAccount(null);
      if (firebaseConfigured) void signOut(firebaseAuth()).catch(() => {});
    };
    window.addEventListener("heliobay:unauthorized", expired);
    return () => window.removeEventListener("heliobay:unauthorized", expired);
  }, []);
  return <AuthContext.Provider value={{ user: demoEnabled && demoAccount ? demoAccount : firebaseUser, loading: !hydrated || !authReady }}>
    <MotionConfig reducedMotion="user"><PlatformRuntime />{children}<Toaster richColors position="bottom-right" /></MotionConfig>
  </AuthContext.Provider>;
}

"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { MotionConfig } from "motion/react";
import { Toaster, toast } from "sonner";
import { useDemoStore } from "@/store/demo-store";
import { demoEnabled, firebaseAuth, firebaseConfigured } from "@/lib/firebase/client";
import type { Account } from "@/types";
const AuthContext = createContext<{ user: Account | null; loading: boolean }>({ user: null, loading: true });
export const useAuth = () => useContext(AuthContext);
export function Providers({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<Account | null>(null);
  const [authReady, setAuthReady] = useState(!firebaseConfigured);
  const hydrated = useDemoStore(s => s.hydrated); const demoAccount = useDemoStore(s => s.demoAccount);
  useEffect(() => {
    Promise.resolve(useDemoStore.persist.rehydrate()).then(() => {
      const state = useDemoStore.getState();
      if (demoEnabled && state.demoAccount) state.setAccount(state.demoAccount);
      else state.setAccount(null);
      state.setHydrated();
    }).catch(() => { useDemoStore.getState().setHydrated(); toast.error("Browser storage is unavailable. Changes may not survive refresh."); });
  }, []);
  useEffect(() => {
    if (!firebaseConfigured || !hydrated) return;
    return onAuthStateChanged(firebaseAuth(), u => {
      const account: Account | null = u ? { id: u.uid, name: u.displayName || "EV Owner", email: u.email || "", role: "owner", demo: false } : null;
      setFirebaseUser(account); setAuthReady(true);
      if (account) useDemoStore.getState().setAccount(account);
    }, () => { setAuthReady(true); toast.error("Unable to restore sign-in. Please sign in again."); });
  }, [hydrated]);
  return <AuthContext.Provider value={{ user: demoEnabled && demoAccount ? demoAccount : firebaseUser, loading: !hydrated || !authReady }}><MotionConfig reducedMotion="user">{children}<Toaster richColors position="bottom-right" /></MotionConfig></AuthContext.Provider>;
}

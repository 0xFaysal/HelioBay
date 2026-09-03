"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { onIdTokenChanged, signOut } from "firebase/auth";
import { MotionConfig } from "motion/react";
import { Toaster, toast } from "sonner";
import { useCreditStore as useDemoStore, hydrateCredits as hydrateDemoStore } from "@/store/credit-store";
import { demoEnabled, firebaseAuth, firebaseConfigured } from "@/lib/firebase/client";
import { PlatformRuntime } from "@/components/credit/runtime";
import type { Account } from "@/types";
import { backend } from "@/lib/api/backend";
import { mapUser, resourceUser } from "@/lib/api/resources";
import { isDemo } from "@/lib/config";
import { Button } from "@/components/ui/button";

const AuthContext = createContext<{ user: Account | null; loading: boolean }>({ user: null, loading: true });
export const useAuth = () => useContext(AuthContext);
export function Providers({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<Account | null>(null);
  const [authReady, setAuthReady] = useState(!firebaseConfigured);
  const [authError,setAuthError] = useState("");
  const [retry,setRetry] = useState(0);
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
    let disposed = false; let generation=0;
    const unsubscribe = onIdTokenChanged(firebaseAuth(), async u => {
      const current=++generation;
      try {
        let account:Account|null=null;
        if(u){
          if(isDemo) account={id:u.uid,name:u.displayName||"EV Owner",email:u.email||"",role:"owner",demo:false};
          else { const profile=mapUser(await backend.request("/me",resourceUser));account={id:profile.id,name:profile.name,email:profile.email,role:profile.role,demo:false}; }
        }
        if(disposed||current!==generation)return;
        setAuthError("");setFirebaseUser(account);setAuthReady(true);
        if(account)useDemoStore.getState().setAccount(account);
        else if(!useDemoStore.getState().account?.demo)useDemoStore.getState().setAccount(null);
      } catch(error) {
        if(disposed||current!==generation)return;
        setFirebaseUser(null);useDemoStore.getState().setAccount(null);setAuthReady(true);setAuthError((error as Error).message);
      }
    }, () => { setAuthReady(true); toast.error("Unable to restore sign-in. Please sign in again."); });
    return () => { disposed = true; unsubscribe(); };
  }, [hydrated,retry]);
  useEffect(() => {
    const expired = () => {
      setFirebaseUser(null); setAuthError(""); useDemoStore.getState().setAccount(null);
      if (firebaseConfigured) void signOut(firebaseAuth()).catch(() => {});
    };
    window.addEventListener("heliobay:unauthorized", expired);
    return () => window.removeEventListener("heliobay:unauthorized", expired);
  }, []);
  return <AuthContext.Provider value={{ user: demoEnabled && demoAccount ? demoAccount : firebaseUser, loading: !hydrated || !authReady }}>
    <MotionConfig reducedMotion="user"><PlatformRuntime />{authError ? <main className="container-wide py-16"><h1>Account access unavailable</h1><p role="alert" className="my-6">{authError}</p><Button onClick={()=>{setAuthError("");setAuthReady(false);setRetry(x=>x+1);}}>Retry account connection</Button><Button variant="outline" onClick={()=>void signOut(firebaseAuth())}>Sign out</Button></main> : children}<Toaster richColors position="bottom-right" /></MotionConfig>
  </AuthContext.Provider>;
}

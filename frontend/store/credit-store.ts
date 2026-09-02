"use client";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { Account } from "@/types";
import type { Snapshot } from "@/lib/credit/model";
import { snapshotSchema } from "@/lib/credit/model";
import { seed } from "@/lib/credit/seed";
import { isDemo } from "@/lib/config";

const identity = create<{ account: Account | null }>()(persist(() => ({ account: null as Account | null }), { name: "heliobay-credit-identity", storage: createJSONStorage(() => sessionStorage), skipHydration: true }));
interface State { data: Snapshot; account: Account | null; ready: boolean; loading: boolean; error: string; connection: string; setAccount: (account: Account | null) => void }
export const useCreditStore = create<State>()(persist(set => ({
  data: seed("1970-01-01T00:00:00.000Z", !isDemo), account: null, ready: false, loading: false, error: "", connection: isDemo ? "DEMO MODE" : "Connecting",
  setAccount: account => { identity.setState({ account: isDemo && account?.demo ? account : null }); set(state => ({ account, error: "", ...(!isDemo && state.account?.id !== account?.id ? {data: seed("1970-01-01T00:00:00.000Z",true), connection: "Connecting"} : {}) })); },
}), {
  name: "heliobay-credit-v3", version: 3, skipHydration: true, storage: createJSONStorage(() => localStorage),
  partialize: s => ({ data: isDemo ? s.data : seed("1970-01-01T00:00:00.000Z", true) }),
  merge: (value, current) => {
    if (!isDemo) return current;
    const parsed = snapshotSchema.safeParse((value as { data?: unknown })?.data);
    return parsed.success ? { ...current, data: parsed.data } : { ...current, error: "Saved demo data could not be validated. Do not use this browser for real financial records." };
  },
}));
export async function hydrateCredits() {
  await useCreditStore.persist.rehydrate(); await identity.persist.rehydrate();
  if (isDemo && useCreditStore.getState().data.lastTick.startsWith("1970")) useCreditStore.setState({ data: seed() });
  useCreditStore.getState().setAccount(isDemo ? identity.getState().account : null);
  useCreditStore.setState({ ready: true });
}
export async function transaction<T>(fn: (data: Snapshot) => T): Promise<T> {
  if (!isDemo) throw new Error("Demo transactions are disabled in API mode.");
  const run = async () => { await useCreditStore.persist.rehydrate(); const data = structuredClone(useCreditStore.getState().data); const result = fn(data); data.revision++; useCreditStore.setState({ data }); return result; };
  return navigator.locks ? navigator.locks.request("heliobay-credit-v3", run) : run();
}
export const useCreditData = () => useCreditStore(s => s.data);

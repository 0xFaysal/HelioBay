"use client";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { Account, NetworkData, OwnerData, PlatformSnapshot } from "@/types";
import { createOwnerData } from "@/lib/demo/seed";
import { createNetwork, emptyNetwork } from "@/lib/demo/network-seed";
import { isDemo } from "@/lib/config";
import { snapshotSchema } from "@/lib/platform/schemas";

const useTabAuth = create<{ account: Account | null }>()(persist(() => ({ account: null }), {
  name: "heliobay-tab-auth-v2", storage: createJSONStorage(() => sessionStorage), skipHydration: true,
}));

interface DemoState extends PlatformSnapshot {
  hydrated: boolean;
  demoAccount: Account | null;
  activeId: string | null;
  apiError: string;
  apiLoading: boolean;
  realtimeStatus: "demo" | "connecting" | "connected" | "disconnected" | "error";
  realtimeError: string;
  setHydrated: () => void;
  setAccount: (account: Account | null) => void;
  update: (fn: (data: OwnerData) => OwnerData) => void;
}

export const useDemoStore = create<DemoState>()(persist(set => ({
  hydrated: false, demoAccount: null, activeId: null, owners: {},
  network: isDemo ? createNetwork("1970-01-01T00:00:00.000Z") : emptyNetwork(),
  apiError: "", apiLoading: false, realtimeStatus: isDemo ? "demo" : "disconnected", realtimeError: "",
  setHydrated: () => set({ hydrated: true }),
  setAccount: account => {
    useTabAuth.setState({ account: account?.demo ? account : null });
    set(state => {
      const owners = { ...state.owners };
      if (isDemo && account?.demo && !owners["demo-owner"]) owners["demo-owner"] = createOwnerData("Alex Morgan", true, new Date(), "demo-owner");
      if (account && !owners[account.id]) {
        const data = createOwnerData(account.name, false, new Date(), account.id);
        if (!isDemo) { data.vehicles = []; data.selectedVehicleId = ""; data.savedStations = []; }
        owners[account.id] = data;
      }
      return { activeId: account?.id ?? null, demoAccount: account?.demo ? account : null, owners };
    });
  },
  update: fn => set(state => state.activeId && state.owners[state.activeId] ? {
    owners: { ...state.owners, [state.activeId]: fn(state.owners[state.activeId]) },
  } : state),
}), {
  name: isDemo ? "heliobay-demo-v1" : "heliobay-api-cache", version: 2,
  storage: createJSONStorage(() => localStorage), skipHydration: true,
  partialize: s => isDemo ? { owners: s.owners, network: s.network } : { owners: {}, network: emptyNetwork() },
  migrate: (value) => {
    const old = value as { owners?: Record<string, OwnerData>; network?: NetworkData };
    return { owners: old.owners ?? {}, network: old.network ?? createNetwork() };
  },
  merge: (value, current) => {
    if (!isDemo) return current;
    const parsed = snapshotSchema.safeParse(value);
    if (!parsed.success) return current;
    // Cross-tab hydration never changes the signed-in role.
    return { ...current, ...parsed.data };
  },
}));

export async function hydrateDemoStore() {
  await useDemoStore.persist.rehydrate();
  await useTabAuth.persist.rehydrate();
  const account = useTabAuth.getState().account;
  useDemoStore.getState().setAccount(account?.demo && process.env.NEXT_PUBLIC_DEMO_MODE === "true" ? account : null);
  useDemoStore.getState().setHydrated();
}

export function useOwnerData() { return useDemoStore(s => s.activeId ? s.owners[s.activeId] : undefined); }
export function getOwnerData(): OwnerData {
  const s = useDemoStore.getState();
  const data = s.activeId && s.owners[s.activeId];
  if (!data) throw new Error("Please sign in to continue.");
  return data;
}
export function getSnapshot(): PlatformSnapshot {
  const { owners, network } = useDemoStore.getState();
  return { owners, network };
}

// Web Locks serialize commands and ticks across same-origin tabs.
export async function demoTransaction<T>(fn: (data: PlatformSnapshot) => T): Promise<T> {
  if (!isDemo) throw new Error("Local demo mutations are disabled in API mode.");
  const run = async () => {
    await useDemoStore.persist.rehydrate();
    const data = structuredClone(getSnapshot());
    const result = fn(data);
    useDemoStore.setState(data);
    return result;
  };
  return typeof navigator !== "undefined" && navigator.locks ? navigator.locks.request("heliobay-platform-v2", run) : run();
}

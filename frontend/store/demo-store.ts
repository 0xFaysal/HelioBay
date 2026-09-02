"use client";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { Account, OwnerData } from "@/types";
import { createOwnerData } from "@/lib/demo/seed";

interface DemoState {
  hydrated: boolean; demoAccount: Account | null; activeId: string | null; owners: Record<string, OwnerData>;
  setHydrated: () => void; setAccount: (account: Account | null) => void;
  update: (fn: (data: OwnerData) => OwnerData) => void;
}
export const useDemoStore = create<DemoState>()(persist((set) => ({
  hydrated: false, demoAccount: null, activeId: null, owners: {},
  setHydrated: () => set({ hydrated: true }),
  setAccount: (account) => set((state) => ({
    activeId: account?.id ?? null, demoAccount: account?.demo ? account : null,
    owners: account && !state.owners[account.id] ? { ...state.owners, [account.id]: createOwnerData(account.name, account.demo) } : state.owners,
  })),
  update: (fn) => set((state) => state.activeId && state.owners[state.activeId] ? { owners: { ...state.owners, [state.activeId]: fn(state.owners[state.activeId]) } } : state),
}), {
  name: "heliobay-demo-v1", version: 1, storage: createJSONStorage(() => localStorage), skipHydration: true,
  partialize: (s) => ({ demoAccount: s.demoAccount, owners: s.owners }),
}));

export function useOwnerData() { return useDemoStore((s) => s.activeId ? s.owners[s.activeId] : undefined); }
export function getOwnerData(): OwnerData {
  const s = useDemoStore.getState(); const data = s.activeId && s.owners[s.activeId];
  if (!data) throw new Error("Please sign in to continue."); return data;
}

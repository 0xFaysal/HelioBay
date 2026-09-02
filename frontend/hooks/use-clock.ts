"use client";
import { useSyncExternalStore } from "react";
let currentTime = 0;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;

function subscribe(listener: () => void) {
  listeners.add(listener);
  currentTime = Date.now();

  if (!timer) timer = setInterval(() => {
    currentTime = Date.now();
    listeners.forEach(l => l());
  }, 1000);

  return () => {
    listeners.delete(listener);

    if (!listeners.size) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

export function useClock() {
  return useSyncExternalStore(subscribe, () => currentTime, () => 0);
}

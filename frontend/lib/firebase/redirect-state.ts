import { safeAuthDestination } from "./auth-routing.ts";

export const googleRedirectKey = "heliobay-google-redirect";
type StoragePort = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export function rememberGoogleRedirect(storage: StoragePort, destination: string, now = Date.now()) {
  // Only a return path and timestamp are stored, never a token or credential.
  storage.setItem(googleRedirectKey, JSON.stringify({ destination: safeAuthDestination(destination), at: now }));
}
export function pendingGoogleRedirect(storage: StoragePort, now = Date.now()): { destination: string } | null {
  try {
    const raw = storage.getItem(googleRedirectKey);
    if (!raw) return null;
    const value = JSON.parse(raw);
    if (typeof value?.destination !== "string" || typeof value.at !== "number" || now < value.at || now - value.at > 15 * 60 * 1000) {
      clearGoogleRedirect(storage); return null;
    }
    return { destination: safeAuthDestination(value.destination) };
  } catch { clearGoogleRedirect(storage); return null; }
}
export function clearGoogleRedirect(storage: StoragePort) { try { storage.removeItem(googleRedirectKey); } catch { /* Restricted storage must not hide the original sign-in error. */ } }

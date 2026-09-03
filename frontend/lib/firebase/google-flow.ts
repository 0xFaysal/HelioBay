export function firebaseErrorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string" ? error.code : undefined;
}

/** Popup must start directly in the click handler, without a network/storage await. */
export async function googleSignIn<T>(options: {
  popup: () => Promise<T>; redirect: () => Promise<unknown>; redirectReady: boolean; strategy?: "popup" | "redirect";
}): Promise<T | null> {
  if (options.strategy === "redirect") {
    if (!options.redirectReady) throw Object.assign(new Error("Same-tab Google sign-in is not configured on this domain. Allow popups for this site or use email sign-in."), { code: "auth/redirect-not-configured" });
    await options.redirect(); return null;
  }
  try { return await options.popup(); }
  catch (error) {
    if (firebaseErrorCode(error) !== "auth/popup-blocked" || !options.redirectReady) throw error;
    await options.redirect(); return null;
  }
}

export function firebaseErrorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string" ? error.code : undefined;
}

/** A single full-page OAuth flow. Never opens a window or retries automatically. */
export async function googleSignIn(options: {
  redirect: () => Promise<unknown>;
  redirectReady: boolean;
  remember: () => void;
  clear: () => void;
}): Promise<void> {
  if (!options.redirectReady) {
    throw Object.assign(new Error("Google sign-in requires this website's secure HTTPS address. Use the deployed HTTPS site or start the local server with HTTPS."), { code: "auth/redirect-not-configured" });
  }
  try { options.remember(); }
  catch {
    throw Object.assign(new Error("Browser storage is unavailable."), { code: "auth/web-storage-unsupported" });
  }
  try { await options.redirect(); }
  catch (error) {
    options.clear();
    throw error;
  }
}

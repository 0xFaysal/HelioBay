/** Only the configured Firebase project's Hosting endpoint may receive auth traffic. */
export function firebaseAuthRewrites(projectId: string | undefined) {
  if (!projectId || !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(projectId)) return [];
  return [{ source: "/__/auth/:path*", destination: `https://${projectId}.firebaseapp.com/__/auth/:path*` }];
}

export function canUseGoogleRedirect(authDomain: string | undefined, origin: string) {
  try {
    const url = new URL(origin);
    // A cross-origin Firebase iframe cannot reliably restore redirect state when
    // Safari/Firefox/Chrome partition third-party storage. Never silently use it.
    return url.protocol === "https:" && authDomain === url.host;
  } catch { return false; }
}

export function safeAuthDestination(value: string | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u0020]/.test(value)) return "/dashboard";
  return value;
}

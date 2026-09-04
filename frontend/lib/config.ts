export function resolveMode(mode: string | undefined, enabled: string | undefined): "demo" | "api" {
  // API failures never switch this choice. Missing configuration defaults to API.
  void enabled;
  return mode === "demo" ? "demo" : "api";
}
export const appMode = resolveMode(process.env.NEXT_PUBLIC_APP_MODE, process.env.NEXT_PUBLIC_DEMO_MODE);
export const isDemo = appMode === "demo";
const browserOrigin = typeof window === "undefined" ? "http://localhost:8080" : window.location.origin;
export const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") || browserOrigin;
export const wsUrl = process.env.NEXT_PUBLIC_WS_URL || `${browserOrigin.replace(/^http/, "ws")}/api/v1/realtime`;

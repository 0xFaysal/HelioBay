export function resolveMode(mode: string | undefined, enabled: string | undefined): "demo" | "api" {
  // API failures never switch this choice. Missing configuration defaults to API.
  return mode === "demo" && enabled === "true" || !mode && enabled === "true" ? "demo" : "api";
}
export const appMode = resolveMode(process.env.NEXT_PUBLIC_APP_MODE, process.env.NEXT_PUBLIC_DEMO_MODE);
export const isDemo = appMode === "demo";
export const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ?? "";
export const wsUrl = process.env.NEXT_PUBLIC_WS_URL ?? "";

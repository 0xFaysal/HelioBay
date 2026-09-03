import type { z } from "zod";

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(message: string, status = 0, code = "NETWORK_ERROR") { super(message); this.name = "ApiError"; this.status = status; this.code = code; }
}
export interface ApiClientOptions {
  baseUrl: string; token: () => Promise<string | null>; unauthorized: () => void;
  fetcher?: typeof fetch; timeoutMs?: number; envelope?: boolean;
}
export function createApiClient({ baseUrl, token, unauthorized, fetcher = fetch, timeoutMs = 8000, envelope = false }: ApiClientOptions) {
  return async function request<T>(path: string, schema: z.ZodType<T>, options: { method?: string; body?: unknown; signal?: AbortSignal; idempotencyKey?: string } = {}): Promise<T> {
    if (!baseUrl) throw new ApiError("Backend URL is not configured. Set NEXT_PUBLIC_API_BASE_URL and retry.", 0, "CONFIGURATION");
    let url: URL;
    try { url = new URL(`${baseUrl}${path}`); } catch { throw new ApiError("The configured backend URL is invalid.", 0, "CONFIGURATION"); }
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new ApiError("Use a valid HTTP(S) backend URL without credentials.", 0, "CONFIGURATION");
    const method = options.method ?? "GET";
    const attempts = method === "GET" ? 2 : 1;
    for (let attempt = 0; attempt < attempts; attempt++) {
      options.signal?.throwIfAborted();
      const controller = new AbortController();
      const abort = () => controller.abort(options.signal?.reason);
      options.signal?.addEventListener("abort", abort, { once: true });
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const bearer = await Promise.race([token(), new Promise<never>((_resolve, reject) => {
          controller.signal.addEventListener("abort", () => reject(new Error("Token request aborted")), { once: true });
        })]);
        controller.signal.throwIfAborted();
        const response = await fetcher(url, {
          method, signal: controller.signal, cache: "no-store",
          headers: { Accept: "application/json", ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}), ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}), ...(options.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : {}) },
          body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
        });
        if (response.status === 401) { unauthorized(); throw new ApiError("Your session expired. Please sign in again.", 401, "UNAUTHORIZED"); }
        const json: unknown = response.status === 204 ? null : await response.json().catch(() => { throw new ApiError("Backend returned invalid JSON.", response.status, "INVALID_RESPONSE"); });
        if (!response.ok) {
          const messages: Record<number,string> = {
            403: "This account is not allowed to perform that action. Check your role or account status.",
            409: "The bay, session or wallet changed. Refresh its status before trying again.",
            422: "The request was not accepted. Check the amount, vehicle and bay details.",
            429: "Too many requests. Wait a moment before trying again.",
            500: "The backend could not complete this request. Your browser has not assumed success.",
          };
          const detail = json && typeof json === "object" && "error" in json ? json.error : null;
          const code = detail && typeof detail === "object" && "code" in detail && typeof detail.code === "string" ? detail.code : "HTTP_ERROR";
          const message = response.status < 500 && detail && typeof detail === "object" && "message" in detail && typeof detail.message === "string" ? detail.message : messages[response.status];
          throw new ApiError(message ?? `Backend request failed (${response.status}). Please retry.`, response.status, code);
        }
        const payload = envelope && json && typeof json === "object" && "data" in json ? json.data : envelope ? undefined : json;
        const parsed = schema.safeParse(payload);
        if (!parsed.success) throw new ApiError("Backend data failed validation. No unverified values were applied.", response.status, "INVALID_RESPONSE");
        return parsed.data;
      } catch (error) {
        if (options.signal?.aborted) throw options.signal.reason ?? new DOMException("Aborted", "AbortError");
        const failure = error instanceof ApiError ? error : new ApiError(controller.signal.aborted ? "Backend request timed out. Check the connection and retry." : "Cannot reach the backend. Check the connection and retry.", 0, controller.signal.aborted ? "TIMEOUT" : "NETWORK_ERROR");
        if (attempt + 1 === attempts || failure.status > 0 && failure.status < 500 || failure.code === "INVALID_RESPONSE") throw failure;
      } finally {
        clearTimeout(timer); options.signal?.removeEventListener("abort", abort);
      }
    }
    throw new ApiError("Backend request failed.");
  };
}

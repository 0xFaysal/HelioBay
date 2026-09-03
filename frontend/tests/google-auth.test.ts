import test from "node:test";
import assert from "node:assert/strict";
import { googleSignIn } from "../lib/firebase/google-flow.ts";
import { authError } from "../lib/firebase/auth-errors.ts";
import { canUseGoogleRedirect, firebaseAuthRewrites, safeAuthDestination } from "../lib/firebase/auth-routing.ts";
import { clearGoogleRedirect, googleRedirectKey, pendingGoogleRedirect, rememberGoogleRedirect } from "../lib/firebase/redirect-state.ts";

test("Google popup starts synchronously in the user's click and returns its credential", async () => {
  let opened = false;
  const result = googleSignIn({ popup: () => { opened = true; return Promise.resolve("credential"); }, redirect: async () => assert.fail("unexpected redirect"), redirectReady: true });
  assert.equal(opened, true); assert.equal(await result, "credential");
});
test("blocked Google popup falls back once to same-tab sign-in", async () => {
  let redirects = 0;
  assert.equal(await googleSignIn({ popup: async () => { throw { code: "auth/popup-blocked" }; }, redirect: async () => { redirects++; }, redirectReady: true }), null);
  assert.equal(redirects, 1);
});
test("closing a popup, network errors and unauthorized domains never trigger another sign-in", async () => {
  for (const code of ["auth/popup-closed-by-user", "auth/cancelled-popup-request", "auth/network-request-failed", "auth/unauthorized-domain"]) {
    await assert.rejects(googleSignIn({ popup: async () => { throw { code }; }, redirect: async () => assert.fail("unexpected redirect"), redirectReady: true }), error => (error as { code: string }).code === code);
  }
});
test("cross-origin redirect is not silently used when browser storage would be partitioned", async () => {
  await assert.rejects(googleSignIn({ popup: async () => { throw { code: "auth/popup-blocked" }; }, redirect: async () => assert.fail("unsafe redirect"), redirectReady: false }), error => (error as { code: string }).code === "auth/popup-blocked");
  assert.ok(canUseGoogleRedirect("charge.example.com", "https://charge.example.com"));
  for (const origin of ["http://charge.example.com", "https://preview.example.com", "invalid"]) assert.equal(canUseGoogleRedirect("charge.example.com", origin), false);
  assert.equal(canUseGoogleRedirect("project.firebaseapp.com", "https://charge.example.com"), false);
});
test("explicit same-tab action never opens a popup and propagates redirect failures", async () => {
  assert.equal(await googleSignIn({ strategy: "redirect", popup: async () => assert.fail("popup opened"), redirect: async () => {}, redirectReady: true }), null);
  await assert.rejects(googleSignIn({ strategy: "redirect", popup: async () => "unused", redirect: async () => {}, redirectReady: false }), /not configured/);
  await assert.rejects(googleSignIn({ popup: async () => { throw { code: "auth/popup-blocked" }; }, redirect: async () => { throw Error("redirect failed"); }, redirectReady: true }), /redirect failed/);
});
test("auth helper rewrite is restricted to the configured Firebase project", () => {
  assert.deepEqual(firebaseAuthRewrites("my-project"), [{ source: "/__/auth/:path*", destination: "https://my-project.firebaseapp.com/__/auth/:path*" }]);
  for (const value of [undefined, "", "https://evil.example", "foo/../bar", "evil.example", "demo?foo=bar"]) assert.deepEqual(firebaseAuthRewrites(value), []);
});
test("redirect return path is tab-local, expiring, sanitized and contains no credentials", () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
  rememberGoogleRedirect(storage, "/charge?bay=BAY01", 1000);
  assert.deepEqual(pendingGoogleRedirect(storage, 2000), { destination: "/charge?bay=BAY01" });
  assert.deepEqual(Object.keys(JSON.parse(values.get(googleRedirectKey)!)), ["destination", "at"]);
  assert.equal(pendingGoogleRedirect(storage, 1000000), null);
  for (const path of ["//evil.example", "/\\evil.example", "https://evil.example", "/\n/evil.example"]) assert.equal(safeAuthDestination(path), "/dashboard");
  storage.setItem(googleRedirectKey, "not-json"); assert.equal(pendingGoogleRedirect(storage), null);
  rememberGoogleRedirect(storage, "/wallet", 1000); clearGoogleRedirect(storage); assert.equal(pendingGoogleRedirect(storage, 1001), null);
});
test("popup errors offer actionable recovery rather than raw Firebase errors", () => {
  assert.match(authError({ code: "auth/popup-blocked" }), /Allow popups.*email/);
  assert.match(authError({ code: "auth/unauthorized-domain" }), /exact domain/);
  assert.match(authError({ code: "auth/web-storage-unsupported" }), /storage/);
  assert.equal(authError(null), "Something went wrong. Please try again.");
});

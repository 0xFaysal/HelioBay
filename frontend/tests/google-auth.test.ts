import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { googleSignIn } from "../lib/firebase/google-flow.ts";
import { authError } from "../lib/firebase/auth-errors.ts";
import { canUseGoogleRedirect, firebaseAuthRewrites, safeAuthDestination, sameOriginAuthDomain } from "../lib/firebase/auth-routing.ts";
import { clearGoogleRedirect, googleRedirectKey, pendingGoogleRedirect, rememberGoogleRedirect } from "../lib/firebase/redirect-state.ts";

test("Google sign-in saves its destination then starts exactly one same-tab redirect", async () => {
  const calls: string[] = [];
  await googleSignIn({ remember: () => { calls.push("remember"); }, redirect: async () => { calls.push("redirect"); }, clear: () => { calls.push("clear"); }, redirectReady: true });
  assert.deepEqual(calls, ["remember", "redirect"]);
});

test("auth service contains no popup login or window-opening fallback", () => {
  const source = readFileSync(new URL("../lib/services/auth.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /signInWithPopup|window\.open/);
  assert.match(source, /signInWithRedirect\(auth, provider\)/);
});

test("HTTPS browser origin replaces a stale Firebase or Vercel auth domain", () => {
  for (const configured of ["heliobay.firebaseapp.com", "old-site.vercel.app", undefined]) {
    assert.equal(sameOriginAuthDomain(configured, "https://charge.example.com"), "charge.example.com");
    assert.equal(sameOriginAuthDomain(configured, "https://charge.example.com:8443"), "charge.example.com:8443");
  }
  for (const origin of [undefined, "not-a-url", "http://localhost:3000", "javascript:alert(1)"]) {
    assert.equal(sameOriginAuthDomain("heliobay.firebaseapp.com", origin), "heliobay.firebaseapp.com");
  }
});

test("an unsafe auth origin fails before persisting state or contacting Google", async () => {
  await assert.rejects(googleSignIn({ remember: () => assert.fail("state written"), redirect: async () => assert.fail("unsafe redirect"), clear: () => {}, redirectReady: false }), /HTTPS/);
  assert.ok(canUseGoogleRedirect("charge.example.com", "https://charge.example.com"));
  assert.ok(canUseGoogleRedirect("localhost:3003", "https://localhost:3003"));
  for (const origin of ["http://charge.example.com", "https://preview.example.com", "invalid"]) assert.equal(canUseGoogleRedirect("charge.example.com", origin), false);
  assert.equal(canUseGoogleRedirect("project.firebaseapp.com", "https://charge.example.com"), false);
});

test("unavailable browser storage prevents an unrecoverable redirect", async () => {
  await assert.rejects(googleSignIn({ remember: () => { throw Error("SecurityError"); }, redirect: async () => assert.fail("redirect without storage"), clear: () => {}, redirectReady: true }), error => (error as { code: string }).code === "auth/web-storage-unsupported");
});

test("failed redirects clear pending state, propagate the cause and allow an explicit retry", async () => {
  for (const code of ["auth/network-request-failed", "auth/unauthorized-domain", "auth/operation-not-allowed"]) {
    let calls = 0; let pending = false;
    const options = { remember: () => { pending = true; }, redirect: async () => { calls++; throw { code }; }, clear: () => { pending = false; }, redirectReady: true };
    await assert.rejects(googleSignIn(options), error => (error as { code: string }).code === code);
    assert.equal(pending, false); assert.equal(calls, 1);
    await googleSignIn({ ...options, redirect: async () => { calls++; } });
    assert.equal(calls, 2); assert.equal(pending, true);
  }
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

test("Firebase configuration errors remain actionable and are not hidden", () => {
  assert.match(authError({ code: "auth/unauthorized-domain" }), /exact domain/);
  assert.match(authError({ code: "auth/web-storage-unsupported" }), /storage/);
  assert.equal(authError(null), "Something went wrong. Please try again.");
});

import type { NextConfig } from "next";
import { firebaseAuthRewrites } from "./lib/firebase/auth-routing.ts";

const nextConfig: NextConfig = {
  // Isolate API-mode smoke builds from the regular development output.
  distDir: process.env.HELIOBAY_TEST_API === "true" ? ".next-api" : ".next",
  // Same-origin Firebase helper proxy for redirect recovery on Vercel.
  // Set AUTH_DOMAIN to the authorized site hostname, not the upstream hostname.
  async rewrites() { return firebaseAuthRewrites(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID); },
  async headers() {
    return [{ source: "/__/auth/:path*", headers: [{ key: "Cache-Control", value: "no-store" }] }];
  },
};

export default nextConfig;

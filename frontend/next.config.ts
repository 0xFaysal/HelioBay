import type { NextConfig } from "next";
import { firebaseAuthRewrites } from "./lib/firebase/auth-routing.ts";

const nextConfig: NextConfig = {
  output: "standalone",
  // Isolate API-mode smoke builds from the regular development output.
  distDir: process.env.HELIOBAY_TEST_API === "true" ? ".next-api" : ".next",
  // Same-origin Firebase helper proxy for popup-free Google sign-in on Vercel.
  // The browser uses its actual HTTPS hostname as authDomain.
  async rewrites() { return firebaseAuthRewrites(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID); },
  async headers() {
    return [{ source: "/__/auth/:path*", headers: [{ key: "Cache-Control", value: "no-store" }] }];
  },
};

export default nextConfig;

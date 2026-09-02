import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Isolate API-mode smoke builds from the regular development output.
  distDir: process.env.HELIOBAY_TEST_API === "true" ? ".next-api" : ".next",
};

export default nextConfig;

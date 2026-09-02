"use client";
import { isDemo } from "@/lib/config";
import { demoPlatform } from "./demo";
import { apiPlatform } from "./api";
import type { PlatformServices } from "./contracts";
export const platform: PlatformServices = isDemo ? demoPlatform : apiPlatform;

"use client";
import { apiBaseUrl } from "../config";
import { firebaseAuth, firebaseConfigured } from "../firebase/client";
import { createResources } from "./resources";

export const backend = createResources({
  baseUrl: apiBaseUrl ? `${apiBaseUrl.replace(/\/api\/v1$/, "")}/api/v1` : "",
  token: async () => firebaseConfigured ? await firebaseAuth().currentUser?.getIdToken() ?? null : null,
  unauthorized: () => window.dispatchEvent(new Event("heliobay:unauthorized")),
});

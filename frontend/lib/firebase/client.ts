import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};
export const firebaseConfigured = Boolean(config.apiKey && config.authDomain && config.projectId && config.appId);
export const demoEnabled = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
export function firebaseAuth() {
  if (!firebaseConfigured) throw new Error("Firebase is not configured. Use the explicit demo option, or configure Firebase in .env.local.");
  return getAuth(getApps().length ? getApp() : initializeApp(config));
}

"use client";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signInWithPopup, GoogleAuthProvider, sendPasswordResetEmail, signOut, updateProfile } from "firebase/auth";
import { firebaseAuth, firebaseConfigured, demoEnabled } from "@/lib/firebase/client";
import { demoAccounts } from "@/lib/demo/seed";
import { useDemoStore } from "@/store/demo-store";
import type { Role } from "@/types";
export const authService = {
  async login(email: string, password: string) { return signInWithEmailAndPassword(firebaseAuth(), email, password); },
  async register(name: string, email: string, password: string) { const result = await createUserWithEmailAndPassword(firebaseAuth(), email, password); await updateProfile(result.user, { displayName: name }); return result; },
  async google() { return signInWithPopup(firebaseAuth(), new GoogleAuthProvider()); },
  async forgot(email: string) { return sendPasswordResetEmail(firebaseAuth(), email); },
  demo(role: Role = "owner") { if (!demoEnabled) throw new Error("Demo mode is disabled."); useDemoStore.getState().setAccount(demoAccounts[role]); return demoAccounts[role]; },
  async logout() { if (firebaseConfigured) await signOut(firebaseAuth()); useDemoStore.getState().setAccount(null); },
};
export function authError(error: unknown) {
  const code = (error as { code?: string })?.code;
  const messages: Record<string, string> = { "auth/invalid-credential": "Email or password is incorrect.", "auth/email-already-in-use": "An account already exists with this email.", "auth/weak-password": "Choose a stronger password with at least 8 characters.", "auth/popup-closed-by-user": "Google sign-in was closed. Please try again.", "auth/too-many-requests": "Too many attempts. Please wait and try again.", "auth/network-request-failed": "Check your connection and try again.", "auth/unauthorized-domain": "This domain must be added to Firebase Authentication authorized domains." };
  return code && messages[code] || (error instanceof Error ? error.message : "Something went wrong. Please try again.");
}

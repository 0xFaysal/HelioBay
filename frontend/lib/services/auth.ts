"use client";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider,
  sendPasswordResetEmail,
  signOut,
  updateProfile,
} from "firebase/auth";

import { firebaseAuth, firebaseConfigured, demoEnabled } from "@/lib/firebase/client";
import { demoAccounts } from "@/lib/demo/seed";
import { useCreditStore as useDemoStore } from "@/store/credit-store";
import type { Role } from "@/types";
import { canUseGoogleRedirect } from "@/lib/firebase/auth-routing";
import { googleSignIn } from "@/lib/firebase/google-flow";
import { clearGoogleRedirect, pendingGoogleRedirect, rememberGoogleRedirect } from "@/lib/firebase/redirect-state";
export { authError } from "@/lib/firebase/auth-errors";

let redirectCompletion: Promise<{ destination: string } | null> | undefined;

export const authService = {
  async login(email: string, password: string) {
    return signInWithEmailAndPassword(firebaseAuth(), email, password);
  },

  async register(name: string, email: string, password: string) {
    const result = await createUserWithEmailAndPassword(firebaseAuth(), email, password);

    await updateProfile(result.user, {
      displayName: name
    });

    return result;
  },

  google(destination = "/dashboard") {
    const auth = firebaseAuth();
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    return googleSignIn({
      redirectReady: canUseGoogleRedirect(auth.config.authDomain, window.location.origin),
      remember: () => rememberGoogleRedirect(window.sessionStorage, destination),
      clear: () => clearGoogleRedirect(window.sessionStorage),
      redirect: () => signInWithRedirect(auth, provider),
    });
  },

  async completeGoogleRedirect() {
    if (!firebaseConfigured) return Promise.resolve(null);
    const pending = pendingGoogleRedirect(window.sessionStorage);
    if (!pending) return Promise.resolve(null);
    // Share only an actual completion across Strict Mode effects, not the initial
    // no-redirect visit. A cancelled attempt must not prevent a later attempt.
    return redirectCompletion ??= (async () => {
      try {
        const result = await getRedirectResult(firebaseAuth());
        if (!result) throw new Error("Google sign-in did not complete. Please try again or sign in with email.");
        return { destination: pending.destination };
      } finally { clearGoogleRedirect(window.sessionStorage); redirectCompletion = undefined; }
    })();
  },

  async forgot(email: string) {
    return sendPasswordResetEmail(firebaseAuth(), email);
  },

  demo(role: Role = "owner") {
    if (!demoEnabled)
      throw new Error("Demo mode is disabled.");

    useDemoStore.getState().setAccount(demoAccounts[role]);
    return demoAccounts[role];
  },

  async logout() {
    if (firebaseConfigured)
      await signOut(firebaseAuth());

    useDemoStore.getState().setAccount(null);
  }
};

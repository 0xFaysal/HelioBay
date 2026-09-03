import { firebaseErrorCode } from "./google-flow.ts";

export function authError(error: unknown) {
  const messages: Record<string, string> = {
    "auth/invalid-credential": "Email or password is incorrect.",
    "auth/email-already-in-use": "An account already exists with this email.",
    "auth/weak-password": "Choose a stronger password with at least 8 characters.",
    "auth/popup-blocked": "Your browser blocked the Google sign-in window. Allow popups for this site and try again, or sign in with email. If you are viewing an embedded preview, open HelioBay directly in your browser.",
    "auth/popup-closed-by-user": "Google sign-in was closed. Please try again.",
    "auth/cancelled-popup-request": "Google sign-in is already open. Complete that window or try again.",
    "auth/too-many-requests": "Too many attempts. Please wait and try again.",
    "auth/network-request-failed": "Check your connection and try again.",
    "auth/internal-error": "Google sign-in could not initialize. Retry in a regular browser tab, check that sign-in scripts are not blocked, or use email sign-in.",
    "auth/unauthorized-domain": "Google sign-in is not enabled for this website address. The site administrator must add this exact domain to Firebase Authentication authorized domains.",
    "auth/operation-not-allowed": "This sign-in method is not enabled. The site administrator must enable Google or Email/Password in Firebase Authentication.",
    "auth/web-storage-unsupported": "Sign-in needs browser storage. Open this site in a regular browser tab with site storage enabled, then try again.",
    "auth/operation-not-supported-in-this-environment": "Google sign-in cannot run in this embedded browser. Open HelioBay directly in your browser, or sign in with email.",
  };
  const code = firebaseErrorCode(error);
  return code && messages[code] || (error instanceof Error ? error.message : "Something went wrong. Please try again.");
}

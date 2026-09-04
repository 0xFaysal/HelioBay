import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import type { DecodedIdToken } from 'firebase-admin/auth';
export type TokenVerifier = (token: string) => Promise<DecodedIdToken>;
export function firebaseVerifier(projectId: string): TokenVerifier {
  const emulator = Boolean(process.env.FIREBASE_AUTH_EMULATOR_HOST);
  const app = getApps()[0] ?? initializeApp(emulator ? { projectId } : { credential: applicationDefault(), projectId });
  return token => getAuth(app).verifyIdToken(token, true);
}

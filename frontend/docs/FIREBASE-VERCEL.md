# Popup-free Google sign-in on Vercel

## Implementation

**Continue with Google** calls Firebase's full-page signInWithRedirect. There is no popup call or popup fallback. Browsers that block new windows do not prevent this flow.

On HTTPS, the Firebase client uses the page's actual hostname (including a nonstandard port) as its auth domain. It no longer depends on a stale build-time NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN value matching the Vercel hostname. The Next.js rewrite proxies all /__/auth/* requests to the configured project's Firebase Hosting auth helpers, with Cache-Control: no-store. The upstream is derived only from a validated Firebase project ID, never a visitor-supplied proxy destination.

This follows Firebase's same-origin reverse-proxy approach, avoiding third-party storage partitioning on return from Google. **It does not bypass Firebase or Google domain authorization.** Each hostname used for Google login must be authorized externally.

The flow saves only a sanitized destination and timestamp in tab-local storage. Firebase handles the OAuth state, tokens, credential exchange and user persistence. Duplicate clicks stay locked during navigation. After the return, the app waits for the auth provider to publish the real Firebase user before entering the protected destination. Failed/cancelled attempts clear the app marker and allow an explicit retry, without an automatic loop.

## Required external configuration

Use the stable production hostname or your custom domain, not a changing deployment-specific preview URL. Replace YOUR_HOST with that exact hostname, without a scheme or path.

1. **Firebase Console → Authentication → Sign-in method**: enable Google.
2. **Firebase Console → Authentication → Settings → Authorized domains**: add YOUR_HOST. Retain the existing Firebase domains.
3. **Google Cloud Console → APIs & Services → Credentials → the web OAuth client used by Firebase Google sign-in**: add this Authorized redirect URI, retaining existing URIs:

   https://YOUR_HOST/__/auth/handler

4. **Vercel → HelioBay project → Settings → Environment Variables → Production**: keep the API key, project ID and app ID for that same Firebase project. NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN can retain Firebase's supplied PROJECT_ID.firebaseapp.com value; the HTTPS browser now selects its same-origin helper automatically. Set NEXT_PUBLIC_SITE_URL=https://YOUR_HOST for canonical metadata.
5. Deploy the updated frontend. Next.js embeds public settings in the build, so environment changes also require a new deployment.

The app is in frontend/; retain that Vercel root directory. Do not put Firebase Admin private keys, OAuth client secrets or backend secrets in public variables.

If deployment protection or middleware covers auth helpers, allow /__/auth/* to operate without an application sign-in loop. A helper request must remain on the website's origin: a proxy/rewrite is correct; a 302 redirect to firebaseapp.com is not. Preview domains also need their own Firebase authorization and Google redirect URI.

## Verify production

- Open the HTTPS production site directly in your browser.
- Verify /__/auth/iframe serves Firebase helper content on the website's origin, not an app 404.
- Click **Continue with Google**: the same tab must navigate to Google, then return to the requested owner page.
- Repeat with popups blocked. No new window should be attempted.
- Refresh after login, sign out, then repeat.
- Cancel at Google and confirm a new attempt is possible.
- redirect_uri_mismatch means the URI in step 3 is missing or differs.
- auth/unauthorized-domain means step 2 is missing, or the visitor is on an unconfigured preview/custom domain.
- A helper 404/401 or deployment sign-in page means the rewrite or deployment protection needs correction.

These checks require a real Google account and access to the deployment configuration. Passing local fixtures does not certify production OAuth.

## Local development

Email and explicit demo sign-in still work over ordinary local HTTP. Popup-free Google login requires HTTPS because Firebase's browser helper URL uses HTTPS:

1. Run npm run dev -- --experimental-https (Next.js may need permission to generate/trust a local certificate).
2. Add localhost to Firebase's authorized domains.
3. Add the exact https://localhost:PORT/__/auth/handler URI to the same Google OAuth client.
4. Open the local HTTPS URL.

There is deliberately no HTTP-to-cross-origin redirect or popup workaround.

## Automated regression coverage

- npm test: redirect ordering, zero popup code, stale-domain replacement, unsafe-origin rejection, storage failures, explicit retries, restricted helper proxy, safe/expiring destinations and actionable configuration errors.
- npm run build, npm run typecheck, npm run lint: frontend build and static checks.
- With a configured local production server, set TEST_BASE_URL=http://localhost:3003 and TEST_GOOGLE_REDIRECT=true, then run npx playwright test google-auth.spec.ts.

The browser tests serve the actual frontend on a test-only HTTPS origin and run the installed Firebase SDK. They fixture only Google's helper bridge and Firebase REST responses. They verify same-tab navigation with window.open blocked, real SDK redirect-result processing, credential exchange, auth-provider synchronization, protected destination, refresh persistence, cancellation/retry, mobile overflow, and missing-domain errors. Test tokens are synthetic, never accepted by the real backend, and no test hooks are shipped in application code.

Generated Playwright traces are excluded from lint because they contain bundled third-party JavaScript.

## Deployment access limitation

The production error screenshot confirms Google's rejected request is exactly:

```text
redirect_uri=https://heliobay.vercel.app/__/auth/handler
```

The application code already uses that popup-free same-origin callback. A Google Cloud Console session was opened during verification, but the available in-app browser is not signed in; changing OAuth client settings requires the project owner's Google login. No credentials, OAuth keys or allowlists were changed automatically.

The external acceptance step is therefore precise: add `heliobay.vercel.app` to Firebase Authentication authorized domains and add `https://heliobay.vercel.app/__/auth/handler` to the Firebase-linked Web OAuth client's authorized redirect URIs, then redeploy and test. Until the account owner completes both allowlists, Google will continue to return `redirect_uri_mismatch`; no frontend retry or popup workaround can override Google's server-side rejection.

Patch checks passed: 61 frontend unit tests, the real resource-adapter full-stack browser journey, full lint, TypeScript and production builds. Real Google OAuth on the deployed domain remains an external, still-unverified acceptance check.

## References

- [Firebase redirect best practices: proxy auth requests](https://firebase.google.com/docs/auth/web/redirect-best-practices#proxy-requests)
- [Firebase Google authentication](https://firebase.google.com/docs/auth/web/google-signin)
- [Next.js external rewrites](https://nextjs.org/docs/app/api-reference/config/next-config-js/rewrites#rewriting-to-an-external-url)

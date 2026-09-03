# Google sign-in on Vercel

## What was fixed

The original Google action only used `signInWithPopup` and displayed a raw `auth/popup-blocked` error. The browser, not Vercel's server, denies a popup when its policy or embedded browser disallows it.

- Google starts directly in a user click; duplicate clicks are ignored and the button waits for auth restoration.
- A blocked popup falls back to `signInWithRedirect` **when the configured authDomain is this exact HTTPS website**.
- In that configuration, an explicit **Use Google in this tab instead** action is also available.
- Redirect completion uses Firebase `getRedirectResult`, preserves a sanitized return path and handles cancellations/errors. Only the path and a 15-minute timestamp are stored in this tab; no tokens are stored by this helper.
- Closed popups and network/configuration errors do not trigger automatic redirects.
- If same-domain redirect is not configured, a blocked popup gives actionable allow-popup/email/browser instructions instead of a broken cross-origin redirect loop.

## Required production configuration

Use a stable Vercel production hostname or your custom domain. Replace `YOUR_HOST` below with that exact hostname, without a scheme or path. Do not use a changing deployment-specific preview hostname.

1. **Firebase Console → Authentication → Sign-in method**: enable Google.
2. **Firebase Console → Authentication → Settings → Authorized domains**: add `YOUR_HOST` (retain the existing Firebase domains).
3. **Google Cloud Console → APIs & Services → Credentials → the web OAuth client used by Firebase Google sign-in**: add this Authorized redirect URI, retaining existing URIs:

   `https://YOUR_HOST/__/auth/handler`

4. **Vercel → HelioBay project → Settings → Environment Variables → Production**:

   - `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=YOUR_HOST`
   - Keep the existing Firebase API key, project ID and app ID for the same Firebase project.
   - Set `NEXT_PUBLIC_SITE_URL=https://YOUR_HOST` for canonical metadata.

5. Redeploy the frontend. Next.js embeds public configuration at build time; updating environment variables alone does not update an existing deployment.

The frontend's `next.config.ts` transparently proxies `/__/auth/:path*` to `https://PROJECT_ID.firebaseapp.com/__/auth/:path*`, with `Cache-Control: no-store`. This must be a rewrite/proxy, **not a 302 redirect**. The destination is derived from the validated configured project ID, never a visitor-supplied hostname. It does not expose backend secrets or change the existing API/authentication rules.

If your Vercel project uses Deployment Protection or future middleware, allow Firebase's `/__/auth/*` helper paths to operate without a sign-in loop. Configure a stable preview hostname separately if Google sign-in is needed on previews. The recovery flow deliberately remains disabled when a preview origin does not match the configured authDomain.

## Check the deployed fix

- Visit the production site directly in a browser, not inside a dashboard preview/iframe.
- Open `/__/auth/iframe` and verify it serves Firebase helper content on the **same site origin**, not the app's 404 or a redirect to firebaseapp.com.
- Confirm normal **Continue with Google** succeeds.
- Block popups for the site and try again: Google should open in the same tab and return to the requested owner page.
- Test **Use Google in this tab instead**, cancel/back navigation, refresh after login and logout.
- If Google reports `redirect_uri_mismatch`, verify the exact URI in step 3. `auth/unauthorized-domain` means step 2 is missing or the visitor is on a different hostname. These are separate from `auth/popup-blocked`.

Local development can retain `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=PROJECT_ID.firebaseapp.com` with `localhost` authorized in Firebase. Popup sign-in continues to work; same-domain redirect recovery is HTTPS-only. A browser that completely denies popups will offer email sign-in until the production redirect configuration is completed.

## References

- [Firebase redirect best practices: proxy auth requests](https://firebase.google.com/docs/auth/web/redirect-best-practices#proxy-requests)
- [Firebase Google authentication](https://firebase.google.com/docs/auth/web/google-signin)
- [Next.js external rewrites](https://nextjs.org/docs/app/api-reference/config/next-config-js/rewrites#rewriting-to-an-external-url)

No live account credentials or OAuth permissions were changed by the frontend patch. Hosted end-to-end Google login must be verified after the production settings above are applied.

## Patch verification

- Full frontend lint, TypeScript and production build: passed.
- Unit suite: 53 passed, including 8 Google flow/routing/state/error regressions.
- Browser smoke: public, owner and admin pages passed.
- Forced popup-block test: passed with the installed Firebase SDK and a mocked Google iframe bridge; exactly one popup attempt, actionable error, enabled retry, working email validation, and no mobile overflow or page errors. The remote helper transport is isolated in this test; it does not claim successful live Google OAuth.

To reproduce the popup SDK/UI check against a local configured server, set `TEST_BASE_URL` to its URL and `TEST_GOOGLE_POPUP=true`, then run `npx playwright test google-auth.spec.ts`. It is opt-in because public Firebase configuration is required. Run `npm test` for the deterministic suite.

The Vercel connector returned no accessible teams and no deployment link was available, so production environment variables, OAuth allowlists and deployment status were not changed or verified.

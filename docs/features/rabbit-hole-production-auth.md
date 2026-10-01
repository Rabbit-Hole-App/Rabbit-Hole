# Rabbit Hole production auth on tryrabbithole.dev

The goal: a person opens https://tryrabbithole.dev, picks Continue with Google, GitHub or email, and comes back signed in on https://tryrabbithole.dev. One origin, no split.

This document is the audit of main, the auth-side changes for that origin, and the provider, email and secret setup that still waits for an explicit go.

Read [rabbit-hole-auth-backend.md](rabbit-hole-auth-backend.md) first; it is the auth v1 contract.

## A. What main already has (audit at ce856371)

Auth v1 and the Landing sign-in are both on main. They came in through `abc32fd2`, the merge of feature/final-integration, and through cherry-picks.

| Area | Commits on main | Same as frozen |
|---|---|---|
| Auth backend | 074d36f1, b8c08390, be801051, 8564575a, c2768724 | feature/rabbit-hole-auth 29155b72 and integration/rabbit-hole-dev-auth-test 647732c8. `auth.js`, tests, `0026-users.sql` and the auth doc have no diff. |
| P0-A fail-closed CLI auth | via ecd7dd6a (infra ed2fe9c0) | |
| Landing sign-in | 813cee26 | Google and GitHub buttons, the email form and no password UI. `/sign-up` is the same screen as `/sign-in`. |
| Display identity in the app | 53407a6a, 278e7623 | Sidebar, Settings and Profile use `GET /auth/session` through `session-display.js`. |

**Nothing newer exists elsewhere:**
- feature/smart-landing-page (8a00dc59) is an ancestor of main. Its auth screen still has password fields; main replaced them.
- feature/rabbit-hole-auth has no content that main lacks.
- No old commits are replayed here.

### Already correct for one origin

- **Landing calls every auth route relatively:**
  - `/auth/<provider>/start?next=`
  - `fetch('/auth/email/start', {credentials:'same-origin'})`
  - `fetch('/auth/session')`
  - `/logout`
- **Cookies are host-only (no `Domain`) and `HttpOnly; Secure; SameSite=Lax`:**
  - `small_session`: `Path=/`, 7 days.
  - `rh_oauth`: `Path=/auth/`, 10 minutes.
- **Google:**
  - state and PKCE S256;
  - the ID token verified by jose against Google's JWKS (RS256, iss, aud, exp, iat);
  - identity is `sub`;
  - email is kept only when `email_verified`.
- **GitHub:** state and PKCE S256; identity is the numeric `id`; display is name or login.
- **No merge by email.** OAuth-only principals are `user@<id>.rabbithole.invalid`, and email inputs refuse `.invalid`.
- **Magic links:** single use (`UPDATE ... WHERE used_at IS NULL ... RETURNING`), 15 minutes. GET only shows Continue; POST spends the link.
- **Production gates:**
  - No echo, no mock provider and no `/test/*` unless `SMALL_ENV` is `test`/`dev` with the secret.
  - Echo and mock are `test` only.
  - Email failure is a 503 with no link.
- **No CORS headers anywhere,** which is right for one origin.

### Gaps found

1. **No canonical host.** The control plane builds three things from whatever host the request came in on (`index.js` `baseUrl`):
   - the OAuth `redirect_uri`;
   - the emailed link;
   - the login-CSRF reference.

   Any second hostname the Worker answers splits sessions and sends an unregistered callback to the provider: workers.dev is on by default, and `www` and plain `http` count too. **Fixed in B.**
2. **`/login` is the transitional page.** Errors, logout and the expired-link page all send people to `/login`, while Landing reads `?error=` on `/sign-in`. **Fixed in B** for the canonical origin.
3. **A `next` with a character above U+00FF** passes `safeNext` and then throws when it becomes a `Location` header. Two consequences:
   - The OAuth callback ends in `?error=unavailable`.
   - The magic-link POST ends in a 503 after the link has been spent.

   `next=/logout` or `next=/auth/...` signs you out or chains a flow right after sign-in. **Fixed in C.**
4. **`/logout` accepts `Sec-Fetch-Site: same-site`,** so any sibling subdomain could sign the user out everywhere. **Fixed in C.**
5. **`GET /auth/session` has no `Cache-Control: no-store`.** **Fixed in C.**
6. **`*.rabbithole.invalid` can still render in three places:**
   - the app proxy's 403 page (`index.js` `proxyApp`);
   - the Members people table;
   - share owners, AWS connection owners and avatar tooltips.

   **Fixed in D.**
7. **No production Worker serves Landing and auth together.**
   - Landing (`/`, `/sign-in`) is routed only by `packages/web/dev-worker.js`, and its P0-B barrier refuses `/login`, `/auth*` and `/logout`.
   - The control plane serves auth and the app but no Landing; `/` goes to `/apps`.
   - No wrangler config routes tryrabbithole.dev.

   This is Infra's topology work, not auth's. The requirements are in section F.

## B. One origin: `PUBLIC_ORIGIN`

The production Worker sets `PUBLIC_ORIGIN = "https://tryrabbithole.dev"` as a var. Dev and local Workers leave it unset, and their behaviour is unchanged.

- **Other hosts are redirected.** Sign-in routes (`/login`, `/logout`, `/auth`, `/auth/*`, `/test/*`) reached on any other host this Worker answers are sent to the same path on tryrabbithole.dev. That covers workers.dev, `www` and `http://`. A POST there is a 403.
- **Everything is built on that one origin:** the callbacks, the emailed link and the login-CSRF reference.
- **`GET /login` becomes Landing's `/sign-in`** with the same `next` and `error`. Errors, logout and the expired-link page still point at `/login`, so they reach Landing through that redirect.
- Set `PUBLIC_ORIGIN` only once that origin serves Landing; before that, `/sign-in` would be a 404.

**Production callbacks** (built as `${PUBLIC_ORIGIN}/auth/<provider>/callback`; start and code exchange send the same string):
- `https://tryrabbithole.dev/auth/google/callback`
- `https://tryrabbithole.dev/auth/github/callback`

## C. Session, cookie and origin model on tryrabbithole.dev

**Cookies.** Both are host-only (no `Domain`), so they belong to tryrabbithole.dev alone and a subdomain cannot read them.

| Cookie | Attributes | Set by | Cleared by |
|---|---|---|---|
| `small_session` | `Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800` | OAuth callback, magic-link POST | `/logout` (same attributes, `Max-Age=0`) |
| `rh_oauth` | `Path=/auth/; HttpOnly; Secure; SameSite=Lax; Max-Age=600` | `/auth/<provider>/start` | every callback outcome |

**Session.** It is a signed token `{uid, ep, prov, exp}`, valid while `ep` equals `users.session_epoch`.
- Logout bumps the epoch, which signs out every browser at once.
- `GET /auth/session` answers `401 {signedIn:false}` or `200 {signedIn, provider, display:{name,email,label}}`, always with `Cache-Control: no-store` and never with a `.invalid` value.
- Normal navigation keeps the session: the cookie is `Path=/` and `SameSite=Lax`, so a top-level return from Google or GitHub carries it.

**CSRF and origin checks:**
- **Sign-in POSTs** to `/login`, `/auth`, `/auth/email/start` and `/logout`: an `Origin` header that is present must equal `https://tryrabbithole.dev` exactly. Otherwise the answer is 403. That refuses `null`, `http://tryrabbithole.dev`, sibling subdomains and workers.dev.
- **`/logout`** proceeds only for `Sec-Fetch-Site` `same-origin`, `none` (a typed URL) or a missing header. `same-site` and `cross-site` do nothing.
- **`next`** is a printable-ASCII path on this origin:
  - no `//`, `/\`, scheme, whitespace or control characters;
  - not a sign-in route;
  - at most 1024 characters.

  Anything else becomes `/`. It is checked at start and again when used, and every redirect to it is relative.
- **Callback host validation:** the `redirect_uri` is always the canonical origin (B), and the provider rejects any URI that is not registered.

**Tests** in `packages/control-plane/test/web-auth.test.js` (section "Production origin"):
- Google and GitHub start send production callbacks, and the code exchange repeats them.
- Anchored cookie attributes, which proves there is no `Domain`.
- Other hosts are redirected; POSTs there are refused.
- `/login` becomes `/sign-in`.
- The emailed link is `https://tryrabbithole.dev/auth?token=` and is sent from `EMAIL_FROM`.
- A non-ASCII `next` and sign-in-route `next` values are dropped.
- Same-origin POSTs pass; foreign origins are refused.
- Logout revocation, with the exact cleared cookie.
- No mock provider, no `/test/session` and no echo.
- The app 403 page shows no principal.

`packages/web/src/session-display.test.mjs` fails on any raw address render in a component.

## D. Passwordless email in production

- **Link:** `https://tryrabbithole.dev/auth?token=<signed id>`. It is single use, through the `login_links` row: GET only shows "Continue as ..."; POST spends the link with an atomic `UPDATE ... RETURNING`.
- **Lifetime and limits:** 15 minutes. Per address, 3 links per 15 minutes and 10 per day.
- **Email:** subject `Your Rabbit Hole sign-in link`, plain text, sent with `POST https://api.resend.com/emails`.
- **Failure:** a missing key, a Resend error or a network error deletes the row and answers 503 "We couldn't send a sign-in email right now...". It never carries the link, `devLink` or a token. Logs show only `email send failed: status N`.
- **`EMAIL_FROM`** is passed straight to Resend as `from`. Without it the sender is `small <onboarding@resend.dev>`, which Resend only delivers to the account owner, so production needs it.

**Resend setup** (not done yet; take the DNS values from the Resend dashboard, not from here):
1. Add the sending domain in Resend: `tryrabbithole.dev`, or a subdomain such as `mail.tryrabbithole.dev` to keep the apex's reputation separate.
2. Add the DNS records Resend shows: DKIM TXT, the SPF TXT and MX for its return-path subdomain, and optionally DMARC. The tryrabbithole.dev zone is still pending (nameservers not delegated), so this waits for Infra's DNS step.
3. Turn click tracking off for that domain; it would rewrite the sign-in link.
4. Create an API key with Sending access, restricted to that domain. It becomes `RESEND_API_KEY`.
5. Set `EMAIL_FROM` to an address on the verified domain, e.g. `Rabbit Hole <signin@tryrabbithole.dev>`.

The CLI login code (`/api/cli/login`) uses the same sender. Its subject still says "small deploy".

## E. Provider changes, prepared and not applied

**Google Cloud Console**, OAuth client of type Web application:
- **Authorized redirect URIs:** add `https://tryrabbithole.dev/auth/google/callback`.
  - Keep `https://rabbit-hole-cp-dev.tryrabbithole.workers.dev/auth/google/callback` and any URI already there.
  - Local development needs none, because it uses the mock provider.
- **Authorized JavaScript origins:** not required, because no Google JavaScript runs. Adding `https://tryrabbithole.dev` does no harm.
- **Branding:**
  - home page `https://tryrabbithole.dev`;
  - privacy `https://tryrabbithole.dev/privacy` and terms `https://tryrabbithole.dev/terms`, which must be served there first;
  - authorized domain `tryrabbithole.dev`.
- **Data access:** scopes `openid` and `.../auth/userinfo.email`, which is all the code asks for (`scope=openid email`).
- **Audience:** External, published "In production". The scopes are non-sensitive, but check the console's own verification prompts.
- **Production client:** a separate one is optional. The secrets are per Worker, so production can carry its own `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`.

**GitHub.** An OAuth App has one callback URL. Its host must match, and the `redirect_uri` path must be at or under it. So create a **new production OAuth App** and leave the dev app alone:
- Application name: Rabbit Hole
- Homepage URL: `https://tryrabbithole.dev`
- Authorization callback URL: `https://tryrabbithole.dev/auth/github/callback`
- Enable Device Flow: off
- No scopes are requested; sign-in reads the public profile and its numeric `id` only.

## F. Production Worker requirements (Infra)

Auth is ready for any topology that keeps one origin. Infra owns these:
1. **One origin.** One Worker answers https://tryrabbithole.dev for Landing, the sign-in routes and the app.
   - Landing: `/`, `/sign-in`, `/sign-up`, `/check-email`, `/privacy`, `/terms`.
   - Sign-in routes: `/login`, `/logout`, `/auth`, `/auth/*`, through `handleWebAuth`.
   - The app: `/apps`, `/api/*`.
   - If a web Worker fronts the control plane, it must forward those routes with the original `Request`; rewriting the URL breaks callbacks, links and the CSRF check. The P0-B barrier is dev-only and must not run in production.
2. **Vars:**
   - `SMALL_ENV=production`
   - `PUBLIC_ORIGIN=https://tryrabbithole.dev`
   - `BASE_URL=https://tryrabbithole.dev`, which runners use; legacy `small-cp` still points at zeroshothq.

   Also `workers_dev: false`; PUBLIC_ORIGIN redirects anyway. Turn on Always Use HTTPS and HSTS on the zone.
3. **Never set in production:** `TEST_BYPASS_SECRET`, `OAUTH_MOCK` or `SMALL_TEST_BYPASS`.
4. **`/` conflict:** the control plane sends `/` to `/apps`; Landing wants `/`.
5. **Landing in the production build:** `vite.config.js` builds the Landing pages only under `VITE_COACHING_DEV=true`.
6. **D1:** `0025-cli-login-challenges` and `0026-users` must be applied first. Sessions minted before `users` existed are void at deploy.
7. **Risk, P0 before any shared origin: app proxy `/a/<org>/<app>/`.**
   - `index.js` `proxyApp` serves deployed apps on the same origin with no sandbox, so their JavaScript could call `/api/*` and `/logout` with the viewer's cookie.
   - Do not route `/a/*` on tryrabbithole.dev, or isolate it (separate origin, or `Content-Security-Policy: sandbox`).
8. **Known risk, not changed:** `/api/*` mutations have no `Origin` check. They rely on `SameSite=Lax` and the absence of CORS. That holds on one origin with no untrusted sibling subdomains. Add a same-origin check if a subdomain ever hosts untrusted content (for example a notebook origin).
9. **Dev notebook origins hard-coded in the web app:** `packages/web/src/learn-notebook.js:7` and `packages/web/src/LearnExtras.jsx:45`.

## Secrets and vars for the production Worker (names only)

| Name | Kind | Note |
|---|---|---|
| `MASTER_KEY` | secret | New for production; signs sessions, flow cookies and links |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | secret | Google button hidden without both |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | secret | Production OAuth App (E) |
| `RESEND_API_KEY` | secret | Email sign-in is a 503 without it |
| `EMAIL_FROM` | secret or var | Address on the Resend-verified domain |
| `PUBLIC_ORIGIN` | var | `https://tryrabbithole.dev` |
| `SMALL_ENV` | var | `production` |
| `BASE_URL` | var | `https://tryrabbithole.dev` (runners) |

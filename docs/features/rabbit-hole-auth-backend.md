# Rabbit Hole web authentication v1 (backend)

Web sign-in is **Continue with Google**, **Continue with GitHub** and **Continue with email**.
Email sign-in is passwordless, and there are no passwords anywhere: no hashes, no reset flow and no strength rules.
The CLI keeps its own code flow (`/api/cli/login` and `/api/cli/verify`), which is unchanged.

This branch starts from `hotfix/auth-fail-closed` (e7b4e72c) and keeps every P0-A property:
- production never shows a link, code, session or test session;
- `SMALL_ENV` gates every bypass;
- the CLI challenge is stored server-side.

The code is in `packages/control-plane/src/auth.js`. The tests are `test/web-auth.test.js` and `test/auth-fail-closed.test.js`.

## Data model (migration 0026)

- **`users (id, email UNIQUE, session_epoch, created_at)`**
  - `email` is the *principal*: the key every app, share and org row already uses.
  - An email sign-in sets it to the proven address.
  - A user who has only signed in with Google or GitHub gets `user@<id>.rabbithole.invalid`: a private org, and no inherited access.
- **`user_identities (provider, provider_user_id) PK → user_id`**
  - The key is the provider's immutable id: the Google `sub`, the GitHub numeric `id`, or the address itself for `email`.
  - `provider_email` is information only and never a lookup key.
- **`login_links`** holds the single-use web sign-in links.

**No silent merge.** Suppose Google or GitHub reports `a@corp.com` and an email user `a@corp.com` exists. The OAuth sign-in still creates a separate user.
- Linking accounts is a deferred, explicit flow: a signed-in user connects another provider.
- Nothing in the schema blocks it: add a `user_identities` row pointing at the current user.
- `.invalid` addresses are refused by every email input, so no one can claim an OAuth-only principal through email sign-in.

## Routes

| Route | Method | What it does |
|---|---|---|
| `/login?next=&error=` | GET | Transitional sign-in page, until Landing replaces it. Shows a provider button only when that provider is configured. |
| `/login?next=` | POST form `email` | Sends a sign-in link, then shows "Check your email". |
| `/auth/email/start` | POST JSON `{email, next}` | The same flow as JSON, for Landing. |
| `/auth/session` | GET | Display identity for the frontend (see below). It never returns the internal principal. 401 `{signedIn:false}` when signed out. Always `Cache-Control: no-store`. |
| `/auth?token=` | GET | Shows "Continue as <email>". It does **not** spend the link, so mail scanners are safe. |
| `/auth` | POST form `token` | Spends the link once and signs in. Redirects to the safe `next`. |
| `/auth/google/start?next=` | GET | Redirects to Google with state and PKCE S256. |
| `/auth/google/callback` | GET | Checks the state, exchanges the code, signs in. |
| `/auth/github/start?next=` | GET | The same for GitHub. |
| `/auth/github/callback` | GET | The same for GitHub. |
| `/logout` | GET/POST | Revokes every session of the user, clears the cookie, redirects to `/login`. |
| `/test/session` | POST | Test instances only, unchanged. It now creates the user row. |
| `/test/oauth/authorize` | GET | Mock provider. Only when `SMALL_ENV=test`, `TEST_BYPASS_SECRET` is set and `OAUTH_MOCK=true`. Never on dev. |

## Flows

**Google**
- Scope: `openid email`.
- The `id_token` gets full verification with `jose` (`jwtVerify`), even though it comes straight from Google's token endpoint:
  - the RS256 signature is checked against Google's published keys (`jwks_uri` from Google's OIDC discovery, `https://www.googleapis.com/oauth2/v3/certs`);
  - `iss` must be Google's, `aud` must be our client ID, and `exp` and `iat` are required, with `exp` in the future;
  - any other algorithm, including `none` and `HS256`, is refused.
- Keys are cached per isolate. A token naming an unknown `kid` triggers a refetch (key rotation), limited to one refetch per 30 seconds.
- Identity is `sub`.
- `email` is kept only when `email_verified` is true, and only as information.

**GitHub**
- No scope: public profile only.
- PKCE S256 (`code_challenge`, `code_challenge_method=S256`, then `code_verifier` in the code exchange). GitHub's OAuth App documentation supports it.
- Code exchange, then `GET /user`.
- Identity is the numeric `id`.
- `email` may be null, and nothing depends on it.

**State.** `/start` sets `rh_oauth`, a signed, HttpOnly, `Path=/auth/`, 10-minute cookie. It holds `{provider, state, PKCE verifier, safe next}`.
- The callback refuses the request, before any provider call, when:
  - the cookie is missing, expired or tampered;
  - the cookie belongs to another provider;
  - the `state` does not match.
- The cookie is cleared on every callback.

**Email**
- `login_links` row limits per address: 3 per 15 minutes and 10 per day.
- There is no domain cap: a 128-bit link can't be guessed, and a gmail.com cap would lock out every Gmail user.
- A D1 error or an undelivered email fails closed with a generic 503 and removes the row.
- Only `SMALL_ENV=test` instances with the bypass secret echo the link. The public dev control plane (`SMALL_ENV=dev`, rabbit-hole-cp-dev) fails closed like production.

**Test gates (locked):**
- Echoing a credential or link (CLI `devCode`, the web dev link, `devLink`): `SMALL_ENV=test` only.
- The mock OAuth provider: `SMALL_ENV=test` only.
- `/test/session`: test or dev, always gated by the secret.

**Errors** return to `/login?error=<code>&next=<safe next>`, where code is one of:
- `unavailable`: the provider is not configured, or D1 is down;
- `cancelled`: the user denied access at the provider;
- `expired`: bad or missing state;
- `provider`: the code exchange or profile call failed.

The logs carry statuses and provider error codes only, never tokens.

## Sessions

- A session is `{t:'sess', uid, email, ep, exp}`, signed, 7 days, in cookie `small_session` (HttpOnly, Secure, SameSite=Lax).
- It is valid only while `ep` equals `users.session_epoch`.
- `sessionOf` reads D1 once per request. A D1 error counts as no session.
- Sessions from before this change carry no `uid`. They are void, so everyone signs in once after deploy.
- Logout bumps the epoch, which means **sign out everywhere**. There is no per-device logout yet.
- A logout from another site or a sibling subdomain (`Sec-Fetch-Site` `cross-site` or `same-site`) does nothing. Only `same-origin`, `none` (a typed URL) or no header proceed.

**`next`** accepts only a same-site path (`safeNext`). `//host`, `/\host`, schemes, whitespace, control and non-ASCII characters all become `/`. So do the sign-in routes themselves (`/login`, `/logout`, `/auth*`, `/test/*`), so `next=/logout` cannot sign someone out right after sign-in. It is checked when the flow starts and again when it is used.

**Login CSRF.** A POST to `/login`, `/auth`, `/auth/email/start` or `/logout` with a foreign `Origin` gets a 403.

## Display identity (frontend contract)

The display identity is not the principal. The frontend shows only what `GET /auth/session` returns:

```json
{ "signedIn": true, "provider": "google" | "github" | "email",
  "display": { "name": "Octo Cat" | null, "email": "a@corp.com" | null, "label": "Octo Cat" } }
```

- **Google:** `email` is set only when Google marked it verified. There is no `name`: the scope is `openid email`.
- **GitHub:** `name` is the profile name, or the login when there is no name. `email` is set only when the account's email is public.
- **Email:** `email` is the signed-in address.
- **`label`:** always present. It is `name`, else `email`, else "Google user", "GitHub user" or "Email user".
- The metadata is refreshed at each sign-in.
- A value ending in `.invalid` is never returned.
- The UI must never render `user@<id>.rabbithole.invalid` or the org slug derived from it. For example, the dashboard Settings reads `email` from `/api/apps`, which is the principal.

## Landing integration contract

Landing lives on the same worker origin, and cookies are host-only.
- **Continue with Google:** navigate the whole page to `/auth/google/start?next=<encodeURIComponent(path)>`.
- **Continue with GitHub:** navigate the whole page to `/auth/github/start?next=<encodeURIComponent(path)>`.
- **Continue with email:** same-origin `fetch('/auth/email/start', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({email, next})})`.
  - `200 {ok:true}`: show "Check your email. We sent you a secure sign-in link." Never show anything else.
  - `400 {error}`: invalid address.
  - `429 {error}`: too many links requested.
  - `503 {error}`: show `error` as it is.
  - `SMALL_ENV=test` instances add `devLink`; dev never does.
- **`next`:** carry the `next` from the sign-in page's own query into all three.
- **Errors:** on a Worker with `PUBLIC_ORIGIN` set, `GET /login` redirects to Landing's `/sign-in` with the same query string. Elsewhere it is still the transitional page. The sign-in page shows the message for `error`:
  - unavailable: "That sign-in option isn't available right now. Try another one."
  - cancelled: "Sign-in was cancelled."
  - expired: "That sign-in attempt expired. Try again."
  - provider: "We couldn't finish signing you in. Try again."
- **Sign out:** navigate to `/logout`.
- **Who is signed in:** `GET /auth/session` (same origin, cookies included). Show `display.label`. Never render a `*.rabbithole.invalid` value.
- **Owned by the backend; Landing must not claim these paths:** `/login`, `/logout`, `/auth`, `/auth/*`, `/test/*`.
- **Landing removes:**
  - the password fields;
  - `/forgot-password`, `/reset-password`, `/password-updated`;
  - the password copy on `/check-email`.

  `/sign-up` is the same screen as `/sign-in`, because the first sign-in creates the user.

## Configuration

Set these as secrets per environment. They are never committed.
- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` (a Google Cloud OAuth client of type Web application).
- `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` (a GitHub OAuth App; it allows one callback URL, so use one app per environment).

Redirect URIs to register for each host:
- `https://<host>/auth/google/callback`
- `https://<host>/auth/github/callback`

The email sign-in still needs `RESEND_API_KEY` and `EMAIL_FROM`, in the P0-A rollout order.

`PUBLIC_ORIGIN` is a var, not a secret, set only on the Worker that serves Landing and sign-in at that origin. Production uses `https://tryrabbithole.dev`; leave it unset on dev and local Workers.
- Sign-in routes (`/login`, `/logout`, `/auth*`, `/test/*`) reached on any other host are redirected there. GET goes to the same path; POST is refused with a 403.
- The callbacks, the emailed link and the CSRF check therefore always use that one origin.
- `/login` becomes `/sign-in`, so do not set it before that origin serves Landing.
- See [rabbit-hole-production-auth.md](rabbit-hole-production-auth.md).

## Local development

No real credentials are needed. `packages/control-plane/.dev.vars` is gitignored:

```
SMALL_ENV=test
MASTER_KEY=<any local string>
TEST_BYPASS_SECRET=<any local string>
OAUTH_MOCK=true
```

It must be `SMALL_ENV=test`: with `dev`, the mock provider and the dev link are both off, the same as on rabbit-hole-cp-dev.

1. Build the web shell, because the worker imports `../web/dist/index.html`.
2. Load the local D1: `npx wrangler d1 execute small --local --file=schema.sql`.
3. Start the worker: `npx wrangler dev`.

At `/login`:
- Continue with Google or Continue with GitHub opens the mock provider form.
- Continue with email shows the dev link.

## Deferred

- **Explicit account linking:** "connect Google" while signed in, and "prove this email" for an OAuth-only user.
- **Dashboard display:** the existing dashboard still renders the principal (`/api/apps` `email`) in Settings (`Sidebar.jsx`, the account row and "Home workspace"). It must switch to `/auth/session` before Google or GitHub users reach it.
- **Sharing:** an OAuth-only user can't be shared with by their provider email until linking exists.
- **Per-device session revocation.**

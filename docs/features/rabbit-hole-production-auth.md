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

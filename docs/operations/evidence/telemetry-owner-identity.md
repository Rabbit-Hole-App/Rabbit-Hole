# How production decides "owner" for the Telemetry dashboard: verified from code

Written 2026-10-26 11:30 AM PT, lane telemetry-accept. Code read on `rabbit-hole/stack/c21-telemetry` (29e70faa); `owner-guard.js`, `auth.js` `loginEmail` and `subscription-transport.js` are byte-identical to `rabbit-hole/main` 0bd390ed. Nothing here touched production; no credential, `.env` or secret value was read.

## 1. BLOCKER found: the reviewed procedure cannot make the owner an owner with the code as it is

**Claim.** With `owner-guard.js` as it is on main and on c21, a Google or GitHub sign-in on production can never be the owner, whatever `SUBSCRIPTION_OWNER_EMAIL` holds. P9 step 1 (the owner's access body) will answer 404 and `prod-telemetry.sh` will stop with "P9 owner access mismatch".

**Why (every link is code):**

1. `packages/web/dev-worker.js:189` sends every `/api/owner/telemetry*` path to `ownerTelemetryRoute` (`owner-telemetry-routes.js:65`), whose first statement is `ownerOnly(req, env)`. `app-worker.js` adds no owner route of its own (a test asserts it). The page `/owner/telemetry` is the SPA shell; its content comes only from that API (it prints "Not found." on a 404).
2. `ownerOnly` (`owner-guard.js`):
   - configured owner = `normal(env.SUBSCRIPTION_OWNER_EMAIL)`: the Worker secret named `SUBSCRIPTION_OWNER_EMAIL` on `rabbit-hole-app`. Null means unconfigured and every caller gets 404 before any session read.
   - caller identity = `devIdentity` (`dev-forwarding.js:42`): `env.CONTROL_PLANE.fetch('/api/me')` with the request's cookie. The email is `me.email`, which is `user.email` of the signed session (`index.js:2505`), i.e. the `users.email` column. A body, query, header or cookie value is never read for identity.
   - match = `normal(user.email) === owner`, where `normal` = `loginEmail(value)` for strings.
3. For a Google or GitHub sign-in `users.email` is the application principal `user@<32 hex>.rabbithole.invalid` (`auth.js` `userFor`: `provider === 'email' ? providerUserId : \`user@${id}.rabbithole.invalid\``).
4. `loginEmail` (`auth.js:31`) ends with `&& !email.endsWith('.invalid')`: ".invalid ... is refused: it marks Google/GitHub-only principals".
5. So `normal('user@dda2350771a4066e3080c605ba092e0a.rabbithole.invalid')` is `null`, on BOTH sides:
   - secret = the principal: `ownerEmail(env)` is null, `ownerOnly` returns null before it reads a session.
   - secret = the Gmail address: the owner is `yudhisteer.chin@gmail.com`, but the session email normalizes to null, which is not equal. 404.
   Executed to confirm (plain node over the same regex and function): the principal normalizes to `null`; `yudhisteer.chin@gmail.com` normalizes to itself.
6. The existing unit tests agree: `owner-guard.test.js` asserts the configured value `owner@example.invalid` fails closed for everyone. No test uses a principal-shaped owner. (The activation package and README say so: "the earlier fixtures used the Gmail address and did not cover this production identity shape".)

The reviewed script and its README assume `owner-guard.js` "is unchanged" and that the principal works. That assumption is false in code. The script itself is correct to refuse the Gmail value; what is missing is guard support for the principal. The re-review (verdict YES) covered the script, not this code path.

**The only secret value that works today** is a plain address equal to what `/api/me` returns for the caller, which can only be an email-provider (passwordless link) account, whose principal is the address itself. That would make the owner use a second account, contradicting "the owner signs in with Google". Not recommended; see option B2 in section 6.

**Proposed fix (not applied; for the integrator).** `C:/s/spec/telemetry-accept/owner-guard-principal.patch`: `owner-guard.js` also accepts the exact shape `^user@[0-9a-f]{32}\.rabbithole\.invalid$` (after trim and lowercase), on both the configured and the session side; everything else still goes through `loginEmail`. Two tests added. Evidence (run on an extract of c21 in the scratchpad, not on a branch):
- `git apply --check` succeeds on c21's files.
- `node --test test/owner-guard.test.js`: 13 pass, 0 fail with the patch.
- Negative control: the same 13 tests on the old guard: 11 pass, 2 fail (the two new ones).
- `owner-telemetry*.test.js` still pass with the patch. A wider run (owner-*, telemetry-*, learn-usage-route) shows 15 failures that are identical with and without the patch (my extract omitted fixtures); they are not caused by the patch. The full `packages/control-plane` suite and `verify` were NOT run: the integrator runs them on the real branch.
- It does not widen who can be the owner: see section 4.

## 2. Which secret, which identity value, principal versus Gmail

| Question | Answer (code) |
|---|---|
| Which secret decides | `SUBSCRIPTION_OWNER_EMAIL`, a Worker secret on `rabbit-hole-app` in production (not a var: the prod config test refuses it as a var). On dev it is a var in `wrangler.dev.jsonc` set to the Gmail address (the dev preview signs in through the Access bridge with a real email principal). |
| Which identity is compared | `/api/me` `email` of the session = `users.email`. On production for a Google sign-in this is the principal, not the Gmail. `provider_email` (the Gmail) is display metadata only and never compared. |
| Is it affected by `SUBSCRIPTION_ONLY`? | No for the telemetry guard (unconditional by design). The same secret is also read by `subscriptionOwnerRefusal` / `ownerEmailMatches` but only when `SUBSCRIPTION_ONLY === 'true'`. |
| Value the owner is expected to hold | the principal `user@dda2350771a4066e3080c605ba092e0a.rabbithole.invalid` (stated by the owner and recorded in `prod-telemetry.sh` `OWNER_PRINCIPAL`). I did not verify it against production data (no production read allowed); the access answer in section 3 is the verification. `principal = user@<users.id>`, so the owner's `users.id` is `dda2350771a4066e3080c605ba092e0a`. |

## 3. We cannot read the preserved secret; the verification path that needs no guess

- **Not readable.** The script lists secret NAMES only (`wrangler secret list --name rabbit-hole-app --format json`, `p6`); Cloudflare never returns a secret value; the script has no read path and no overwrite path for it (an existing name is SKIPPED, `mark P6 present`). No agent in this lane read it and none can. Its value stays unknown to us.
- **Verification by behaviour (what P9 does).** In a browser signed in with Google as the owner, open `https://digrabbithole.com/api/owner/telemetry/access`. Pass: HTTP 200 and the body exactly `{"owner":true,"configured":true,"environment":"production"}`. Everyone else (signed out, `yudhisteer.chin01`, any other account) gets the plain-text 404 `Not found`.
- **Second, independent proof of WHO (read-only, after the first owner visit).** Each authorized request writes `owner_access_log.user_ref = users.id` (`owner-telemetry-routes.js`; refused requests are never written). A read-only query of the production telemetry D1 (`deployed-acceptance.md` A4) must show exactly one distinct `user_ref`, equal to `dda2350771a4066e3080c605ba092e0a` (derived from the principal; `auth.js` makes the principal `user@<users.id>`). This proves the identity that passed was the owner's account without reading the secret.
- No identity is guessed: neither Gmail address is ever typed into a secret by this procedure (the script refuses both Gmail addresses).

## 4. Where an allowlist could widen (checked)

| Place | Can it widen? |
|---|---|
| `ownerOnly` comparison | Single string, whole-string equality after `loginEmail` normalization. A list (comma, space, newline) fails `loginEmail`, so a malformed value fails closed for everyone (tested). Case and spaces fold; a different local part (`chin01`), plus tag, dot or domain is another account. |
| The proposed patch | Adds one shape only. Widening would require someone to hold a session whose `users.email` equals the configured principal: only that Google account does (the principal embeds a random 16-byte id; the email-link sign-in refuses `.invalid`; a provider email never becomes a principal; the session is signed by `MASTER_KEY`). Other principals, wrong lengths, uppercase hex variants beyond lowercase folding, suffixes and lists are denied (tested). If the secret were set to some other principal, THAT account becomes the owner: the secret's value is the whole authority, as today. |
| `prod-telemetry.sh` P6 | Accepts only the exact `OWNER_PRINCIPAL`; and only when the secret is absent. |
| `IMAGE_ACCEPTANCE_EMAILS`, `MOTION_ACCEPTANCE_EMAILS` (`wrangler.rabbit-hole-prod.jsonc`) | Separate allowlists for image and Motion acceptance, not the telemetry guard. Both list the principal AND `yudhisteer.chin@gmail.com`. For a Google sign-in the Gmail entry never matches (the session email is the principal). It would match a passwordless-email account with that Gmail address if that sign-in exists. Nothing in this lane changes them; noted only. |
| `ownerEmailMatches` (`subscription-transport.js`) | Raw equality, no normalization, consulted only when `SUBSCRIPTION_ONLY === 'true'`. Production config has no such var and the config test forbids it as a var; whether a `SUBSCRIPTION_ONLY` secret exists on the worker is unknown to me (a names-only `secret list` answers it; command in section 5, item 5). If it did, all those routes would be owner-only. |
| Do not "fix" by putting the Gmail into the secret | It would match only an email-provider session as that address, i.e. a second account; and it would not make the Google owner the owner. |

## 5. If the owner's access answer is 404 (script behaviour and diagnosis)

**Script.** `p9`: the pasted body must equal the exact string above. Otherwise it records a failure, prints "MISMATCH ... This script does NOT fix it and never replaces SUBSCRIPTION_OWNER_EMAIL ... A SEPARATE corrective action is needed", and calls `die` (exit 1). Nothing is replaced; no secret change; `P9-owner` is not recorded. Before that it has already written `CANDIDATE` and `GATE` pins to the state file (see the pin warning in `owner-commands.md`).

**Diagnose, in this order (stop at the first that explains it):**

1. Is it the guard code in section 1? If the released commit does not contain the principal fix, it explains the 404 completely. Check: `git grep -n PRINCIPAL packages/control-plane/src/owner-guard.js` on the released SHA.
2. Is the Telemetry code live at all? `GET /api/owner/telemetry/access` as the owner must not be the plain 404 for a route that does not exist yet; before release the answer is 404 for everyone. Confirm the release run and commit (`deploy-prod.yml`).
3. Is the session the owner's Google account (not chin01, not an email-link account)? `/api/me` in that browser shows the principal.
4. Does `devIdentity` refuse it? It answers null without `org` and `email` ("Workspace membership required", 403). A Google user's home org is the principal's domain part, so this should not happen; only after item 1 is ruled out.
5. Does the secret exist and what else reads it? Names only (run in a second terminal; prints secret NAMES, never values; NOT RUN; same isolation as `q` in `deployed-acceptance.md`): define `q` there, then use the block below. Look for `SUBSCRIPTION_OWNER_EMAIL` (expected) and `SUBSCRIPTION_ONLY` (unexpected). Consumers to inspect: `owner-guard.js` (`ownerEmail`, `ownerOnly`), `subscription-transport.js` (`ownerEmailMatches`, `subscriptionOwnerRefusal`), `learn-next-steps-routes.js:190` (`sharedNextSteps` via `subscriptionOwnerRefusal`), and the other callers of `subscriptionOwnerRefusal`: `cad-jobs.js`, `chat-capability-route.js`, `learn-artifact.js`, `learn-attempt-routes.js`, `learn-board.js`, `learn-coaching-routes.js`, `learn-codebase-source-map.js`, `learn-grade-routes.js`, `learn-inline.js`, `learn-journey.js`, `learn-progress.js`, `learn-shared-ask.js`, `learn-tutor-routes.js`, `learn-voice-routes.js`, `repositories.js`, `dev-worker.js:260`. All of these except `ownerOnly` act only when `SUBSCRIPTION_ONLY === 'true'`.

```bash
qs() ( set -e; d=$(mktemp -d); cd "$d"; printf '{"name":"read-only"}\n' > none.jsonc; : > empty.env
  E=C:/Users/cyudhist/Desktop/workspace/small-deploy/.env
  v() { grep -m1 "^$1=" "$E" | cut -d= -f2- | tr -d '\r' | sed -e "s/^['\"]//" -e "s/['\"]\$//"; }
  export CLOUDFLARE_API_TOKEN="$(v CLOUDFLARE_API_TOKEN)" CLOUDFLARE_ACCOUNT_ID="$(v CLOUDFLARE_ACCOUNT_ID)"
  node C:/s/spec/telemetry/vendor/wrangler-4.150.0/node_modules/wrangler/bin/wrangler.js secret list --name rabbit-hole-app --format json --config none.jsonc --env-file empty.env )
qs
```

6. Replace or delete the secret only as a SEPARATE, owner-approved action after 1 to 5 (D4 preserves the existing secret).

## 6. Options and recommendation (owner decision G1)

| Option | What | Effect |
|---|---|---|
| B1 (recommended) | Land the principal patch on main as its own reviewed commit; gate and release it. | Owner passes P9 with the existing secret IF it holds the principal. If it holds something else, P9 still answers 404 and a separate secret decision is needed. |
| B2 | No code change; owner signs in by passwordless email as the Gmail address and the secret is the Gmail. | Second account, contradicts the production owner decision, needs the secret replaced (D4 says preserve), unknown value. Not recommended. |
| B3 | Ship collection without the owner dashboard for now (dashboard 404 for everyone). | Safe, but the work is not accepted: no owner can read anything. |

Recommendation: B1. Either order works (release c21 first or the fix first); see `owner-commands.md` section 0 for the state-pin hazard that decides the order.

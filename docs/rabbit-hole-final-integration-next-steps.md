# Rabbit Hole — Final Integration Next Steps

## Status

This document is the handoff for the **Parallel/Learn agent**, which currently owns `feature/final-integration`.

### Current source branches

```text
Home
origin/feature/smart-home
c4387229

Learn cleanup
origin/feature/learn-cleanup
24f2c332d7088ce9241726fdfca5b8c63143f585

Cards
origin/feat/canvas-block-conversations
36382c37edc51da94a2480b8a8af210ef9c53004
```

### Current integration branch

```text
feature/final-integration
HEAD: 535b24a2
```

Current merge state already includes:

```text
Home
+ Learn cleanup
+ Cards
```

The known Cards conflicts have already been resolved and independently verified.

---

# Important product decision

**Usage/Credits is paused.**

Do **not** implement the Usage/Credits v1 work now.

The only work we still require from that branch before the new baseline can land is:

```text
Privacy P0
```

Specifically:

```text
User A connects a repository/project.

User B, who happens to share the same email domain/org,
must NOT be able to:

- list it;
- open it;
- @mention it in a question;
- create a canvas inside it.
```

The Privacy P0 fix will be implemented separately on:

```text
feature/usage-credits
```

as isolated commits.

Only those privacy commits will later be brought into:

```text
feature/final-integration
```

Do **not** merge the unfinished Usage/Credits branch.

---

# Phase 1 — Finish the current integration QA

The user already approved deployment of the final-integration review clone.

Use:

```text
small-cp-dev-final-integration
```

with the model stubbed as already planned.

Do not deploy production.

Run the complete browser/product verification.

## Learn checks

```text
learn-chat-sheet
chat-card-placement
canvas-landing-sweep
rabbit-hole-check
grade-shadow-check
```

## Cards checks

```text
board-interaction-check
card-sources-check
nanogpt-board-check
canvas-toolbar-check
subcard-captures
```

## Product journeys

Verify:

```text
Home
→ Project
→ Overview
→ Map
→ select CausalSelfAttention
→ ask
→ Learn this
→ card
→ practice
→ notebook
→ back to Map
```

Also verify:

```text
Library → Canvas → Learn
Library → App/Job
standalone canvas
project-owned canvas
mobile
dark mode
immersive Learn has no persistent left rail
shared composer parity
Map conversation persistence
artifact generation
notebook startup/persistence/isolation
card sources
practice
depth ladder
no live writes
dev storage isolation
production bundle boundaries
```

Fix only genuine integration regressions.

Do not reopen approved product areas for minor polish.

---

# Phase 2 — Cards render-freshness issue

The current integration has:

```text
make test-unit:
1298 / 1299 node
31 / 31 python

render-freshness:
1 failing check
```

The same render-freshness failure reproduces on the pushed Cards branch itself, so it is not caused by the integration merge.

Cards owns the fix.

The Cards agent has been asked to investigate the stale benchmark fingerprints and, if appropriate:

```text
regenerate only the 10 stale benchmark PNGs
run render-freshness
run directly affected card visual checks
inspect changed screenshots
commit only the freshness fix
push
report the commit SHA
```

When Cards supplies a reviewed fix:

1. cherry-pick **only that Cards freshness commit** into `feature/final-integration`;
2. rerun:
   ```text
   render-freshness
   relevant Cards checks
   make test-unit
   ```
3. verify no visual regression.

Do not independently redesign cards or regenerate unrelated baselines.

---

# Phase 3 — Include the deferred motion documentation

Two approved documentation commits belong in the final baseline:

```text
58fc9ef1
→ video / motion generation future spec

40dac260bee3823e490cc60112171f14955f2247
→ /motion + Motion Director architecture addition
```

These are **documentation only**.

Before pushing `feature/final-integration`, verify whether both commits are already ancestors of the integration branch.

If not:

```text
cherry-pick only the missing doc-only commits
```

Do not pull unrelated later Learn work.

Do not implement:

```text
/motion
Motion Director
Motion Author
renderer integration
Tutor routing
paid rendering
```

The docs merely preserve the future design.

---

# Phase 4 — Wait for Privacy P0

After Home + Learn + Cards QA is clean, do not move to main yet.

Wait for the Usage agent to complete the **Privacy P0 only** work.

Expected Privacy P0 handoff:

```text
feature/usage-credits
+
isolated privacy commit(s)
+
regression tests
+
independent review
+
pushed commit SHA(s)
```

The Usage/Credits implementation itself stays paused.

When the privacy-only commits are provided:

```text
cherry-pick ONLY those commits
→ feature/final-integration
```

Do not merge all of:

```text
feature/usage-credits
```

---

# Phase 5 — Verify Privacy P0 in final integration

After cherry-picking the privacy fix, run the privacy regression directly on `feature/final-integration`.

Required scenario:

```text
User A:
connects repository/project A

User B:
shares the same Gmail/domain org

Expected for User B:
cannot list project A
cannot open project A
cannot @mention project A
cannot create a canvas inside project A
```

Also verify User A still has normal access.

Then rerun the relevant project/library/map/learn journeys to ensure the access-control change did not break normal navigation.

Privacy is a hard gate.

Do not merge to main while this test is failing.

---

# Phase 6 — Final full baseline verification

Once:

```text
Home ✅
Learn cleanup ✅
Cards ✅
Cards render freshness ✅
Privacy P0 ✅
```

run one final baseline pass.

At minimum:

```text
make test-unit
production build
live-bundle-check
full Learn browser checks
full Cards browser checks
final Rabbit Hole journey
mobile
dark mode
no-live-writes
dev storage isolation
privacy regression
```

Do not include Usage/Credits-specific checks because Usage/Credits is paused and not part of this baseline.

---

# Phase 7 — Final visual review

Use the final integration clone.

Only send genuinely changed or integration-sensitive states to Figma.

Do not build another giant board containing every previously approved screen.

The important visual checks are:

```text
Home → Map → Learn transition
Learn canvas after Cards merge
practice expansion
tools gutter / overview
phone zoom controls vs composer
dark mode
any screen affected by Privacy P0 if visible
```

If there are no visual differences in a previously approved area, preserve its existing acceptance evidence.

Stop for user approval before merging to `main`.

---

# Phase 8 — Merge to main only after approval

After the user explicitly approves the final integration:

```text
feature/final-integration
→ main
```

Then:

```text
git push origin main
```

No force push.

Record:

```text
main HEAD
feature/final-integration HEAD
Home source HEAD
Learn source HEAD
Cards source HEAD
Cards freshness fix SHA
Privacy P0 SHA(s)
review clone version
final test results
known deferred work
```

Then tag the clean baseline:

```text
rabbit-hole-pre-tutor-baseline
```

Push the tag normally.

---

# What is explicitly deferred

Do not implement any of these as part of final integration:

```text
Usage/Credits v1
credit ledger
weekly credit limits
Settings → Usage
Upgrade UI
provider-cost accounting
paid quote accounting beyond existing behavior

Tutor Agent
Plato/Socrates/Feynman implementation
Learner Intent Resolver
learner-state model

nested rabbit holes
/dive

visual_summary
concept_map

/motion implementation
Motion Director implementation
Motion Author implementation
video renderer pipeline
```

## Deferred items ledger

Minor Privacy P0 review findings, deferred when P0 was ported into `feature/final-integration` (2026-09-30). They are not part of the P0 merge, because neither leaks data in the integrated build. Reopen one only if that changes.

| Item | Where | Why deferred |
|---|---|---|
| A project still reports itself as visible to the whole domain: `repositoryApp()` returns `visibility: 'domain'`. | `packages/control-plane/src/repositories.js` `repositoryApp` | Access is owner-only now, and no UI shows this field. Correct it when explicit sharing is designed. |
| The owner-only check on repository refresh can no longer trigger: only the owner can reach the project at all, so the check is dead code. | `packages/control-plane/src/repositories.js` refresh action | Harmless. Clean it up with the sharing model rather than inside P0. |

---

# What happens after the baseline is frozen

After:

```text
main
+
rabbit-hole-pre-tutor-baseline
```

the next milestone is **not coding the Tutor immediately**.

The next step is a Tutor architecture session with the user.

The architecture session should define:

```text
Learner Intent Resolver
structured LearnerTurn context

Tutor Orchestrator
Plato-like planning/curriculum logic

Socrates specialist
Feynman specialist

JEV fast evaluator
strong-model fallback

learner evidence/state
understood / uncertain / misconception / prerequisite_gap / not_observed

when to ask
when to explain
when to practice
when to use artifacts
when to dive into prerequisites

tool selection
latency / cost policy
context boundaries
golden trace scenarios
```

No Tutor code should be written until that architecture is reviewed.

After Tutor architecture is designed:

```text
1. build nested Rabbit Holes / /dive
2. then implement Tutor v1
3. later visual summary / concept map
4. later motion/video generation + creator distribution
```

---

# Additional required pre-main work — Landing page, organization migration, product rename, and custom domain

These items are now part of the **pre-main integration checklist**. They must be handled deliberately before the final baseline is declared complete.

## A. Merge the landing-page worktree

There is a separate landing-page worktree:

```text
~\Desktop\workspace\smart-landing-page
```

It contains the new Rabbit Hole landing page and must ultimately be included in the product that lands on `main`.

### Required action

Before the final merge to `main`:

1. inspect the landing-page worktree;
2. identify its branch and exact HEAD;
3. verify whether it is already pushed;
4. run its own build/tests;
5. merge or cherry-pick it into `feature/final-integration` using the least destructive path;
6. resolve any shared routing/style conflicts carefully;
7. verify that the authenticated application and public landing page both still work.

Do **not** copy files manually from the worktree.

Use Git history and report:

```text
landing worktree branch
landing HEAD
origin status
merge/cherry-pick commit(s)
conflicts encountered
tests/build run
```

If the landing-page worktree contains unrelated experimental work, stop and report instead of merging the whole branch blindly.

### Ownership boundary

The landing page owns the **public unauthenticated entry experience**.

The already-approved Home/WP7 work owns the **authenticated product shell**.

Do not let the landing-page merge overwrite:

```text
Home
Library
Project
Map
Learn
Mothership
authenticated routing
```

without an explicit reason.

---

# B. Cloudflare and Fly.io now use the `rabbit-hole` organization

The user's infrastructure has changed.

Previously, Cloudflare and Fly.io resources were under personal ownership.

There is now an organization named:

```text
rabbit-hole
```

in both:

```text
Cloudflare
Fly.io
```

The repo configuration must be updated so future deployments target the new organization/account deliberately.

## Required infrastructure audit

Before changing anything, inventory the current configuration and produce a migration table covering at least:

```text
Cloudflare account / org
Workers
Pages, if any
D1
R2
KV
Queues / Durable Objects, if any
custom domains / routes
worker.dev hostnames
secrets / environment variables
preview/dev workers
production workers

Fly.io organization
Fly apps
machines
volumes
secrets
regions
internal hostnames
public hostnames
billing-sensitive resources
```

For each resource record:

```text
current owner/account
current name
current environment
target owner/org
whether resource can move
whether it must be recreated
data migration required?
DNS change required?
secret/config change required?
rollback path
```

### Safety rule

Do **not** destructively move, delete, recreate, or rename live resources merely to make the names cleaner.

Do not assume Cloudflare or Fly resources can be transferred losslessly.

If an existing stateful resource such as:

```text
D1
R2
Fly volume
```

cannot safely move between organizations, stop and propose the migration path before touching it.

### Config audit

Search the repository for account-specific configuration including:

```text
account_id
zone_id
database_id
bucket names
worker names
routes
workers.dev URLs
Fly org
Fly app names
Fly internal hostnames
API base URLs
hard-coded preview URLs
CI secrets
deployment scripts
docs/examples
```

Update only after the target mapping is understood.

Never commit credentials or tokens.

---

# C. Rename the product/developer surface from `small-deploy` / `small` to Rabbit Hole

The old developer-facing product name is no longer correct.

Examples of the old surface:

```text
npm i -g small-deploy
small login
small deploy
small run <app>
small runs <app>
small logs <app>
small share <email>
small schedule pause <app>
small list
small watch
small init
```

And old product/API references include names such as:

```text
small-deploy
small
small-cp-*
small-cp-dev-*
small-cp-dev-small-parallel
```

The target user-facing brand is now:

```text
Rabbit Hole
```

The target CLI command should be:

```text
rabbit-hole
```

Examples:

```text
rabbit-hole login
rabbit-hole deploy
rabbit-hole run <app>
rabbit-hole runs <app>
rabbit-hole logs <app>
rabbit-hole share <email>
rabbit-hole schedule pause <app>
rabbit-hole list
rabbit-hole watch
rabbit-hole init
```

## Important package-name distinction

Do **not** assume the npm package name is automatically available as:

```text
rabbit-hole
```

The desired **binary / command** is `rabbit-hole`.

Before changing the published npm package name:

1. inspect the current package metadata;
2. check what package name is technically available/owned;
3. preserve upgrade compatibility for existing installations if applicable;
4. separate:
   ```text
   npm package name
   CLI binary name
   product display name
   ```
   instead of assuming all three must be identical.

The docs should no longer teach new users to run `small ...`.

If backwards-compatible aliases are needed temporarily, they may remain internally, but the canonical documented command becomes:

```text
rabbit-hole
```

## Rename audit

Search the entire repository for user-visible and infrastructure-visible variants of:

```text
small
small-deploy
small deploy
Small
small-cp
small-cp-dev
```

Classify every occurrence before editing:

```text
user-facing brand
CLI binary
npm package
API route
database/resource identifier
migration identifier
test fixture
historical doc
internal variable
deployment resource name
```

Do not blindly global-replace `small`.

Some old resource identifiers may need to remain for compatibility or safe migration.

### Developer docs target

The developer section should conceptually become:

```text
Developer

Deploy from your terminal

New app

1. Install the CLI
Node 18+

<verified npm install command>

2. Sign in
A one-time code to your email

rabbit-hole login

3. Ship
From your project directory. It appears here the moment it deploys.

rabbit-hole deploy
```

Everyday commands:

```text
rabbit-hole run <app>
rabbit-hole runs <app>
rabbit-hole logs <app>
rabbit-hole share <email>
rabbit-hole schedule pause <app>
rabbit-hole list
rabbit-hole watch
rabbit-hole init
```

Do not publish a guessed npm installation command until the package-name decision is verified.

---

# D. Replace `workers.dev` product URLs with `tryrabbithole.dev`

> **Production domain is now `digrabbithole.com`** ([rabbit-hole-production.md](features/rabbit-hole-production.md)); read every `tryrabbithole.dev` below as `digrabbithole.com`.

The user owns:

```text
tryrabbithole.dev
```

in Cloudflare.

The product should stop presenting URLs such as:

```text
https://small-cp-dev-small-parallel.zeroshothq.workers.dev/
```

as canonical user-facing destinations.

## Domain architecture

> **Superseded by [docs/features/rabbit-hole-production.md](features/rabbit-hole-production.md) (one origin):** production is ONE public origin, `https://digrabbithole.com` (owner decision 2026-10-01), serving Landing, sign-in, the app and its API. There is no `app.` or `api.` host. `tryrabbithole.dev` and every `tryrabbithole.dev` host named below are legacy: a later 301 redirect to digrabbithole.com, not a launch blocker.

Before wiring DNS/routes, propose and document the final hostname map.

Preferred direction:

```text
tryrabbithole.dev
→ public landing page

app.tryrabbithole.dev
→ authenticated Rabbit Hole application

api.tryrabbithole.dev
→ public/stable API entry point, if a separate API hostname is actually needed
```

Potential additional service subdomains should only be created if required, for example:

```text
notebook.tryrabbithole.dev
```

Do not create subdomains merely for naming symmetry.

If the current architecture is same-origin for application API calls, preserve same-origin behavior where possible rather than creating a separate API hostname unnecessarily.

### Preview environments

Do not remove the ability to deploy isolated preview workers.

Internal/test clones may still have provider-generated hostnames.

But:

```text
workers.dev URLs
```

must no longer be the canonical URLs shown in:

```text
product UI
developer docs
CLI output intended for users
API documentation
share links
landing-page links
production configuration
```

Preview/test URLs should be clearly labelled as preview/dev.

### Required domain audit

Search for hard-coded URLs including:

```text
workers.dev
zeroshothq
small-cp
small-cp-dev
localhost fallbacks
API base URLs
OAuth/callback URLs
CORS allowlists
cookie domains
WebSocket/SSE origins
share links
email links
notebook URLs
artifact URLs
```

Update them through centralized environment/config values where possible.

Do not scatter `tryrabbithole.dev` string literals through unrelated code.

### Auth and security checks

Changing domains can affect:

```text
cookies
SameSite behavior
Secure flags
OAuth redirects
magic-link redirects
CORS
CSRF/origin checks
session storage
service-worker scope
CSP
connect-src / frame-src
```

Explicitly test these after the domain migration.

---

# E. Revised integration order

The final pre-Tutor baseline is now:

```text
1. Home + Learn + Cards integration
2. browser/product QA
3. Cards render-freshness fix
4. include approved motion docs
5. Privacy P0 only
6. merge landing-page worktree
7. Rabbit Hole brand / CLI rename
8. Cloudflare + Fly `rabbit-hole` org configuration
9. `tryrabbithole.dev` custom-domain configuration
10. final full regression
11. final visual review
12. user approval
13. merge feature/final-integration → main
14. push main
15. tag rabbit-hole-pre-tutor-baseline
```

The exact order of steps 6–9 may be adjusted if dependency analysis shows a safer order, but they must all be resolved before calling the baseline complete.

---

# F. Additional final acceptance checks

Before `main`, verify all of the following in addition to the existing product checks.

## Landing

```text
tryrabbithole.dev loads the intended public landing page
landing CTA reaches the authenticated product correctly
no stale Small/small-deploy branding is visible
mobile and dark/light behavior are correct where applicable
```

## CLI / developer surface

```text
canonical docs use Rabbit Hole
canonical CLI command is rabbit-hole
old small command is not taught to new users
install command is verified rather than guessed
API docs no longer point to the temporary small-cp workers.dev clone
```

## Cloudflare

```text
target organization/account is rabbit-hole
custom-domain routes resolve correctly
required D1/R2/KV bindings point to intended resources
preview and production resources remain separated
no live data was accidentally recreated or lost
secrets remain outside Git
```

## Fly.io

```text
target organization is rabbit-hole
expected apps/machines still start
volume/state ownership is understood
internal service references resolve
no personal-org dependency remains unintentionally
```

## Domain / auth

```text
sign in works on the new domain
session survives navigation/reload
logout works
OAuth/magic links return to the correct host
API requests succeed
SSE/streaming works
CORS/origin checks are correct
cookies use the intended scope
share links use the Rabbit Hole domain
```

## Naming audit

There should be no accidental user-facing remnants of:

```text
Small
small-deploy
small deploy
small-cp-dev-...
zeroshothq.workers.dev
```

except where explicitly retained as:

```text
historical reference
migration compatibility
internal resource identifier
dev/preview endpoint
```

Every retained occurrence should have a reason.

---

# G. Do not turn the rename into a destructive infrastructure rewrite

The goal is:

```text
Rabbit Hole branding
+
safe organization ownership
+
stable custom domain
+
backwards-compatible migration where needed
```

Not:

```text
rename every physical resource at once
```

Prefer:

```text
new canonical product-facing name
central configuration
safe aliases/migration
eventual cleanup of legacy identifiers
```

over deleting and recreating stateful resources simply to remove `small` from an internal name.

If a clean rename requires destructive migration, stop and get approval first.

---

# H. Google + GitHub authentication before the new baseline

Authentication is also part of the pre-main Rabbit Hole migration.

We need first-class sign-in with:

```text
Continue with Google
Continue with GitHub
```

This must be completed and verified with the new Rabbit Hole domain before the final baseline is considered production-ready.

Do not bolt OAuth onto the existing login flow without first auditing the current authentication/session model.

## 1. Audit the existing auth system first

Document the current behavior:

```text
current login method(s)
current user/account identifier
session creation
session storage
cookie configuration
logout
magic-link/email verification if present
auth callback routes
redirect handling
dev/test bypasses
current auth-related D1 tables
```

Identify every place where the application currently assumes:

```text
email == user identity
```

before adding OAuth.

Do not change account identity semantics silently.

## 2. Introduce a stable internal Rabbit Hole user identity

Google/GitHub identities should resolve to a stable internal Rabbit Hole user/account ID.

Conceptually:

```text
user
  id
  primary_email
  display_name?
  avatar_url?
  created_at

auth_identity
  user_id
  provider
  provider_subject
  provider_email?
  provider_email_verified?
```

Provider identity should use the provider's immutable subject/user ID:

```text
Google:
provider = google
provider_subject = OIDC sub

GitHub:
provider = github
provider_subject = GitHub user id
```

Do not use mutable usernames as the primary identity key.

Do not make email alone the durable OAuth identity.

Exact schema names are implementation decisions; preserve existing data safely.

## 3. Account linking must be safe

A Google login and GitHub login that happen to expose the same email must not be silently merged unless the existing account/linking rules make that safe.

Preferred principle:

```text
existing authenticated user
→ explicitly connect another login provider
```

rather than:

```text
matching email
→ automatically merge accounts
```

If existing email-login users must be migrated, design and test that migration explicitly.

Never link accounts using an unverified provider email.

GitHub users may:

```text
hide their public email
use a different verified email
have multiple emails
```

so GitHub authentication must not depend on public email being populated.

If safe account-linking semantics require a product decision, stop and report before implementing automatic linking.

## 4. Google authentication

Add:

```text
Continue with Google
```

using the standard Google OAuth/OIDC authorization flow.

Keep requested identity scopes minimal:

```text
openid
email
profile
```

unless implementation research proves another identity scope is necessary.

Google login is for authentication, not broad Google account access.

Validate at minimum:

```text
state
issuer
audience/client ID
nonce where applicable
callback integrity
verified email when relying on email
```

Never trust identity fields supplied by the browser.

## 5. GitHub authentication

Add:

```text
Continue with GitHub
```

using GitHub's supported OAuth authentication flow.

Login scopes must remain minimal.

Critically:

```text
GitHub login identity and GitHub repository access are two different capabilities.
```

Do not make:

```text
Sign in with GitHub
```

silently grant repository access.

If Rabbit Hole already has or later gets a GitHub App / repository connector, preserve the separation:

```text
GitHub authentication
→ who are you?

GitHub repository connection
→ which repositories has Rabbit Hole been granted access to?
```

They may share a provider, but they must not share permission assumptions.

## 6. New Rabbit Hole OAuth ownership/configuration

Production OAuth applications should use Rabbit Hole's new infrastructure/account ownership where possible.

Audit/configure:

```text
Google OAuth client/project
GitHub OAuth application
provider client IDs
provider secrets
callback URLs
logout/redirect URLs
allowed origins
```

Secrets must live in the appropriate deployment secret store.

Never put:

```text
Google client secret
GitHub client secret
signing secret
session secret
```

in:

```text
Git
browser bundles
Figma
screenshots
logs
docs
```

## 7. tryrabbithole.dev auth migration

> **Superseded by [docs/features/rabbit-hole-production.md](features/rabbit-hole-production.md) (one origin):** production is ONE public origin, `https://digrabbithole.com` (owner decision 2026-10-01), serving Landing, sign-in, the app and its API. There is no `app.` or `api.` host. `tryrabbithole.dev` and every `tryrabbithole.dev` host named below are legacy: a later 301 redirect to digrabbithole.com, not a launch blocker.

Auth must use the new canonical Rabbit Hole hostnames.

Assuming the final host map remains:

```text
tryrabbithole.dev
→ public landing page

app.tryrabbithole.dev
→ authenticated Rabbit Hole app
```

production OAuth callbacks should resolve through the canonical app domain.

Do not permanently configure OAuth around:

```text
*.workers.dev
small-cp-dev-*
small-cp-dev-small-parallel
```

Those may remain temporary dev/review environments only.

Do not invent callback paths. First inspect the existing auth routes and retain one canonical route shape.

Conceptually:

```text
https://app.tryrabbithole.dev/<google callback route>
https://app.tryrabbithole.dev/<github callback route>
```

## 8. Dev and production OAuth must be separated

Preserve a way to test authentication safely in dev.

Use separate provider configuration where needed for:

```text
local development
review/dev clone
production
```

Do not point a temporary review clone at production OAuth credentials unless explicitly required and reviewed.

Redirect allowlists should be explicit.

Never implement:

```text
redirect_uri=<arbitrary user supplied URL>
```

Use an allowlisted/canonical redirect model.

## 9. Sessions and cookies after the domain change

Audit and test:

```text
Secure
HttpOnly
SameSite
cookie Path
cookie Domain
expiration
rotation
logout invalidation
```

Prefer the narrowest cookie scope that supports the architecture.

Do not automatically share an authentication cookie with every:

```text
*.tryrabbithole.dev
```

subdomain unless there is a concrete requirement.

Explicitly verify the move from `workers.dev` to `tryrabbithole.dev` does not cause:

```text
login loops
lost sessions
cross-origin failures
broken logout
callback failures
```

## 10. OAuth security requirements

Both providers must include protection against:

```text
login CSRF
callback replay
forged callback parameters
arbitrary redirects
session fixation
account-linking confusion
identity substitution
```

OAuth state must be server-generated, validated and one-time/short-lived.

Use PKCE where appropriate/supported by the selected flow.

Do not expose provider tokens to the frontend unless there is a specific reviewed requirement.

Provider access/refresh tokens, if retained at all, must be server-side and protected.

## 11. Privacy P0 must remain true across every login provider

The owner-only Library fix cannot depend on whether the person authenticated with:

```text
email
Google
GitHub
```

Authorization must resolve the same internal Rabbit Hole user.

Required regression:

```text
User A signs in with Google
→ connects project A

User B signs in with Google/GitHub
→ same email-domain org
→ cannot see/open/@mention/create canvas in project A
```

Also test where relevant:

```text
same Rabbit Hole user
+ legitimately linked Google/GitHub identity
→ sees the same owned projects
```

Authentication provider must never become the authorization boundary.

## 12. Login UI

The landing/auth experience should present a simple provider surface:

```text
Continue with Google

Continue with GitHub

───── or ─────

existing email method, if retained
```

Do not add unnecessary OAuth explanation to the primary login screen.

Provider errors should be understandable:

```text
Sign-in was cancelled.
We couldn't verify this GitHub account.
This login is already connected to another Rabbit Hole account.
```

Do not leak raw OAuth/provider errors to users.

## 13. Landing page relationship

> **Superseded by [docs/features/rabbit-hole-production.md](features/rabbit-hole-production.md) (one origin):** production is ONE public origin, `https://digrabbithole.com` (owner decision 2026-10-01), serving Landing, sign-in, the app and its API. There is no `app.` or `api.` host. `tryrabbithole.dev` and every `tryrabbithole.dev` host named below are legacy: a later 301 redirect to digrabbithole.com, not a launch blocker.

The new landing page from:

```text
~\Desktop\workspace\smart-landing-page
```

should route authentication CTAs into the canonical auth flow.

Examples:

```text
Start a rabbit hole
Sign in
Get started
```

should not point at temporary `workers.dev` URLs once the domain migration is complete.

They should enter:

```text
app.tryrabbithole.dev
```

or the final canonical authentication route chosen during implementation.

## 14. CLI authentication relationship

The future:

```text
rabbit-hole login
```

must be considered alongside web OAuth.

Do not automatically make the CLI reuse browser OAuth tokens without designing the security flow.

Existing one-time-code CLI login may remain the appropriate architecture.

Define clearly:

```text
web login
→ Google / GitHub / email

CLI login
→ one-time browser/device/email authorization
```

as separate clients that ultimately map to the same Rabbit Hole user identity.

CLI authentication must not depend on the old:

```text
small
small-deploy
workers.dev
```

product identity.

## 15. Required auth tests

> **Superseded by [docs/features/rabbit-hole-production.md](features/rabbit-hole-production.md) (one origin):** production is ONE public origin, `https://digrabbithole.com` (owner decision 2026-10-01), serving Landing, sign-in, the app and its API. There is no `app.` or `api.` host. `tryrabbithole.dev` and every `tryrabbithole.dev` host named below are legacy: a later 301 redirect to digrabbithole.com, not a launch blocker.

Before the pre-Tutor baseline can be considered complete, verify:

```text
Google new-user sign in
Google returning-user sign in
Google cancel/error

GitHub new-user sign in
GitHub returning-user sign in
GitHub cancel/error

logout
session reload
expired/invalid session

auth callback cannot redirect arbitrarily
invalid state is rejected

linked identity behavior, if implemented
duplicate/conflicting identity behavior

Privacy P0 with Google user A / user B
Privacy P0 with GitHub identities

landing → auth → app
app reload keeps session
```

Test at least:

```text
desktop
mobile-width auth UI
canonical tryrabbithole.dev/app.tryrabbithole.dev route
```

## 16. Do not make real OAuth setup a hidden prerequisite for ordinary integration tests

Unit/browser suites should be able to use:

```text
fake/test identities
provider stubs
existing authorized test-session mechanism
```

Real-provider OAuth checks should be a small explicit acceptance pass.

Never put real Google/GitHub credentials into test fixtures.

## 17. Revised pre-main sequence

Extend the current sequence to:

```text
Home + Learn + Cards integration
↓
integration QA
↓
Cards freshness fix
↓
Privacy P0
↓
landing-page merge
↓
Rabbit Hole rename
↓
Cloudflare/Fly rabbit-hole org migration/configuration
↓
tryrabbithole.dev domain
↓
Google + GitHub authentication
↓
complete auth/privacy/domain regression
↓
final visual review
↓
explicit user approval
↓
main
↓
rabbit-hole-pre-tutor-baseline
```

Dependency analysis may adjust the implementation order of domain/auth/landing configuration, but all must be verified together before final approval.

## 18. Stop conditions

Stop and ask before proceeding if:

```text
OAuth requires automatic email-based account merging;
existing accounts could become duplicated;
existing user ownership cannot safely map to a stable internal user;
moving auth to the new domain would invalidate existing production sessions unexpectedly;
GitHub login conflicts with existing GitHub repository authorization;
provider configuration requires destructive migration;
production OAuth credentials/config cannot be separated from dev safely.
```

Do not guess through identity/security decisions.

## Principle to preserve

```text
Authentication:
"Who is this person?"

Authorization:
"What is this person allowed to access?"
```

Google/GitHub solve the first question.

They must not weaken or replace the second.

Keep those concerns separate.

---

# Final instruction

The purpose of this phase is:

```text
MERGE
→ VERIFY
→ FIX ONLY REGRESSIONS / PRIVACY
→ FREEZE
```

Not:

```text
MERGE
→ reopen architecture
→ add features
→ redesign approved surfaces
```

If an uncovered semantic conflict or product decision appears, stop and ask rather than guessing.

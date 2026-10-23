# Creator analytics: event contract and Analytics UI

Owner briefs, 2026-10-06 (#62: analytics, creator profile, analytics UI, feedback loop) and **2026-10-23 (redo: one
Creator analytics screen for deciding what to create or improve; binding, see "Dashboard read contract" next)**.
**The events and storage are a contract only.** No event is emitted and no analytics table exists. The one analytics
route that exists is the owner-only read `GET /api/analytics/creator` (2026-10-23), which returns real numbers only for
what is already stored canonically and `not_collected` for everything else. Storage and its production migration are a
separate proposal (docs/features/creator-analytics-storage-proposal.md) that needs the owner's separate approval.

## Dashboard read contract (owner brief 2026-10-23)

This section supersedes "Derived metrics", "Analytics UI (read contract)" and "Read API" below wherever they differ.
The older sections stay as the record of the event design, which this section reuses unchanged.

### One screen, one route

- Screen: **Creator analytics**, opened from the existing Analytics entry on the owner's own creator profile
  (CreatorProfile.jsx) and from ⋮ → Analytics on one of the owner's public canvases (opens with that canvas selected).
  Header: lock icon and "Private · only you", canvas selector (All public canvases, or one canvas), range (7 days,
  30 days, All time), the visible date range and reporting timezone, close.
- Route: `GET /api/analytics/creator?range=7d|30d|all[&canvas=<canvas name>]`. Default range `30d`. Built:
  `control-plane/src/creator-analytics.js`, dispatched in `web/dev-worker.js`; tests in
  `control-plane/test/creator-analytics.test.js`.
  - **Owner-only, on the server.** Signed out: 401. The scope is always the session's own live public canvases, the
    same set the creator profile lists (learn-boards.js `PUBLISHED` filtered to the session's handle). There is no handle
    or org parameter, so another creator's data cannot be named.
  - `canvas` that is not one of the session's own live public canvases (someone else's, private, unlisted, archived,
    trashed or unknown): 404, the same answer for each, so existence is not revealed.
  - An invalid `range` or a malformed `canvas`: 400 with a one-line fix.
  - It writes nothing. It never returns a learner key, a person's id, free text, or a protected raw value.
- Shape: `packages/web/src/creator-analytics-shape.js` (pure; the control plane imports it). Development fixtures, one
  per state, are in `packages/web/src/creator-analytics-fixtures.dev.js`, labelled in the file name and in every
  payload (`fixture: 'DEVELOPMENT FIXTURE ...'`); a unit test fails if production source imports them.

### States (every section and every metric)

| State | Meaning | Value | Set by |
|---|---|---|---|
| `loading` | request in flight | null | client |
| `not_collected` | nothing records this yet; the section carries one `reason` and `message` | null | server |
| `not_enough_learners` | protected, and fewer than 10 learners at this exact cell | null; the count is not returned either | server (`suppress`) |
| `measured_zero` | measured, and it is 0 | 0 | server (`metric` turns a ready 0 into it) |
| `failed` | the request or a section failed; the screen offers Retry | null | client (a server section may also report it) |
| `ready` | measured | the number | server |

`metric(state, value, extra)` keeps a value only for `ready` and `measured_zero`. `suppress(count, value)` applies the
cohort rule. `counter(value, period)` is a public counter, shown at any count. Missing values are never 0 and never
interpolated; a sort puts them last in either direction (`sortRows`).

### Cohort rule

- Protected metrics need **at least 10 distinct learners** (learner keys) behind the **exact** cell: the selected
  range, canvas filter and the cell's own filter (one day of the series, one topic, one concept, one resource, one
  traffic source, one campaign, one comparison row).
- Below 10 the server returns `{ state: 'not_enough_learners', value: null }`. The raw value and the count are never
  sent, so hiding is not left to the UI.
- A percentage's cohort is its denominator. A share of traffic is shown only when both its row and the denominator pass.
- Public counters (public canvases, canonical forks, Rabbit Holes started) show at any count: they count objects that
  exist, not learner behaviour.

### Periods

Every metric carries `period`: `selected` (the chosen range), `current` (a total right now) or `all_time`. The screen
labels it, for example "Forks · all time". Ranges are reporting-timezone days, today included: `7d` is today and the 6
days before, `30d` today and the 29 before, `all` from `collected_since` (null until collection starts, so "All time"
never implies history before recording). **Reporting timezone: UTC** in V1 (`TIMEZONE`), shown in the header.
Rollups are daily UTC; a creator-chosen timezone needs hourly rollups and is not in V1. History is never invented or
backfilled, and never derived from usage, billing or Ask rate-limit logs (`shared_ask_events`).

### Definitions

"Learner" below means a learner key: a signed-in account, or an anonymous **browser** (not a person). "Session" and
"visit" are the deduplicated session of "Deduplication": a reload or a return from a Rabbit Hole adds nothing.
**Learning action** (the qualifying action for active learning): the first interaction with a card
(`material_interacted`: a selection, input, play, answer or pager change), a question to the shared Ask or Tutor on the
publication, a successful Rabbit Hole start, a Next Step selection, or a checked answer. Not a learning action: opening,
scrolling, panning, zooming, hovering, a card merely in view, an outbound link, or an embed loading.

| Metric | Event source | Formula | Denominator / cohort | Period | Protected | Data today |
|---|---|---|---|---|---|---|
| Active learners | `material_interacted`, `concept_explored`, `next_step_selected`, `rabbit_hole_started_from_publication`, shared Ask question | distinct learners with ≥ 1 learning action in range | itself | selected | yes | not collected |
| Average active learning time | `publication_session_ended` (`active_learning_seconds`) | Σ active seconds of active learners ÷ active learners | active learners | selected | yes | not collected |
| Rabbit Holes started | `rabbit_hole_started_from_publication` (server, 201 only) | count | none | selected | no | not collected (no publication attribution is stored on holes today) |
| Forks | `canvas_forks` via `FORK_COUNT` | Σ `FORK_COUNT` over the scope | none | **all time** | no | **real** |
| Returning learners | sessions with a learning action | active learners in range who also had a learning action in an earlier session on an earlier reporting day within the 30 days before (`RETURNING_LOOKBACK_DAYS`); count and share | active learners | selected | yes | not collected |
| Visits that became active learning | sessions | sessions with ≥ 1 learning action ÷ eligible sessions (all deduplicated sessions in range, excluding owner and test) | eligible sessions (cohort = distinct learners in them) | selected | yes | not collected |
| Public canvases | `canvas_publications` (live, top-level, not in Trash: `PUBLISHED`) | count | none | **current** | no | **real** |
| Visits | `publication_opened`, deduplicated by session | distinct sessions | distinct learners in them | selected | yes | not collected |
| Unique visitors (Audience) | any client event | distinct learner keys | itself | selected | yes | not collected |
| Topics explored next | `concept_explored`, `rabbit_hole_started_from_publication` (`concept_ids`), `next_step_selected` | per topic: distinct learners who explored it, started a hole on it or chose a Next Step for it; ranked; the row says which (`via`) | per topic row | selected | yes, per row | not collected |
| Concepts needing support | a publication-safe assessment outcome (correct / incorrect, no answer text); see Open question B | per concept: incorrect outcomes ÷ outcomes | learners with an outcome on that concept | selected | yes, per row | not collected: **unavailable until assessment evidence is supported**; never inferred from time or repeat views |
| Traffic | `publication_opened` `source` (first in session) | visits per category, and share | all visits in range (explicit denominator) | selected | yes, per row | not collected |
| Campaign visits / active learning / attributed forks | `publication_opened` with `campaign`, plus learning actions and `fork_completed` in those sessions | visits; sessions with a learning action ÷ visits; successful forks in those sessions | per campaign row | selected | yes, per row | not collected (campaign links not built) |
| Most-used cards and resources (tools) | `material_interacted`, `outbound_resource_opened` | distinct learners per card or resource | per row | selected | yes, per row | not collected |
| What would you like next? (tools) | a future explicit request event | distinct learners per chosen topic | per row | selected | yes, per row | not enabled |

Series (Audience): one point per reporting day for Visits, Unique visitors, Active learners, Rabbit Holes started and
Forks; each point is its own cell, suppressed on its own day's cohort, and an unrecorded day is null. Ranged forks in the
series stay `not_collected` (reason `ranged_forks_not_attributed`) until `fork_completed` exists: `forked_at` would also
count forks through `/b` links and the owner's own forks.

### Measurement rules

- **Visits** are deduplicated sessions ("Deduplication"); reloads never inflate them.
- **Active time** excludes hidden and idle time: `IDLE_THRESHOLD_SECONDS = 60` ("Active learning time"); a session is
  capped at 4 h active.
- **Owner self-views and test activity are excluded:** the ingest route drops events whose signed-in viewer owns the
  canvas, events from non-production deployments (dev and preview record into their own databases and never into
  production), and requests from the automated checks (they run on dev clones only).
- **Rabbit Holes and forks count only after successful creation** (201 in the same batch); retries, failures, a
  resumed existing hole (200 `existing`) and a replayed fork add nothing.
- **No drop-off from spatial order.** Canvas order is not reading order, so drop-off is not shown. The older
  `drop_off` metric and its insight are withdrawn.
- **Anonymous learners are browsers**, not people ("Limitations").
- **Embeds:** `/embed/e/<token>` (a public Explore publication framed on a website) is in scope; its visit counts only
  once the frame is at least 50% visible for 2 s, and it is active learning only after a learning action, never on
  load. An offscreen iframe adds nothing. `/embed/b/<token>` (a view link) is out of scope.
- **Scope:** public Explore publications only. Private canvases, unlisted `/b` share links and their embeds record
  nothing.

### Traffic categories

`newsletter | linkedin | explore | creator_profile | direct | other_referrer`, shown as Newsletter, LinkedIn, Explore,
Creator profile, Direct/unknown, Other referrers, each with its count, its percentage and the denominator ("of N
visits"). The order of "Traffic source" applies, with Newsletter first: `newsletter` only when the link carries an
explicit newsletter tag (`utm_source=newsletter` or a `newsletter_issue` campaign). **Newsletter is never guessed**:
email clients usually strip the referrer, so an untagged newsletter click is Direct/unknown.

### Campaigns

- A campaign is a named label on the **canonical** publication link: `/e/<token>?c=<campaign id>` (and on the embed
  snippet). Kinds: Newsletter issue, LinkedIn post, Website placement. The creator creates and names it on the screen.
- Attribution metadata only. A campaign never rotates or mints a token, never changes visibility or permissions, and
  never resets a guest allowance. Unpublishing kills its link exactly as it kills the canonical link.
- Per campaign: visits, the share of visits that became active learning, and **attributed successful forks**
  (`fork_completed` in a session that arrived through it). Canonical fork totals stay separate; campaign forks are a
  subset, never added to them.
- Storage (`publication_campaigns`) is in the storage proposal. Until then the section is `not_collected`
  (`campaign_links_not_built`).

### Sections of the payload

`version, range {id, from, to, timezone}, timezone, threshold, collected_since, coverage, compare, canvas, canvases, overview, audience,
series, topics, support, comparison, traffic, campaigns, canvas_detail, tools, definitions`. Each section is
`{ state, reason, message, ... }`; metric cells are `{ state, value, period?, share? }`. `canvas_detail` is present
only with a `canvas` filter: concept exploration, Rabbit Hole and fork conversion, supported Next Steps, outbound
resources and revision comparisons (the per-explainer metrics of "Derived metrics", same suppression). `definitions`
carries each metric's label, one-line definition, period and protected flag for the tooltips.

### Compare with previous period (owner extension 2026-10-23)

- A "Compare with previous period" toggle beside the date controls: `compare=1`. Applies to the creator-wide overview
  and to one canvas alike, with the same canvas filter and timezone. Separate from the revision before/after comparison.
- **Periods:** equal lengths of whole reporting days (`periodsOf`). 7 days compares the last 7 complete days with the 7
  before them; 30 days likewise. **Decision:** with Compare on, the current period ends on the last complete day
  (yesterday), not today, so a day still being counted never shows as a drop; the payload's `range` becomes that period
  and `compare.periods` carries both ranges for the header. All time has no comparison (`not_applicable`).
- **Change object** beneath each headline metric (`overview`, `audience`, and the one-canvas `conversion` metrics):
  `change: { state, current, previous, abs, pct, pp, reason, periods: { current: {from, to, complete}, previous: {from,
  to, complete}, tz } }`, built by the pure `comparePeriods(current, previous, kind, periods)`.

| Change state | When | Values |
|---|---|---|
| `ready` | both sides measured and both periods fully covered | counts and seconds: `abs` and `pct`; rates: `pp` (percentage points) only |
| `no_baseline` | the previous value is 0 (count or seconds) | `abs` only; never a percentage from a zero baseline |
| `partial` | either period not fully collected or processed (`coverage.since` after its start, `coverage.through` not past its end, or a marked gap) | none |
| `not_enough_learners` | either side suppressed | none, and neither side's value |
| `unavailable` | either side not collected, failed or loading | none |
| `not_applicable` | All time, or a current or all-time total (public canvases, forks) | none |

- Kinds (`CHANGE_KIND`): counts (active learners, visits, unique visitors, returning learners, Rabbit Holes started),
  seconds (average active time), rates in percentage points (visits that became active learning, start and fork rates),
  totals not compared (forks · all time, public canvases).
- Rounding: `pct` and `pp` to one decimal, half away from zero (`round1`); `abs` of seconds to whole seconds. Example
  "148 active learners · +22 (+17.5%)"; a rate "34.1% · +5.1 pts".
- **Series:** `series.previous = { label: 'Previous period', from, to, state, reason, points }`, each point with the
  same `index` (day 0, 1, ...) as the current series, null cells where unavailable or suppressed.
- Today every compared change is `unavailable` (nothing is collected) or `not_applicable` (the canonical totals).

### Data coverage ("About these metrics")

`coverage: { since, through, partial: [{ from, to, reason }], source, message }`: "Data available since <since>" and
"Updated through <through>". They describe what collection and processing actually cover, never the time of the
request. A period overlapping a `partial` entry, starting before `since` or ending after `through` is partial. Today:
`since` and `through` are null with the message "Nothing is collected yet ... Public canvases and forks are read live".

### Publication health (owner extension 2026-10-23)

- Findings about what a **public, signed-out viewer** meets on the creator's public canvases. The owner being able to
  open something proves nothing, so every check goes through the public path: `sharedAccess` with a signed-out request
  and the publication token, the shared board state exactly as a visitor gets it (`sharedState` and
  `redactRepositoryCards` with no viewer), and `authorizeFileSource` through the token for imported files.
- **Decision: on demand, not stored.** The owner presses Check; `GET /api/analytics/health[?canvas=<name>]` runs the
  checks then and returns them with `checked_at` = the time of the check (built: `control-plane/src/creator-analytics-health.js`,
  tests `control-plane/test/creator-analytics-health.test.js`). Nothing is written, so no storage approval is
  needed. Owner-only (401 signed out, 404 for a canvas that is not the owner's live public one), at most one run per
  owner every 30 seconds per worker instance (429), and at most 40 checks per run (the rest count as unchecked).
- Read-only: never changes sharing or permissions, never executes notebooks, generates content or calls a paid or
  model service. External links are checked with one bounded `GET` each (5 s timeout) to the public page.

| Item | Check | Finding |
|---|---|---|
| The publication itself | `sharedAccess` signed out | the link does not open for a visitor: `confirmed` |
| Imported file card (PDF, slides, sheets; `fileRef`) | `authorizeFileSource` through the token, signed out | refused while the file is stored: `confirmed` ("opens for you, not for visitors"); no longer stored: `confirmed` |
| Uploaded PDF on a paper card (`upload:` id) | the paper route serves uploads to the uploader only (`learn-paper.js`) | `confirmed` |
| Repository card | redacted for a signed-out viewer (`redactRepositoryCards`) | `confirmed` (repository not public) |
| arXiv paper, Wikipedia article, YouTube video | public page or oEmbed | 404 / 410 (video 401 / 403): `confirmed`; 5xx, 429 or timeout: `temporary_failure`; network error: `inconclusive` |
| Any other linked resource (webpage, image or other URL), and items past the cap | not checked | counted in `unchecked`, not listed |

- Finding: `{ canvas, kind, item_id, title, problem, status, checked_at, target: { canvas, card_id, href } }`, status one
  of `confirmed | temporary_failure | inconclusive | unchecked`; `href` opens the canvas at the card
  (`/apps/<canvas>?card=<id>`, the existing `card=` focus; a project canvas uses its project address).
- Report: `{ checked_at, canvas, on_demand: true, totals: { checked, unchecked, findings }, groups: [{ canvas, title,
  checked, unchecked, findings, message }] }`; the overview groups by canvas, one canvas shows only itself. A group
  with no finding says "No issues found in checked items", never that the canvas has no problems.
- A stored history of checks (scheduled re-checks, "first seen") would need storage: not proposed in V1.

### Export CSV (owner extension 2026-10-23)

- "Export CSV" in the header: `GET /api/analytics/creator.csv` with the same `range`, `canvas` and `compare` parameters,
  owner-only exactly as the JSON route, built server-side from the **same payload** by the pure `toCsv(payload)`
  (`web/src/creator-analytics-csv.js`).
- Columns: `section, item, metric, label, value, unit, period, from, to, timezone, state, reason`, plus `previous_value,
  previous_from, previous_to, change_abs, change_pct, change_pp, change_state, change_reason` when Compare is on. One
  rectangular table: `about` rows first (canvas scope, range, comparison, collection start, data available since,
  updated through, partial periods, the cohort, and each metric's definition), then every metric cell of the payload
  (overview, audience, each series day, topics, support, canvas comparison, traffic with its denominator, campaigns,
  the one-canvas conversion, most-used resources), and one row with the reason for each section that has nothing to
  list. Units: `count`, `seconds`, `ratio` (0 to 1). A current or all-time total has no dates of its own. Built in
  `control-plane/src/creator-analytics.js`; file name `creator-analytics-<canvas|all>-<range>[-compared]-<to>.csv`.
  Aggregate only: never a learner row.
- A hidden or unavailable value is an **empty cell with its reason**, never 0. RFC 4180 quoting (commas, quotes, CR, LF);
  a cell beginning with `=`, `+`, `-`, `@`, tab or CR is prefixed with `'` and quoted (formula injection).

### What has real data today, and what each missing part needs

| Part | Today | Needs |
|---|---|---|
| Public canvases (current) | real: `PUBLISHED` count | nothing |
| Forks (all time, overview and comparison rows) | real: Σ `FORK_COUNT` | nothing |
| Visits, unique visitors, active learners, active time, returning, conversion, series, traffic, topics, resources | `not_collected` (`storage_not_approved`) | the analytics storage and production migration (storage proposal), the ingest route, the client emitter on `/e` and `/embed/e` |
| Rabbit Holes started | `not_collected` | storage, and `startRabbitHole` writing `rabbit_hole_started_from_publication` in its batch |
| Ranged and campaign-attributed forks | `not_collected` | storage, and `fork()` writing `fork_completed` in its batch |
| Campaigns | `not_collected` (`campaign_links_not_built`) | storage (`publication_campaigns`), the `?c=` parameter read on open, a create/name control |
| Concepts needing support | `not_collected` (`assessment_evidence_unsupported`) | Learning: a publication-safe outcome event (Open question B) |
| Supported Next Steps | `not_collected` | Learning: suggestion ids on public canvases (TBD-by-Learning) |
| What would you like next? | `not_collected` (`requests_not_enabled`) | an owner-approved collection and privacy contract: a fixed list of topic choices, no free text, no Tutor or answer mining, opt-in per canvas |
| Most-used cards: a deleted or changed card | — | a row whose card no longer exists says so (`exists: false`, no Locate); a changed card keeps its id and shows its current title |

## Scope

- Events come from **public publications only**: `/e/<token>` (explore-publish.md), plus the future creator profile
  `/@handle` (#63). Private canvases, unlisted `/b/<token>` shares and the owner's own views emit nothing.
- Creator analytics are **aggregate only**. No route ever returns a per-learner row.
- Two levels, never one dashboard: **per-explainer** analytics (one publication) and **creator** analytics (all of a
  creator's publications).

## What exists today (verified in code)

| Thing | Where | Used here as |
|---|---|---|
| Publication | `canvas_publications (org, canvas, token UNIQUE, published_at)`, PK `(org, canvas)` (learn-migrations/0007) | `publication_id` = `(org, canvas)` |
| Canvas id | `canvases.name` in its org, `UNIQUE(org, name)` (repository-schema.sql) | `source_canvas_id`, the same pair |
| Canvas owner | `canvases.owner_email`, the account principal every LEARN_DB row keys on (migrations/0026 comment) | creator, by reference only |
| Signed-in viewer id | `users.id` as `userId` from `devIdentity` (src/dev-forwarding.js), null for a CLI token | `viewer_user_id`, server-set |
| Board revision | `learn_boards.version`, +1 on every owner save (`saveOwn`); `openShared` returns it | `board_version` |
| Card ids | block and exchange ids in `learn_boards.state_json`; `originOf` checks one exists (src/learn-boards.js) | `material_id` |
| Concept ids | `resolveTarget` (web/src/learn-target.js): scene objects' `conceptId`, `spec.conceptIds` | `concept_ids` |
| Claim ids | journey stamp `block.journey.claims` (web/src/learn-journey-materialize.js) | `claim_ids` |
| Resource ids | `boardSources(state)` keys `video:<id>`, `paper:<id>`, `wiki:<title>` (src/learn-shared-ask.js); a public repository via `linkSource` | `resource_id` |
| Fork count | `FORK_COUNT` (src/canvases.js): `canvas_forks` rows whose fork canvas still exists; `forked_at` | the only fork number |
| Hole starts | `startRabbitHole`: 201 new, 200 `existing: true`, 401 `signIn` (src/learn-boards.js) | successful start |
| Forks | `fork()`: 201 new, 200 `replayed: true`; Duplicate writes no `canvas_forks` row | successful fork |

No product analytics exists. The only persisted per-view records are `shared_ask_events` (0005: the shared Ask's usage
and rate limit, keyed by `viewer_email`). Analytics never reads it. The Tutor routes' `telemetry` objects are response
fields for benchmarks and are not stored.

## Identity and privacy

- **Signed-in viewer:** `viewer_user_id` is `users.id`, set by the server from the session, never from the client.
- **Anonymous viewer:** no identity. Only `visitor_id`, a random UUID in localStorage on the app origin. It is a
  browser, not a person: no cookie sync, no fingerprinting, nothing derived from IP or user agent. If localStorage is
  unavailable, the session id stands in, and the next session counts as a new visitor.
- **Learner key:** the server stores `learner_key = sha256Hex('publication-learner:u:' + users.id)` when signed in, else
  `sha256Hex('publication-learner:v:' + visitor_id)`. It is the same one-way pattern as `shareKey` and `publicationKey`.
  No raw `users.id` or `visitor_id` is stored.
- **Creator:** resolved by reference, `(org, canvas)` to `canvases.owner_email`, as `HANDLE_OF` does. Publication events
  store no creator field. `creator_profile_opened` has no canvas, so it stores `creator_key =
  sha256Hex('publication-creator:' + principal)`.
- **Owner self-views:** when the signed-in viewer owns the canvas, the server drops the event.
- **Never stored:** email, handle, name, IP (the ingest route never reads `CF-Connecting-IP`), user agent, referrer
  path or query, the raw `/e` token, free text the learner typed, Tutor messages, answers, or the viewer's hole name.
- **Never shown to the creator:** learner identity, email or handle, an individual misconception trail, an individual
  Next Step (hook) history, or an individual Rabbit Hole path.

## Attribution fields

Batch fields are sent once per request. Event fields are sent per event. Server fields are never accepted from the client.

| Field | Type | Set by | Source | Status |
|---|---|---|---|---|
| `publication_id` | `(org, canvas)` | server, from the token | `sharedRow` (`publication: true`) | exists |
| `source_canvas_id` | same pair | server | the publication's canvas, which is the source canvas | exists |
| `creator_internal_id` | by reference | server | `canvases.owner_email` | exists |
| `viewer_user_id` | string or null | server | `devIdentity` `userId` | exists |
| `visitor_id` | UUID | client, batch | localStorage | new |
| `viewer_session_id` | UUID | client, batch | sessionStorage (see Sessions) | new |
| `event_id` | UUID | client | `crypto.randomUUID()` | new |
| `board_version` | integer | client, batch | the `version` from the shared open; server keeps it only if `1..learn_boards.version`, else uses the current one | exists |
| `material_id` | string ≤ 200 | client | a block or exchange id on the published board; checked as `originOf` does | exists |
| `concept_ids` | string[] ≤ 32 | client | `resolveTarget`; server keeps only ids that card carries | exists for authored cards; a vocabulary across generated explainers is TBD-by-Learning |
| `claim_ids` | string[] ≤ 32 | client | that card's `journey.claims`; server keeps only those | journey-local today; publication-level claims TBD-by-Learning |
| `learning_goal` | string or null | client | `<journey_id>:<section_id>` from the card's journey stamp | TBD-by-Learning (no goal id exists) |
| `suggestion_id` | string | client | Professor Next Steps | TBD-by-Learning (#46 is blocked) |
| `resource_id` | string ≤ 200 | client | a `boardSources` key on this board, or `repo:<owner/name>` for its confirmed-public repository | exists |
| `source` | enum | client, on open | Traffic source | new |
| `received_at` | timestamp | server | receipt time, UTC; client clocks are not trusted | new |
| `idle_threshold_version` | integer | client, batch | Active learning time | new |

## Events

Exactly 13. "Once per" limits are enforced by the client and are harmless if broken: rollup flags are idempotent, and
the counters dedupe as described in Deduplication.

| Event | Fires when | Emitted by | Event fields |
|---|---|---|---|
| `publication_opened` | `/e/<token>` renders: a load, a reload, or a return from a hole | client | `source`, `utm_source?`, `utm_campaign?`, `referrer_host?` |
| `publication_session_started` | the first render in a new session | client | none |
| `publication_session_ended` | each `visibilitychange: hidden` and `pagehide`; repeats with cumulative totals | client | `elapsed_session_seconds`, `active_learning_seconds`, `idle_seconds` (integers) |
| `material_seen` | a card is ≥ 50% in the viewport for ≥ 2 s; once per card per session | client | `material_id`, `concept_ids`, `claim_ids`, `learning_goal` |
| `material_interacted` | the first selection, input, play, answer or pager change on a card; once per card per session | client | `material_id`, `concept_ids`, `claim_ids`, `learning_goal` |
| `concept_explored` | the learner interacts with, asks about or starts a hole from a card carrying the concept; once per concept per session | client | `concept_id`, `material_id`, `via: 'interaction' \| 'ask' \| 'rabbit_hole'` |
| `next_steps_shown` | Professor Next Steps are displayed | client | `suggestion_ids`, `positions`, `concept_ids` (all TBD-by-Learning) |
| `next_step_selected` | a Next Step is chosen | client | `suggestion_id`, `position`, `concept_ids`, `kind` (all TBD-by-Learning) |
| `rabbit_hole_started_from_publication` | `startRabbitHole` creates a hole (201) through a publication token | server, in the same `db.batch` as the hole rows | `material_id` (null for root), `concept_ids` (from `originOf`) |
| `rabbit_hole_returned` | `/e` loads from the hole's Rabbit Holes Map shared level (`Dive.jsx` `go` → `window.location.assign`); a plain reload is not a return | client | none |
| `fork_completed` | `fork()` makes a fork (201) whose source came through a publication token | server, in the same `db.batch` as the fork rows | none |
| `outbound_resource_opened` | the learner opens a resource from a card, such as a paper, a video in a new tab, or the public repository | client | `resource_id`, `material_id` |
| `creator_profile_opened` | `/@handle` renders (#63; not emitted before it exists) | client | `source`; the server resolves the handle to `creator_key` |

Never emitted: on a click before sign-in, a failed request, a 200 `existing: true` hole, a 200 `replayed: true` fork, a
Duplicate, the owner's own view, or a dead token (unpublished, archived, in Trash: `sharedRow` returns null and the
event is dropped).

## Traffic source

`source` is one of `linkedin | explore | creator_profile | direct | other_referrer`, decided once per session on
`publication_opened` (and on `creator_profile_opened`):

1. `utm_source=linkedin`, or a referrer host of `linkedin.com`, `*.linkedin.com` or `lnkd.in`: `linkedin`.
2. A same-origin referrer path of `/explore` (Explore cards are plain `<a href="/e/...">` links, Home.jsx): `explore`.
3. A same-origin referrer path of `/@<handle>`: `creator_profile`.
4. Any other external referrer host: `other_referrer`.
5. No referrer: `direct`.

Sanitizing:
- `referrer_host` is stored only for `other_referrer`: the hostname alone, lowercased, ≤ 100 characters. No path,
  query or fragment.
- `utm_source` and `utm_campaign` are the only parameters read. Each is lowercased and kept only if it matches
  `[a-z0-9._-]{1,40}`; otherwise it is dropped. No other query string is stored.
- A same-origin return (from a hole) keeps the session's first source.

## Revisions

Publications are live (explore-publish.md), so every event records `board_version` (`learn_boards.version`).

- **Materially different:** a version whose **card set** differs from the previous version's. The card set is the
  set of block and exchange ids with each one's `concept_ids`. A text edit inside a card, a move or a resize keeps the
  card set. A card added or removed, or a concept retagged, changes it.
- **Segment:** consecutive versions with the same card set. The server computes the card-set key once per newly seen
  version, not per event.
- **Mixing:** metrics keyed by concept or by publication span segments, because the ids are stable. Metrics that
  depend on board order (drop-off) use one segment only.
- **Comparison:** two adjacent segments side by side, each suppressed on its own cohort. It is **descriptive only.**
  The UI says "Before / after <date>" and never "improved because of".

## Outbound resources

- Only links that are part of the explainer count: a `resource_id` the server finds in `boardSources(state)` of the
  published board, or the publication's confirmed-public repository. Anything else is dropped.
- A new resource kind (such as articles) is added to `boardSources` first, never tracked ad hoc.
- Nothing is tracked outside Rabbit Hole: no redirect wrapper and no follow-up browsing.

## Active learning time

- `IDLE_THRESHOLD_V1 = 60 s`. Every batch carries `idle_threshold_version: 1`, and a later threshold is a new version.
- Each second of a session is **active** when the tab is visible and an activity signal occurred within the last
  60 s. Otherwise it is **idle**. `elapsed = active + idle`; hidden time is idle.
- **Activity signals:** card interaction, Tutor input, canvas pan, zoom or scroll, interactive material use, a Next
  Step selection, and hole traversal (start or return).
- The client counts locally and reports cumulative totals on every `publication_session_ended`. The server keeps the
  increase over that session's previous report, clamps active to ≤ elapsed, and caps a session at 4 h active.
- The creator metric is active time, never page dwell (close − open).

## Deduplication

| Term | Definition |
|---|---|
| **Session** | One tab's continuous visit to one publication. `viewer_session_id` lives in sessionStorage under that token. A reload and a return from a hole keep it; 30 min without activity, or a new tab, starts a new one. |
| **Total opens** | Distinct sessions with a `publication_opened`. A reload or a return within the session adds nothing. |
| **Unique visitor** | Distinct `learner_key`: an account once, across its devices; an anonymous browser once. |
| **Signed-in learner** | Distinct `learner_key` of the `u:` kind. |
| **Successful Rabbit Hole start** | A `rabbit_hole_started_from_publication` row. It is written only with a 201 in the same batch as the hole, so a click before sign-in, a failure, or a resume that finds the existing hole (200) never counts. |
| **Successful fork** | A `fork_completed` row, written only with a 201 in the same batch as `canvas_forks`. A replay (`replayed: true`), a failure or a Duplicate never counts. |
| **Replays** | `event_id` is the primary key, so a resent event is ignored, and rollups update only when the insert lands. |
| **Sign-in merge** | When a request carries a `visitor_id` and a signed-in session, the server re-keys that visitor's rows on that publication (raw and rollups) to the user's key, once. |

### Limitations

- Anonymous counts are browsers. One person on two devices or browsers, or after clearing storage, counts twice. Two
  people on one shared browser count once. No cross-device matching is attempted.
- The sign-in merge covers only the publication and the browser where the person signed in.
- A scripted client can inflate anonymous counts. Explore lists by publication time with no engagement ranking, so
  inflation buys no placement.
- Comparing two ranges, or two revisions, whose cohorts differ by a few learners can narrow one learner's
  contribution. V1 accepts this: no identity is attached, and no per-learner row is ever returned.
- On a canvas, board order is not reading order. Drop-off uses board order (`state.blocks`) as an approximation.

## Forks

- The fork count is `FORK_COUNT`, never a second definition. All-time is `FORK_COUNT` itself.
- A ranged count is the same rows (`canvas_forks` joined to a live fork canvas, direct forks of this canvas) filtered by
  the date part of `forked_at`. `fork()` writes an ISO string; older rows hold SQLite `datetime`.
- `FORK_COUNT` also counts forks made through a `/b` link or by the owner. **Fork conversion** counts only learners of
  the publication: `fork_completed` rows.

## Derived metrics

The 10-06 per-explainer metrics. Where "Dashboard read contract" differs it wins: no drop-off, and Concepts needing
support only from assessment outcomes.

Ranges: `7d` and `30d` are the most recent 7 or 30 UTC days including today. `all` runs from collection start
(`collected_since`). A rate is a number from 0 to 1. "Eligible" means distinct learner keys in the range (and in the
filter, if any).

**Public** counters show at any count. **Suppressed** metrics are `null` unless their exact filtered cohort has ≥ 10
unique learners.

| Metric | Formula | Source events | Type | Kind | Ranges |
|---|---|---|---|---|---|
| `total_opens` | distinct sessions with `publication_opened` | publication_opened | count | public | 7d / 30d / all |
| `unique_visitors` | distinct `learner_key` | any client event | count | suppressed (cohort = itself) | 7d / 30d / all |
| `signed_in_learners` | distinct `u:` keys | any client event | count | suppressed | 7d / 30d / all |
| `avg_active_seconds` | mean over learners with a session report of Σ `active_learning_seconds` in range | publication_session_ended | seconds | suppressed | 7d / 30d / all |
| `engaged_learners_2m` | learners with Σ active ≥ 120 s in range | publication_session_ended | count | suppressed | 7d / 30d / all |
| `concept_exploration[X]` | learners with `concept_explored` X ÷ learners with `material_seen` carrying X | material_seen, concept_explored | rate per concept | suppressed per concept (cohort = saw X) | 7d / 30d / all |
| `deeper_branch_rate` | learners with a hole start or a deeper `next_step_selected` ÷ eligible. Until Next Steps exist, it equals `rabbit_hole_start_rate`. | rabbit_hole_started_from_publication, next_step_selected | rate | suppressed | 7d / 30d / all |
| `deeper_rate[X]` | learners with a hole start or Next Step carrying X ÷ learners who saw X | same, plus material_seen | rate per concept | suppressed per concept | 7d / 30d / all |
| `rabbit_holes_started` | count of start rows | rabbit_hole_started_from_publication | count | public | 7d / 30d / all |
| `rabbit_hole_start_rate` | distinct starters ÷ eligible | same | rate | suppressed | 7d / 30d / all |
| `fork_count` | `FORK_COUNT` (all) or its rows by `forked_at` | canvas_forks (no event) | count | public | 7d / 30d / all |
| `fork_rate` | distinct forkers ÷ eligible | fork_completed | rate | suppressed | 7d / 30d / all |
| `highest_friction_concept` | concept with the highest failed or uncertain outcome rate among ≥ 10 attempting learners | none yet (open question B) | concept id | suppressed; `not_collected` today | — |
| `next_step_impressions` | count of shown suggestions | next_steps_shown | count | suppressed | TBD-by-Learning |
| `next_step_selections` | count of selections | next_step_selected | count | suppressed | TBD-by-Learning |
| `most_selected_next_step` | `suggestion_id` with the most selections ÷ impressions | both | suggestion id | suppressed | TBD-by-Learning |
| `next_step_position_bias` | selections ÷ impressions per position | both (`position`) | rate per position | suppressed per position | TBD-by-Learning |
| `resource_opens[R]` | distinct learners with `outbound_resource_opened` R | outbound_resource_opened | count per resource | suppressed per resource | 7d / 30d / all |
| `traffic[S]` | distinct learners whose first session in range came from S | publication_opened (`source`) | count per source | suppressed per source | 7d / 30d / all |
| `drop_off[M]` | 1 − seen(M) ÷ seen(first card), in board order | material_seen | rate per card | suppressed (cohort = saw first card) | 7d / 30d; current segment only |
| `profile_views` | distinct sessions with `creator_profile_opened` | creator_profile_opened | count | public | after #63 |

## Analytics UI (read contract)

The read API is not built; the UI is, in its typed empty states ("UI as built" below). The UI reuses the existing card
menu and panels (CLAUDE.md: no separate pages).

### Entry point

- The owned-card ⋮ (visibility-menu.md) gets **Analytics**, only when the card's `access` is `public`. Position in the unified owned-card menu (visibility-menu.md):
  in the Visibility group, after the link and thumbnail actions.

  ```
  Visibility ›
  Share / Manage link
  Copy link
  Change thumbnail
  Use canvas snapshot  (only while a custom thumbnail is set)
  Analytics            (public canvases only)
  ```

- Projects (`repo-*`) cannot be published today (the publish route matches canvases only), so no project shows the item
  until one can.
- Nobody but the owner ever sees the item. The read route answers 401 when signed out and **404 to every signed-in
  non-owner** (not 403, so existence is not revealed).
- It opens the per-explainer view as a panel on the canvas page: `/apps/<canvas>?analytics=1`, read once and dropped,
  as `?share=1` is.
- The card face stays as it is. Later it may show only `learners` and `forks`, under the same suppression rules.

### Two levels

| Level | Where | Shows |
|---|---|---|
| Per-explainer | ⋮ → Analytics on one public canvas | One publication: the metrics table above, insights, traffic, revisions |
| Creator | The owner's own creator profile (#63), as a private section | All their publications: dashboard, comparison, "audience wants next" |

### Per-explainer view

- A range switch (7d / 30d / all).
- Headline: unique visitors (with signed-in learners), total opens, average active time, engaged > 2 min.
- Concept exploration and deeper rate per concept, labelled from the current board (`CONCEPTS` / journey registry
  labels), falling back to the id.
- Rabbit Hole starts and conversion; forks and conversion.
- Highest friction ("Not collected yet").
- Next Steps block (TBD-by-Learning; "Not collected yet").
- Outbound resources, then traffic source, then revision comparison.
- Insights sit at the top.

### Insights: "What your audience is telling you"

Deterministic rules over suppressed-checked aggregates of the selected range. No LLM writes or picks an insight. Each
card shows its evidence number. At most one card per type; none fires means "No clear signal yet".

| Insight | Rule | Threshold | Action |
|---|---|---|---|
| High curiosity | the concept with the highest `deeper_rate[X]`; ties go to the larger cohort | cohort ≥ 10 and rate ≥ 0.20 | [Create explainer]: Create next with X |
| Highest friction | `highest_friction_concept` | ≥ 10 attempting and rate ≥ 0.30; `not_collected` today | [Improve this section]: opens the canvas at the first card carrying X |
| Repeated comparison | the comparison target most selected by learners | ≥ 10 distinct learners; needs a canonical comparison signal from Learning (TBD-by-Learning), never learner text | [Create comparison]: Create next with "X vs Y" |
| Drop-off | the card M with the largest step drop (seen(prev) − seen(M)) ÷ seen(first), in the current segment | cohort ≥ 10 and step drop ≥ 0.25 | [Review section]: opens the canvas at M. Copy: "N% leave before <card name>" (`cardName`) |

### Create next explainer

- **Signals:** the most-selected Next Step (TBD-by-Learning), the high-curiosity concept, and the repeated comparison.
- **Template:** `Create a short interactive explainer about {topic}, informed by what learners explored in my {explainer
  title} explainer.` `{topic}` is the suggestion or concept label; for a comparison, `{X} vs {Y}`. Only labels and the
  title go in, never learner text or numbers about individuals.
- **Flow:** it makes a new **private** canvas through the existing create route (`POST /api/canvases`). The request is
  pre-filled in its composer, **not sent**. The creator sends it and reviews the result. Publishing stays the
  explicit Publish to Explore; nothing auto-publishes.

### Creator dashboard (private, #63)

| Item | Definition |
|---|---|
| Unique learners | distinct `learner_key` across the creator's canvases with data |
| Average active time | mean over (learner, explainer) pairs of Σ active |
| Rabbit Hole starts | the sum, a public counter |
| Forks | Σ `FORK_COUNT`, a public counter |
| Top explainers | by unique visitors in range; explainers with fewer than 10 are listed without a number |
| Highest-friction concepts | `not_collected` today |
| Audience wants next | concepts ranked by `deeper_rate` across explainers, plus Next Step targets (TBD-by-Learning) |
| Traffic sources | `traffic[S]` summed over explainers, each cell suppressed |
| Recent trend | daily `total_opens` (public) and daily unique visitors (each day suppressed below 10) |

### Explainer comparison

- One row per explainer with learners, average active time, started-RH %, forks, and one range for all rows.
- A suppressed cell shows the suppressed state, never 0. Sorting uses only non-suppressed values.
- Average time compares only rows of the same `idle_threshold_version`; a row with none is `not_collected`.

### Traffic sources, revisions and suppressed state

- **Traffic:** the five categories with learner counts. `other_referrer` can expand to hosts, each with ≥ 10 learners.
- **Revisions:** a list of segments (start date, versions). "Compare" puts two adjacent segments side by side with the
  descriptive-only note.
- **Suppressed:** a metric with `suppressed: true` renders "Not enough learners yet (fewer than 10)". With `reason:
  'not_collected'` it renders "Not collected yet". Neither is ever a 0 or an estimate.

### Profile split

- **Public** `/@handle`: the public explainer count (the `explore()` filter for that owner); learners (unique visitors
  across their public canvases, shown at ≥ 10); forks (Σ `FORK_COUNT`); and Rabbit Hole starts. Until storage exists,
  only the explainer count and forks.
- **Private:** everything else, including friction, insights and recommendations. Never shown publicly by default.

### Read API

**Superseded 2026-10-23** by "Dashboard read contract" above: one route, `GET /api/analytics/creator` with an optional
`canvas` filter, and the six states. The per-publication route below is not built; its metrics are the `canvas_detail`
section. Kept as the record of the 10-06 design.

```ts
type Range = '7d' | '30d' | 'all';
type Metric<T> = { value: T | null; suppressed: boolean; reason?: 'insufficient_cohort' | 'not_collected' };
type ViewState = 'loading' | 'not_collected' | 'ready'; // 'loading' is the client's own; the server returns the other two

// GET /api/analytics/publications/<canvas>?range=7d|30d|all[&segment=<first version>]
type PublicationAnalytics = {
  state: 'not_collected' | 'ready';
  range: Range; collected_since: string | null; threshold: 10; idle_threshold_version: number;
  segments: { first_version: number; started_at: string }[];
  metrics: {
    total_opens: Metric<number>; unique_visitors: Metric<number>; signed_in_learners: Metric<number>;
    avg_active_seconds: Metric<number>; engaged_learners_2m: Metric<number>;
    concepts: { concept_id: string; label: string | null; exploration: Metric<number>; deeper: Metric<number> }[];
    deeper_branch_rate: Metric<number>;
    rabbit_holes_started: Metric<number>; rabbit_hole_start_rate: Metric<number>;
    fork_count: Metric<number>; fork_rate: Metric<number>;
    highest_friction_concept: Metric<{ concept_id: string; label: string | null }>;
    next_step_impressions: Metric<number>; next_step_selections: Metric<number>;        // TBD-by-Learning
    most_selected_next_step: Metric<{ suggestion_id: string; label: string | null }>;  // TBD-by-Learning
    next_step_position_bias: Metric<{ position: number; rate: number }[]>;             // TBD-by-Learning
    resources: { resource_id: string; opens: Metric<number> }[];
    traffic: { source: 'linkedin' | 'explore' | 'creator_profile' | 'direct' | 'other_referrer'; learners: Metric<number> }[];
    drop_off: { material_id: string; label: string; rate: Metric<number> }[];
  };
  insights: { type: 'high_curiosity' | 'highest_friction' | 'repeated_comparison' | 'drop_off'; subject: string; evidence: number; action: string }[];
};

// GET /api/analytics/creator?range=7d|30d|all  (the session's own canvases; no handle parameter)
type CreatorAnalytics = {
  state: 'not_collected' | 'ready'; range: Range;
  totals: { unique_learners: Metric<number>; avg_active_seconds: Metric<number>; rabbit_holes_started: Metric<number>; fork_count: Metric<number> };
  explainers: { canvas: string; title: string; learners: Metric<number>; avg_active_seconds: Metric<number>; rabbit_hole_start_rate: Metric<number>; fork_count: Metric<number> }[];
  wants_next: { concept_id: string; label: string | null; deeper: Metric<number> }[];
  friction: Metric<{ concept_id: string; label: string | null }[]>;
  traffic: PublicationAnalytics['metrics']['traffic'];
  trend: { day: string; opens: Metric<number>; visitors: Metric<number> }[];
};
```

- Suppression is per metric, per range, per filter (concept, source, resource, segment, day).
- A suppressed or not-collected metric has `value: null`.
- Neither route ever returns a learner key, an id of a person, a hole name or any free text.

### UI as built (#70, typed empty states)

The UI exists. The data does not, so every view renders `not_collected` from constants in `web/src/creator-analytics.js`. The components are in `web/src/CreatorAnalytics.jsx`. The views call no route, and `e2e/analytics-ui-check.mjs` checks that no `/api/analytics` request is made.

- **Entry points:**
  - **Per explainer:** ⋮ → **Analytics** on your own public canvas in the Library, after Share / Manage link (`LibraryViews.jsx`; `data-menu-analytics`). It is never shown on a private or unlisted canvas or a project, nor on anyone else's card in Explore or a profile.
  - **Creator:** **Analytics** on your own `/@handle` (creator-profile.md).
  - Both open as a side panel (`SlidePanel`) beside the page, never mixed into it.
- **Departure from the entry point proposed above:** the panel opens over the Library, not at `/apps/<canvas>?analytics=1` on the canvas page. The canvas page (`LearnPage.jsx`, `CanvasPage.jsx`) belongs to the persistence lane. The panel component can be mounted there later unchanged.
- **Both views:**
  - "Private · only you see this.";
  - the 7 days / 30 days / All time control (it changes nothing while nothing is collected);
  - the banner "Not collected yet. Rabbit Hole does not record what learners do on public explainers yet, so nothing here is counted or estimated."
- **Per explainer (A):** every metric of the table above, under Audience, Concepts, Rabbit Holes and forks, Professor Next Steps and Outbound resources. Then come:
  - **Insights (B):** "What your audience is telling you". Its empty state is "No insights yet", and it explains that insights come only from what learners do.
  - **Create next explainer (C):** a disabled button, "Available once learners show what they want next".
  - **Traffic sources (F):** the five categories.
  - **Revision comparison (G):** Before / after, descriptive only.
- **Creator (D, E):**
  - **Totals:** unique learners, average active time and Rabbit Holes started; canonical forks; public explainers.
  - Audience wants next, highest-friction concepts, the explainer comparison table, traffic sources and the recent trend.
  - **Comparison:** one row per public explainer. Its learners, average active time and started-RH cells read "Not collected"; forks show the canonical count.
- **Numbers shown:** only the public counters that already exist canonically, `FORK_COUNT` (labelled "· all time", since it is not range-filtered) and the public explainer count. Learner counts do not exist and are not shown.
- **Suppressed state (H):** every view ends with "How to read this". It renders both typed states as they will appear: "Not collected yet", and "Not enough learners yet (fewer than 10)" for `insufficient_cohort`. Neither is ever shown as 0 or an estimate.

### UI checkpoint: required Figma panels

Owner section 14, for when the UI work begins. Non-blocking unless a new product ambiguity appears.
- A. Per-explainer analytics
- B. Insights, "What your audience is telling you"
- C. Create next explainer action
- D. Creator-level analytics
- E. Explainer-by-explainer comparison
- F. Traffic source breakdown
- G. Revision comparison
- H. Suppressed metric state (< 10 learners)

## What the creator profile will read

- The public explainer count and the explainer cards come from canonical rows: `canvas_publications` joined as
  `explore()` does for that owner (live, top-level, not in Trash).
- The identity is `user_handles.handle`, `user_profiles.name` and `avatar`, by reference. Nothing is copied.
- Forks: Σ `FORK_COUNT`.
- Learners and Rabbit Hole starts come from the rollups (after GO).
- The owner's private section reads `/api/analytics/creator`.

## Retention

- **Raw events:** 90 days. Pruned on the next ingest or analytics read, as `learn_grades` is pruned (repository-schema.sql),
  not by cron.
- **Daily rollups and revision segments:** kept for the life of the canvas.
  - Unpublish, Archive and Trash keep them, and no new events arrive because the token is dead.
  - Permanent delete is not built; when it is, it deletes these too (library-trash.md lists analytics retention as part
    of that decision).
- **Account deletion,** when it exists, deletes the rows under that person's learner key, which can be computed from
  their id.
- **`visitor_id`** stays in the browser until the browser clears it.

## Storage proposal (NOT implemented; needs owner GO)

**Superseded 2026-10-23** by docs/features/creator-analytics-storage-proposal.md (adds sessions, campaigns, returning
learners and the exact migration). No migration file exists. The tables below are the 10-06 draft.

- **Where:** LEARN_DB, beside `canvas_publications` and `learn_boards`. Learn routes never read the main D1
  (user-handles.md).
- **Migration:** the next free learn migration number at merge time (`0011` after `0010-library-trash` on this branch).
  It is additive and re-runnable, `CREATE TABLE/INDEX IF NOT EXISTS`, and runs on local test databases only until a
  deploy GO.

```sql
-- Raw events, 90 days. event_id is the replay guard. org/canvas are NULL only for creator_profile_opened.
CREATE TABLE IF NOT EXISTS publication_events (
  event_id TEXT PRIMARY KEY, type TEXT NOT NULL, received_at TEXT NOT NULL,
  org TEXT, canvas TEXT, creator_key TEXT, board_version INTEGER,
  session_id TEXT NOT NULL, learner_key TEXT NOT NULL, signed_in INTEGER NOT NULL DEFAULT 0,
  source TEXT, utm_source TEXT, utm_campaign TEXT, referrer_host TEXT,
  material_id TEXT, concept_ids TEXT, claim_ids TEXT, learning_goal TEXT, suggestion_id TEXT, resource_id TEXT,
  elapsed_seconds INTEGER, active_seconds INTEGER, idle_seconds INTEGER, idle_threshold_version INTEGER
);
CREATE INDEX IF NOT EXISTS publication_events_canvas ON publication_events (org, canvas, received_at);
CREATE INDEX IF NOT EXISTS publication_events_session ON publication_events (session_id, type);

-- One row per learner, publication, UTC day and revision segment; upserted in the ingest batch.
CREATE TABLE IF NOT EXISTS publication_learner_days (
  org TEXT NOT NULL, canvas TEXT NOT NULL, learner_key TEXT NOT NULL, day TEXT NOT NULL, segment INTEGER NOT NULL,
  signed_in INTEGER NOT NULL DEFAULT 0, source TEXT, opens INTEGER NOT NULL DEFAULT 0,
  active_seconds INTEGER NOT NULL DEFAULT 0, idle_seconds INTEGER NOT NULL DEFAULT 0, elapsed_seconds INTEGER NOT NULL DEFAULT 0,
  idle_threshold_version INTEGER, holes_started INTEGER NOT NULL DEFAULT 0, forks INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (org, canvas, learner_key, day, segment)
);

-- Per learner and item: kind 'concept' (seen, explored, deeper) or 'resource' (opened). Next Step items wait for Learning.
CREATE TABLE IF NOT EXISTS publication_learner_items (
  org TEXT NOT NULL, canvas TEXT NOT NULL, learner_key TEXT NOT NULL, day TEXT NOT NULL, segment INTEGER NOT NULL,
  kind TEXT NOT NULL, item_id TEXT NOT NULL,
  seen INTEGER NOT NULL DEFAULT 0, acted INTEGER NOT NULL DEFAULT 0, deeper INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (org, canvas, learner_key, day, segment, kind, item_id)
);

-- Revision segments: one row per board version first seen by ingest.
CREATE TABLE IF NOT EXISTS publication_revisions (
  org TEXT NOT NULL, canvas TEXT NOT NULL, version INTEGER NOT NULL,
  card_set_key TEXT NOT NULL, segment INTEGER NOT NULL, first_seen_at TEXT NOT NULL,
  PRIMARY KEY (org, canvas, version)
);
```

### Ingest route (proposed)

`POST /api/learn/boards/shared/<token>/events`, with the body `{ visitor_id, session_id, board_version,
idle_threshold_version, events: [...] }`.
- It accepts publication tokens only (`sharedRow` `publication: true`) and answers 404 otherwise.
- Limits: ≤ 50 events and ≤ 64 KB per request, plus a per-session cap. It sends with `navigator.sendBeacon` on
  `pagehide`, and answers 204.
- It drops owner self-views and validates every id against the published board.
- It inserts raw rows with `INSERT OR IGNORE` and upserts the rollups in one batch.
- The two server events are written by `startRabbitHole` and `fork()`, inside their existing batches.

### Volume

| Item | Estimate |
|---|---|
| Raw events | About 25 per session: 1 open, 1 start, about 2 ends, about 15 seen, about 5 interacted, about 3 concepts |
| At 1k sessions/day | About 25k raw rows/day, so about 2.3M rows at the 90-day steady state (about 0.6 GB at about 250 B/row) |
| Rollups | About 800 learner-days and about 8k item rows per day, so about 3.2M rows/year (about 0.3 GB) |
| Writes | About 1M rows/month, inside the 50M rows written/month that Workers Paid includes (Cloudflare D1 pricing) |
| Above about 50k sessions/day | Revisit: a dedicated analytics D1 or sharding |

Workers Analytics Engine is not proposed. It downsamples at high volume (Cloudflare docs, "Sampling"), so its counts
become estimates, which the owner ruled out.

## Open questions for the owner

A. **Republish.** Removing from Explore and publishing again mints a new token (explore-publish.md). Analytics:
   1. accumulate per canvas `(org, canvas)` across publish periods; or
   2. reset with each new token.

   **Recommend 1:** the explainer is the canvas, and the token is only its read capability.

B. **Friction source.** The evaluate route needs an owned app (`tutorRoute` → `authorizedBoardApp`), so a public viewer
   produces no evaluation today. Options:
   1. keep `highest_friction_concept` `not_collected` until Learning defines a publication-safe outcome event keyed by
      `claim_ids` / `concept_ids`; or
   2. add an outcome-only event (`correct | incorrect`, no answer text) from deterministic card checks such as quiz
      `correct` options.

   **Recommend 1:** Learning owns evidence, and #46 already waits on its contract.

C. **Revision boundary.** Options:
   1. card-set change only (above);
   2. card-set change plus a creator-marked "new period from now" in the Analytics panel; or
   3. every content save.

   **Recommend 2:** "Improve this section" edits text inside a card. Under 1 that edit is no boundary, so the
   before/after the owner described could not be shown.

D. **Raw retention.** Options: 90 days, 180 days, or the life of the canvas. Ranges are served from rollups in every
   case. **Recommend 90 days:** it is the shortest window that covers 7d and 30d, re-keying and debugging.

E. **The word "learners" for the mixed count.** It counts anonymous browsers too, and the brief asks for accurate
   terms. Options:
   1. label it "Unique visitors", with "N signed in" beside it, and use "learners" only for signed-in counts; or
   2. keep "learners" for the mixed count, with a footnote.

   **Recommend 1.** It changes the profile mock's "18k learners" to "18k visitors".

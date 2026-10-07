# Creator analytics: event contract and Analytics UI

Owner briefs, 2026-10-06 (#62: analytics, creator profile, analytics UI, feedback loop). **This is a contract only.** Nothing
here is built: no event is emitted, no route exists, no table is created. Storage is a separate proposal at the end and
needs the owner's GO. Until then the Analytics UI shows its typed "not collected" state and never derives numbers from
anything else.

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

Nothing here is built. The UI reuses the existing card menu, panels and the canvas page (CLAUDE.md: no separate pages).

### Entry point

- The owned-card ⋮ (visibility-menu.md) gets **Analytics**, only when the card's `access` is `public`. Proposed position:
  in the Visibility group, after Share / Manage link.

  ```
  Visibility ›
  Share / Manage link
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

Not built. Until #62 storage has a GO, these routes do not exist. The client calls nothing and renders
`state: 'not_collected'` from a constant.

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

No migration file exists. The tables below are a proposal for review only.

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

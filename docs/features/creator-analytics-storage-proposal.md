# Creator analytics: storage and production migration proposal

**Status: PROPOSAL ONLY. Nothing here is implemented, and no migration file exists.** The owner approves storage and
its production migration separately (owner brief 2026-10-23). The read route and its states are built
(creator-analytics-contract.md, "Dashboard read contract"); this document supersedes the 10-06 draft "Storage proposal"
at the end of that contract.

What approval would unlock: every metric that reads `not_collected` with reason `storage_not_approved`, plus Rabbit Holes
started, ranged and campaign-attributed forks, and campaigns. Concepts needing support and supported Next Steps still
wait on Learning, and "What would you like next?" on its own collection contract (see "Not in this migration").

## 1. Design choices

| Choice | Proposal | Why |
|---|---|---|
| Database | `LEARN_DB`, beside `canvas_publications`, `canvas_forks` and `learn_boards` | the read joins `PUBLISHED`; Learn routes never read the main D1 |
| Unit of storage | **one row per session** plus one row per (session, item); no raw event log | visits, conversion, active time, returning learners, traffic and campaigns are all session facts. Fewer rows cost less and hold less about anyone. |
| Replay guard | `publication_event_ids` (event id, 2-day life) | a resent beacon must not count twice; sessions and items are idempotent upserts anyway |
| Learner identity | `learner_key` = one-way hash, as the 10-06 contract (`sha256Hex('publication-learner:u:' + users.id)` or `':v:' + visitor_id`) | no email, user id, IP or user agent is stored |
| Session identity | `session_key` = `sha256Hex('publication-session:' + viewer_session_id)` | the raw session id stays in the browser |
| Rollups | none in V1; the read aggregates sessions in SQL | distinct counts over a range (unique visitors, returning) cannot be summed from daily rollups without estimating, which the owner ruled out |
| Days | `day` = UTC date of `started_at` (`TIMEZONE = 'UTC'`) | the reporting timezone in the header; a creator timezone needs hourly buckets (later) |

## 2. Tables (proposed migration `learn 0027-publication-analytics`)

Number: **0027**, the next free number after `0026-tutor-attempts` on `main` at 2026-10-23. If another lane takes 0027
first, this takes the next free number at merge time; the number is reserved only by the owner's GO.

```sql
-- learn 0027-publication-analytics. Creator analytics storage (docs/features/creator-analytics-storage-proposal.md,
-- owner brief 2026-10-23). Rules:
--   * Additive and re-runnable, CREATE only (scripts/schema-check.test.mjs). LEARN_DB only. Mirrored in repository-schema.sql.
--   * Applied locally, then learn-dev after its GO; production waits for its own GO.
--   * Public Explore publications only: no row for a private canvas, an unlisted /b link or its embed.
--   * No email, users.id, IP, user agent, referrer path or query, free text, answer, Tutor message or hole name.
--   * No backfill: nothing is derived from shared_ask_events, usage accounting, billing or any log.

-- One deduplicated session (a visit) on one publication. Upserted by the ingest route; the server events update it.
--   * learner_key / session_key: one-way hashes (see design choices). signed_in: 1 for an account key.
--   * day: UTC date of started_at. source: newsletter|linkedin|explore|creator_profile|direct|other_referrer.
--   * campaign_id: a publication_campaigns id when the link carried ?c=; null otherwise.
--   * embed: 1 for /embed/e; a frame's session is written only once the frame is >= 50% visible for 2 s.
--   * first_learning_at: the first learning action (contract "Definitions"); null = a visit with no active learning.
--   * active/idle/elapsed seconds: the largest cumulative report received, active clamped to elapsed and to 14400.
CREATE TABLE IF NOT EXISTS publication_sessions (
  session_key TEXT PRIMARY KEY, org TEXT NOT NULL, canvas TEXT NOT NULL, learner_key TEXT NOT NULL,
  signed_in INTEGER NOT NULL DEFAULT 0, day TEXT NOT NULL, started_at TEXT NOT NULL, last_seen_at TEXT NOT NULL,
  source TEXT NOT NULL, referrer_host TEXT, campaign_id TEXT, embed INTEGER NOT NULL DEFAULT 0,
  board_version INTEGER, first_learning_at TEXT,
  active_seconds INTEGER NOT NULL DEFAULT 0, idle_seconds INTEGER NOT NULL DEFAULT 0, elapsed_seconds INTEGER NOT NULL DEFAULT 0,
  idle_threshold_version INTEGER NOT NULL DEFAULT 1,
  holes_started INTEGER NOT NULL DEFAULT 0, forks INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS publication_sessions_canvas_day ON publication_sessions (org, canvas, day);
CREATE INDEX IF NOT EXISTS publication_sessions_learner ON publication_sessions (org, canvas, learner_key, day);
CREATE INDEX IF NOT EXISTS publication_sessions_campaign ON publication_sessions (campaign_id, day) WHERE campaign_id IS NOT NULL;

-- What a session did with one item, once per (session, kind, item, via).
--   * kind 'topic': item_id a concept id; via exploration|rabbit_hole|next_step (Topics explored next).
--   * kind 'card': item_id a block or exchange id on the published board (most-used cards).
--   * kind 'resource': item_id a boardSources key or repo:<owner/name> (outbound resources).
--   * Later kinds, each with its own GO: 'outcome' (assessment, Learning), 'next_step_shown', 'request'.
CREATE TABLE IF NOT EXISTS publication_session_items (
  session_key TEXT NOT NULL, org TEXT NOT NULL, canvas TEXT NOT NULL, day TEXT NOT NULL,
  kind TEXT NOT NULL, item_id TEXT NOT NULL, via TEXT NOT NULL DEFAULT '', board_version INTEGER,
  PRIMARY KEY (session_key, kind, item_id, via)
);
CREATE INDEX IF NOT EXISTS publication_session_items_canvas ON publication_session_items (org, canvas, kind, day);

-- A named campaign on the canonical publication link (/e/<token>?c=<id>). Attribution metadata only: it never mints or
-- rotates a token, changes visibility or permissions, or touches a guest allowance.
CREATE TABLE IF NOT EXISTS publication_campaigns (
  id TEXT PRIMARY KEY, org TEXT NOT NULL, canvas TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('newsletter_issue', 'linkedin_post', 'website_placement')),
  label TEXT NOT NULL, created_at TEXT NOT NULL, archived_at TEXT,
  UNIQUE (org, canvas, label)
);

-- Revision segments, one row per board version first seen by ingest (contract "Revisions").
CREATE TABLE IF NOT EXISTS publication_revisions (
  org TEXT NOT NULL, canvas TEXT NOT NULL, version INTEGER NOT NULL,
  card_set_key TEXT NOT NULL, segment INTEGER NOT NULL, first_seen_at TEXT NOT NULL,
  PRIMARY KEY (org, canvas, version)
);

-- When collection started for a publication: "All time" runs from here, never before.
CREATE TABLE IF NOT EXISTS publication_analytics_since (
  org TEXT NOT NULL, canvas TEXT NOT NULL, collected_since TEXT NOT NULL, PRIMARY KEY (org, canvas)
);

-- Replay guard: a client event id seen in the last 2 days. Pruned on ingest.
CREATE TABLE IF NOT EXISTS publication_event_ids (event_id TEXT PRIMARY KEY, received_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS publication_event_ids_received ON publication_event_ids (received_at);
```

Rollback SQL, run only on the owner's instruction after an export, and only if the feature is withdrawn (turning the
flag off is the normal rollback, see section 7):

```sql
DROP TABLE IF EXISTS publication_event_ids; DROP TABLE IF EXISTS publication_analytics_since;
DROP TABLE IF EXISTS publication_revisions; DROP TABLE IF EXISTS publication_campaigns;
DROP TABLE IF EXISTS publication_session_items; DROP TABLE IF EXISTS publication_sessions;
```

## 3. Routes

| Route | Who | Does |
|---|---|---|
| `POST /api/learn/boards/shared/<token>/events` | anyone holding a **publication** token (also from `/embed/e`) | body `{ visitor_id, session_id, board_version, idle_threshold_version, source?, utm_source?, campaign?, referrer_host?, embed?, events: [...] }`; ≤ 50 events, ≤ 16 KB; answers 204. 404 for a `/b` token, a dead token or a private canvas. Drops the event when the signed-in viewer owns the canvas. Validates every material, concept and resource id against the published board (`originOf`, `boardSources`). `INSERT OR IGNORE` on `publication_event_ids`, then upserts the session and its items in one `db.batch`. Sent with `navigator.sendBeacon` on `pagehide` and `visibilitychange: hidden`. |
| `startRabbitHole` (existing) | server | on a 201 through a publication token, `holes_started + 1` and a `topic` item with `via = 'rabbit_hole'` in the same batch as the hole rows; 200 `existing`, 401 and failures write nothing |
| `fork()` (existing) | server | on a 201 whose source came through a publication token, `forks + 1` on that session in the same batch as `canvas_forks`; replays write nothing. `FORK_COUNT` is unchanged and stays the canonical total. |
| `GET /api/analytics/creator` (built) | owner | switches each section from `not_collected` to measured once `collected_since` exists; every protected cell through `suppress()` |
| `GET/POST/PATCH /api/analytics/campaigns` | owner | list, create (`kind`, `label`, canvas), rename or archive; returns the tagged canonical link. Never touches `canvas_publications`. |

The session id needs no new browser storage beyond the 10-06 contract (`visitor_id` in localStorage,
`viewer_session_id` in sessionStorage). An embed reuses its partitioned guest session for `visitor_id` when present.

## 4. Read queries (how each metric is computed)

All are bounded by `(org, canvas) IN (the owner's PUBLISHED canvases)` and `day BETWEEN from AND to`; owner sessions
never exist because ingest drops them.

- **Visits:** `count(*)` sessions; cohort `count(DISTINCT learner_key)`.
- **Unique visitors:** `count(DISTINCT learner_key)`.
- **Active learners:** `count(DISTINCT learner_key) WHERE first_learning_at IS NOT NULL`.
- **Visit-to-learning:** `count(*) FILTER first_learning_at IS NOT NULL` ÷ `count(*)`.
- **Average active time:** `sum(active_seconds) WHERE first_learning_at IS NOT NULL` ÷ active learners (one
  `idle_threshold_version` per answer).
- **Returning learners:** active learners with an `EXISTS` on another active session of the same `learner_key` in scope,
  `day < s.day AND day >= date(s.day, '-30 days')`.
- **Rabbit Holes started:** `sum(holes_started)`. **Campaign forks:** `sum(forks) WHERE campaign_id = ?`.
- **Series:** the same, `GROUP BY day`; each day suppressed on its own distinct learners.
- **Traffic:** `GROUP BY source`, denominator all visits; **Campaigns:** `GROUP BY campaign_id`.
- **Topics, cards, resources:** `count(DISTINCT s.learner_key)` from items joined to sessions, `GROUP BY item_id[, via]`.
  A card id no longer on the current board returns `exists: false` (no Locate); its current title otherwise.
- The cohort and the value come from the same query; JavaScript applies `suppress()` before the JSON is built, so a
  suppressed value never leaves the worker.

## 5. Retention

| Data | Kept | Removed by |
|---|---|---|
| `publication_event_ids` | 2 days | bounded delete on ingest (`DELETE ... WHERE rowid IN (SELECT rowid ... LIMIT 500)`) |
| `publication_sessions`, `publication_session_items` | **recommended: 400 days** (covers 30d and a year-on-year look) | the same bounded delete on ingest; "All time" then reads "since <date>" from the oldest kept day. Alternative for the owner: life of the canvas. |
| campaigns, revisions, `collected_since` | life of the canvas | permanent delete of the canvas (when built) deletes every row of that `(org, canvas)` |
| Account deletion (when built) | — | deletes the sessions of that person's learner key, computable from `users.id` |

Unpublish, Archive and Trash keep the rows (no new rows arrive: the token is dead) and hide the canvas from the
dashboard scope, as `PUBLISHED` already does.

## 6. Cost

D1 on Workers Paid (the plan the 10-06 draft assumed; the owner's billing page is the source of truth): 50M rows written
and 25B rows read per month included, then $1.00 per million rows written and $0.001 per million rows read; 5 GB storage
included, then $0.75 per GB-month (Cloudflare D1 pricing page). Index writes count as rows written.

| Item | Per session | At 1k sessions/day | At 10k sessions/day |
|---|---|---|---|
| Ingest requests | ~3 beacons | ~90k Worker requests/month | ~0.9M |
| Rows written (session upserts ×3 + ~10 items + 3 event ids, each with its index writes) | ~40 | ~1.2M/month: inside the included 50M, **$0** | ~12M/month: **$0** |
| Storage at 400 days (~250 B/session row, ~120 B/item row, with indexes) | — | ~0.6 GB: inside 5 GB, **$0** | ~6 GB: about **$0.75/month** |
| Dashboard reads (~12 queries scanning the range via the day index) | — | ~30k rows per open; 1k opens/month = 30M rows read: **$0** | ~300M: **$0** |

Operating cost at today's scale: no marginal spend. Above ~40k sessions/day the included writes run out (~$1 per extra
million rows) and the read should move to daily rollups for counts that sum (visits, holes, forks), keeping distinct
counts on sessions. No new service: Workers Analytics Engine is not used, because it samples at volume and its counts
become estimates. No paid model call anywhere in collection or reading.

## 7. Rollout and rollback

1. **Owner GO on this proposal** (tables, retention, the cohort and the identity hashing).
2. Lane work, local only: migration file + `repository-schema.sql` mirror + `schema-check.test.mjs`; ingest route and
   its unit tests (owner drop, `/b` 404, replay, cap, id validation, embed visibility); `startRabbitHole` and `fork()`
   batch writes; the read queries with suppression tests at 9 / 10 per cell; the client emitter on `/e` and
   `/embed/e`.
3. **learn-dev GO:** announce, then apply 0027 to the shared dev learn D1 (additive; other clones unaffected); the
   flag `ANALYTICS_INGEST` (env var, default off) is turned on for dev clones only; the owner tries it in the browser.
4. **Production GO:** apply 0027 to production learn D1 (owner-run command), deploy with `ANALYTICS_INGEST` off,
   then turn it on. `collected_since` starts that day; nothing before it is shown.
5. **Rollback:** set `ANALYTICS_INGEST` off. Ingest answers 204 and writes nothing; the read keeps showing what was
   collected, or the owner chooses to have it return `not_collected` again. Tables are additive, so the previous
   release runs on the migrated schema unchanged. Dropping tables (section 2) only on the owner's instruction.

## 8. Privacy review

| Risk | Control |
|---|---|
| A creator identifies a learner | aggregate only; cohort ≥ 10 at the exact cell (day, topic, resource, campaign, row); suppressed cells return null and no count; no route returns a learner key, a session or a per-learner row |
| Differencing two ranges or filters narrows one learner | accepted residual in V1 (contract "Limitations"): no identity is attached and every cell meets the cohort; noted for the owner |
| Personal data at rest | none: hashed learner and session keys, no email, users.id, IP, user agent, referrer path, free text, answers, recordings or Tutor content |
| Tracking beyond public publications | the ingest route accepts publication tokens only; `/b`, private canvases and their embeds answer 404 |
| Offscreen embeds inflating learning | an embed session is written only after visibility; active learning needs a learning action |
| Owner and test activity | dropped for a signed-in owner; dev and preview have their own databases; checks run on dev clones. **Limit:** a signed-out owner reads as a visitor. |
| Campaigns weakening sharing | campaigns are labels on the canonical link; no token, permission or allowance changes (unit-tested in the lane) |
| Guessing traffic | Newsletter only from an explicit tag; else Direct/unknown |
| Consent | anonymous, first-party, aggregate measurement with no cross-site identifier. Recommended: one line in the privacy notice ("Creators see aggregate, anonymous statistics about public canvases"). The owner decides whether a notice change is needed before production. |

## 9. Not in this migration

- **Concepts needing support:** needs Learning's publication-safe assessment outcome (correct or incorrect, no answer
  text); then an `outcome` item kind, its own GO.
- **Supported Next Steps on public canvases:** needs Learning's suggestion ids.
- **"What would you like next?":** needs an owner-approved collection contract first: a fixed list of topic choices
  offered on the canvas, no free text, no mining of private answers or Tutor conversations, opt-in per canvas, shown
  separately from Topics explored next.
- **A creator-chosen reporting timezone:** needs hourly buckets.

## 10. Decisions for the owner

A. Approve tables and routes as above (one row per session, no raw event log). **Recommend yes.**
B. Session retention: 400 days, or the life of the canvas. **Recommend 400 days.**
C. Republish (10-06 open question A): analytics accumulate per canvas across publish periods. **Recommend accumulate.**
D. Privacy notice line before production. **Recommend yes.**

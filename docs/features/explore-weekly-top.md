# Explore: Weekly Top 5 Canvases and Weekly Top 5 Creators

Owner brief: `C:/s/spec/weekly-top5/brief.md` (2026-10-23). Tasks: parent 82da56fa-a7a7-4145-8c42-2796e0f3f423; ranking contract and
response shape 6199db1a-7cc2-4acd-b6cd-ab267c3fbf76; deterministic queries, boundaries, privacy, cache, tests
b08ce50b-c3ad-4e98-8a85-c7c672dc680d. Branch `feat/weekly-top5-api`, built on `feat/stars`. This file is the contract the UI lane
codes against; `packages/web/src/home/weekly-top-fixture.js` is its machine-readable example (same shapes; import it in tests).

Status (branch `feat/weekly-top5-r2`): contract, queries (`packages/control-plane/src/weekly-top.js`), route, migration 0029, the Explore toolbar
and the weekly section (`home/WeeklyTop.jsx`, `home/weekly-top.js`) are integrated and read the real route. Nothing here is applied to a database or
deployed. Analytics events still leave through the marked `sendWeeklyEvent` seam (a `weekly-top:event` DOM event) because no telemetry client is on
main; swap that one function when it lands.

## Endpoint

`GET /api/learn/boards/published/weekly-top`, served by `learnBoardsRoute` (beside `published` and `published/find`), so no
dispatcher change. No query parameters: no sort, no week selector, no tab parameter (one answer carries both tabs, so switching
tabs costs no request). `HEAD` is allowed; any other method is `405`.

- **Anonymous behavior.** Public data, identical for everyone, readable signed out. The session, if any, is ignored: the answer
  never carries a viewer field. Every response is `Cache-Control: no-store` (a browser or edge cache could outlive an unpublish,
  brief 8.7); freshness is server-side and explicit (below).
- **No AI, no credits.** Pure SQL over LEARN_DB.

## Ranking definitions (brief section 7)

- **Week.** Monday 00:00 (inclusive) to the next Monday 00:00 (exclusive) in `America/Los_Angeles`, computed in code from that
  zone (Intl), so the UTC instants follow daylight saving: 167 hours in the week that contains the spring change, 169 in the week
  that contains the autumn change. "This week" is the week in progress; early Monday it is legitimately empty (no fallback to last
  week, no invented entries).
- **Qualifying star** (canvas C, actor A): A is not C's owner (`canvas_star_events.owner_star = 0`); A's star on C is still active
  (a `canvas_stars` row exists now); and the **first** `added` event ever recorded for (C, A) falls inside the week. Removing and
  re-adding never creates a new weekly star (the first event stays); a person who starred last week and re-stars this week does
  not count this week; a star removed before the query runs does not count.
- **Qualifying fork** (canvas C, actor A): a *direct* fork of C (`canvas_forks.forked_from_org/forked_from_canvas_id` = C; never
  descendants, never a fork whose source was not a canvas); A (`canvas_forks.owner_email`, the immutable principal) is not C's
  owner; at least one fork of C by A still exists as a canvas (the same live test as lifetime `FORK_COUNT`); and the earliest
  `forked_at` over *all* of A's fork rows of C, including rows whose fork canvas was since deleted (no code deletes a
  `canvas_forks` row), falls inside the week. Repeated forks, retries and delete-then-fork-again by one actor are one fork,
  counted in the week of the first.
- **Canvas order:** qualifying stars desc, qualifying direct forks desc, canonical canvas id `(org, canvas name)` asc. A canvas
  with only forks qualifies (it ranks after every canvas with a star).
- **Creator order:** distinct qualifying star actors across the creator's eligible canvases desc, distinct qualifying fork actors
  across them desc, creator principal (`owner_email`, immutable, never exposed) asc. An actor counts once per metric across all
  of the creator's canvases. Star actors (`users.id`) and fork actors (email) are separate sets, never merged. The creator is the
  canvas owner, not the `@handle` (a handle can change).
- Only entries with at least one qualifying star or fork. Fewer than five show fewer; none returns `entries: []` plus a message.
- Lifetime `star_count` and `fork_count` are not used and not changed.

## Eligibility and privacy (brief 8.2, 8.3, 8.7)

Eligibility is `PUBLISHED` (learn-boards.js) unchanged: a live publication of a not-archived, not-trashed, top-level canvas (not a
Rabbit Hole) whose owner has a handle. It is applied to the activity before anything is aggregated or ranked, so a creator's totals
count only eligible canvases, and it is **re-applied on every response**, including one served from the cache. Private,
unlisted, archived, trashed, deleted and nested canvases, and their titles, links, contributors and totals, are not reachable from
this endpoint. No response carries an email, a user id, a share token other than the public publication token already on Explore
cards, or the identity of any supporter (only counts).

## Response (200)

```json
{
  "ranking_version": "weekly-top-v1",
  "timezone": "America/Los_Angeles",
  "week_start": "2026-10-19T07:00:00.000Z",
  "week_end": "2026-10-26T07:00:00.000Z",
  "week_start_local": "2026-10-19",
  "week_end_local": "2026-10-26",
  "calculated_at": "2026-10-23T18:04:11.532Z",
  "freshness": { "max_age_seconds": 60 },
  "star_history_since": "2026-10-22T19:30:12.004Z",
  "canvases": { "entries": [], "empty_message": null },
  "creators": { "entries": [], "empty_message": null }
}
```

- `week_start` / `week_end`: UTC instants (ISO), `week_end` exclusive. `week_start_local` / `week_end_local`: the Los Angeles dates
  (`week_end_local` exclusive). Label the week from these; do not recompute boundaries in the browser.
- `ranking_version`: bumped on any change to the definitions above; analytics carry it.
- `calculated_at`: when the counts, order and titles were read from the database. `freshness.max_age_seconds`: the server may serve an
  answer up to 60 seconds old, so a new star or a newly public canvas can take that long to appear. **Eligibility is never that old:**
  before every reuse the server re-checks that each canvas behind the answer is still public, and recomputes if any is not, so an
  unpublish, trash, archive or delete disappears at once. The UI may say "updated every minute"; it must not claim a longer
  interval.
- `star_history_since`: the first star transition ever recorded (`min(canvas_star_events.at)`) or `null`. Weekly stars before it
  were never collected (nothing is backfilled or fabricated), so if it falls inside the shown week the star counts cover only the
  days after it. Forks have complete history from the fork feature's own timestamps.
- `empty_message`: `"No canvases have earned stars or forks yet this week."` / `"No creators have earned stars or forks yet this
  week."` when that list is empty, else `null`. The UI shows it in place of rows; it never fabricates rows.

Canvas entry (weekly field names, deliberately not `star_count` / `fork_count`):

```json
{ "rank": 1, "title": "Why ice floats", "url": "/e/TOKEN", "thumbnail_url": "/api/learn/boards/published/TOKEN/thumbnail",
  "creator": { "handle": "ana", "name": "Ana Lee", "url": "/@ana" },
  "weekly_star_count": 7, "weekly_fork_count": 3 }
```

Creator entry:

```json
{ "rank": 1, "handle": "ana", "name": "Ana Lee", "url": "/@ana", "avatar_url": "/api/learn/creators/ana/avatar?v=...",
  "weekly_star_supporter_count": 9, "weekly_fork_supporter_count": 4 }
```

- `rank` is 1 to 5 by position (ties are broken by the rules above, never shared); `entries` is in rank order.
- `url` is the canonical public link (`/e/<publication token>` for a canvas, `/@<handle>` for a profile), the same links Explore
  cards use; render real links. `thumbnail_url` is the existing published-thumbnail route and answers 404 when the owner set no
  custom cover: use the existing card fallback. `avatar_url` is `null` without a picture: use the existing avatar fallback.
  `name` may be `null`: show `@handle` only. React keys: canvas `url`, creator `handle`.
- Bounded: at most five entries per list; a few kilobytes.

### Errors

`{ "error": "<sentence>", "code": "<code>" }`, `no-store`: `503 weekly_top_unavailable` (no Learn database on this worker),
`500 weekly_top_failed` (query failure), `405 method_not_allowed`. On any error the UI hides the section (it must not block
recommendations or regular results) and reports `weekly_top.request_failed`.

## Where history comes from

- **Stars** (`feat/stars`, migration 0028). `canvas_stars` is current state only: the row is deleted on unstar and its `created_at`
  is the *latest* add, so it cannot give the first-star time. `canvas_star_events` is append-only (one `added` or `removed` row per
  real transition, written in the same batch; delivery only sets `delivered_at`; nothing deletes a row), so the first-star time is
  `min(at)` of the `added` events of (org, canvas, user_id). Timestamps are UTC text `YYYY-MM-DD HH:MM:SS.fff`. Stars needs no
  change; the guarantees relied on are in `C:/s/spec/weekly-top5/stars-request.md`.
- **Forks** (`canvas_forks`, migration 0004). One row per fork: `org/canvas` (the fork), `owner_email` (the actor), parent
  `forked_from_org/forked_from_canvas_id`, `forked_at` (written by the fork route as a JavaScript ISO string `...T...Z`; the column
  default is not used). Rows are not deleted when the fork canvas is, which is what makes delete-and-recreate dedup work. The
  boundaries are compared as ISO strings for forks and as `YYYY-MM-DD HH:MM:SS.fff` for stars.
- **Indexes.** Migration 0029 (`learn-migrations/0029-weekly-top.sql`, additive, LEARN_DB only) adds two indexes so a week is a
  range scan: `canvas_star_events (at) WHERE kind = 'added'` and `canvas_forks (forked_at)`.

## Analytics (brief section 9; the telemetry lane owns the envelope and sink)

Definitions owned here. No search text, tokens, handles or personal data in any field (`user_ref` comes from the envelope).

| Event | When | Fields |
|---|---|---|
| `weekly_top.viewed` | The section rendered with a successful answer (entries or the empty message) while its tab is active. Once per tab, per `week_start_local`, per page load; a rerender, a search that hides and restores the section, a Filter/Sort/Size change or a refetch never repeats it. | `tab` (`canvases` or `creators`), `week_start_local`, `ranking_version`, `entry_count` (0 to 5), `duration_ms` (request latency) |
| `weekly_top.opened` | A link in a row was followed. | `tab`, `rank` (1 to 5), `target` (`canvas` or `profile`; a canvas row's @handle link is `profile`), `week_start_local`, `ranking_version` |
| `weekly_top.request_failed` | The request failed or answered non-200. | `status` (HTTP status, `0` for a network failure), `code` (the error `code` or `network`), `duration_ms` |

Latency is `duration_ms` on the two request-bearing events; there is no separate latency event.

## Operations and tests

Migration 0029 only adds two indexes and is safe to apply before or after the code (without it the queries are correct but scan more).
Dev (announce first; the dev LEARN_DB is shared by all clones; 0028 must already be applied):

`cd packages/control-plane && npx wrangler d1 execute rabbit-hole-learn-dev --remote --config wrangler.rabbit-hole-dev.jsonc --file learn-migrations/0029-weekly-top.sql -y`

Production (owner only, after 0028): the same file against `rabbit-hole-learn-prod` with `wrangler.rabbit-hole-prod.jsonc`.

`packages/control-plane/test/weekly-top.test.js` (fixture, node:sqlite from `repository-schema.sql`): week boundaries including both daylight-saving
weeks; migration shape and index use; ordering and the canonical-id tie; fewer than five, none and at most five; self-star, self-fork,
repeated and re-added stars, unstarred stars, repeated forks, deleted and re-created forks, descendant forks, several canvases per
creator; unpublish, Trash, archive, delete and a lost handle against a cached answer; the staleness window; no private data in any
answer; the route's status codes and its key-for-key match with the committed UI fixture. Fixture limits: no deployed D1, no real
query timing (the indexes are checked by query plan only), no browser.

## Browser checks

All run in the `fork` tier of fast-e2e (check-map). The fixture-driven ones answer the route from `weekly-top-fixture.js` so rows and states are exact;
the real-endpoint ones seed through the star, fork, publish and archive routes and read the server's own answer.

- `explore-creators-check.mjs`: fixture: heading, five ranked rows, order on the page, spacing, no collapse, visual spec, link targets, hover with no
  layout shift, keyboard, analytics events, search hides and restores, Filters/Sort/Size leave the ranking alone, Creators rows, empty week, failed
  request, 390px touch, dark theme. Real endpoint: six fans' stars and forks, owner star not counted, repeated forks counted once, creators' distinct
  supporters, an archived canvas and its creator absent, no private data, then the same rows in the page (links, counts, viewed once, opened rank).
- `card-size-check.mjs`: Search, Filters, Sort, Size adjacent on one row; Size does not reorder the weekly list and survives a reload.

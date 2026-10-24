# Stars

Owner brief: `C:/s/spec/stars/brief.md` (Tasks 1-10, 2026-10-23). Branch `feat/stars`, base `rabbit-hole/main` 73d184a8.

Status by increment (delivery order, brief Task 10):

1. **Done:** this contract, migration 0028, idempotent mutations, authorization and visibility, integration-point discovery, and
   one end-to-end surface: the shared canvas viewing page (`SharedBoardPage.jsx`) with the shared Star control.
2. **Done (branch feat/stars-ui-r2):** the Star control on cards: the owner's Library and Home cards (by canvas name), Explore, Recommended and
   profile cards (by publication token, with the viewer's starred state from one batched `POST /api/learn/stars/state`). `CardStar.jsx`,
   `canvas-star.js`; `LearningCard` takes a `star` slot, first in the card's actions row. Both fix/card-size-description and fix/creators-ui are
   already in main (dfab2e55), so nothing waits on them.
3. **Done (branch feat/stars-ui-r2):** my personal Stars (`StarsPage.jsx`, a Library view at `/library?view=stars`, reached by the Stars button on Home
   and on the Library header) and the public profile Stars tab (`CreatorProfile.jsx`, `?tab=stars`).
4. **Server side done, wiring pending:** creator star analytics and the event delivery adapter. Folding the analytics fields into
   the analytics lane's endpoint, the owner dashboard and the telemetry sink wait for those lanes.

Browser checks: `packages/web/e2e/stars-check.mjs` (the shared page) and `packages/web/e2e/stars-surfaces-check.mjs` (cards, profile tab, personal
Stars; both tier `fork`, executed by fast-e2e), written and registered; not run by the lane that wrote them (CI reads them). Nothing here is applied to any database or deployed. Other evidence is unit/fixture only.

## Product contract (Task 1)

1. A signed-in user can star or unstar a canvas they can currently open, their own included. At most one active star per
   account per canvas.
2. A star is a reference to the original canvas. It copies no content, is not a fork, grants no access and freezes no version.
   Opening a star shows the latest content the viewer is authorized to see, through a route that authorizes at that moment.
3. Each fork is its own canvas with its own stars. Starring the original does not star its forks, and forking stars nothing.
   `FORK_COUNT` (direct forks) is unchanged.
4. Surfaces (all increments): a Star/Starred control and count on canvas cards and the sharing/viewing surfaces; one personal
   Stars destination reachable from Home and Library; a public Stars tab on each profile; Stars in creator analytics and the
   owner telemetry dashboard.
5. A public profile's Stars collection holds only canvases that are public right now. Starring a private or unlisted canvas
   never publishes it or shows it on a profile.
6. Canvas-level only. A block inside a canvas has no star.
7. Stars call no AI and spend no credits. Collections, folders, notifications and a public list of who starred a canvas are out
   of scope for the first release.

Three counts with three names (brief 8.4):

| Name | Meaning |
|---|---|
| `star_count` | Accounts that currently hold a star on that canvas. |
| profile Stars tab count (increment 3) | Public canvases this person has starred. |
| creator analytics "Stars received" (increment 4) | Stars currently on the creator's canvases. |

## Integration points found on the base (Task 2)

- **Route registration.** `packages/web/dev-worker.js` is the one dispatcher; production `app-worker.js` re-exports it.
  `canvasRoute(url)` sends `/api/canvases*` and `/api/apps/canvas-*` to `canvasesFetch` (owner-only canvas routes);
  `/api/learn/boards/*` goes to `learnBoardsRoute` (own boards, shared links, Explore); `/api/learn/creators*` to
  `creatorsRoute`. New: `/api/learn/stars/*` to `starsRoute` (`canvas-stars.js`). Starring itself rides the existing
  shared-link route family.
- **Authentication.** `repositoryIdentity(req, env)` (repositories.js) calls `devIdentity` (dev-forwarding.js), which asks the
  control plane's `GET /api/me` and returns `{ email, org, orgName, userId }`. `userId` is `users.id` (the session's `uid`); it
  is `null` for a CLI token and for the pre-`/api/me` fallback. A shared link is authorized by `sharedAccess` (learn-boards.js):
  anyone for a public-view link or a publication, otherwise any signed-in account; `viewerOf` ignores the session on an embed.
- **Stable account identifier.** `users.id` (migrations/0026-users.sql), the same key journeys, Tutor state, comments permissions
  and usage already use ("never an email"). `users.email` is the principal rows key on (`owner_email`, `user_handles.email`) and
  is immutable: no email-change flow exists, and a provider-reported email never becomes a principal. Handle and display name
  are never used. A star is keyed `(org, canvas, user_id)`. `user_email` is stored beside it for exactly one join: a public
  profile reaches a person through `user_handles.email`. It never leaves the server (the fixture asserts no response contains a
  user id). If account email change or account merge is ever built, it must rewrite `canvas_stars.user_email` in the same change.
  A session without `userId` (a CLI token) cannot star (403 `no_account`).
- **Migrations.** LEARN_DB migrations are `packages/control-plane/learn-migrations/NNNN-name.sql`, additive and re-runnable
  (`IF NOT EXISTS`), mirrored verbatim into `repository-schema.sql` (the fixture and the dev/prod schema checks build from it),
  and applied by hand with `wrangler d1 execute <db> --remote --config <cfg> --file ...` (no migrations table). Taken numbers:
  0020 is held; 0027 is Credits (usage grants, `feat/credits-2500`). Stars is **0028**. Recheck at rebase.
- **Canonical canvas identity.** `(org, name)` of the `canvases` row (`name` is `canvas-xxxxxxxx`), as `canvas_publications
  (org, canvas)`, `canvas_forks` and `canvas_metadata` use. A share token (`learn_boards.view_token`), a publication token
  (`canvas_publications.token`) and the owner's name are aliases: each resolves to a `learn_boards` row (`org`, `app`, `board`),
  and only a canvas's `main` board whose `app` is a `canvases` row owned by the board's owner is a canvas. A project's board
  (`repo-*`) has no canonical canvas, so it has no stars (`star_count: null`, never 0). Tokens are never stored.
- **Publication eligibility.** `PUBLISHED` in learn-boards.js, reused unchanged by increment 3: `canvas_publications` joined to a
  not-archived `canvases` row whose owner has a handle, not a Rabbit Hole (`canvas_dives.child`) and not in Trash
  (`NOT_TRASHED`). Trash and Archive already delete the publication; Restore never republishes. A public canvas that turns
  private therefore leaves every public Stars list and count by itself; the relationship is kept.
- **Deletion paths.** Permanent: `DELETE /api/apps/<canvas>` (an untouched canvas only) and a Rabbit Hole delete
  (`DELETE /api/canvases/dives/<hole>`, dives.js). Both now call `purgeStars`. Reversible, stars kept: Trash, Archive,
  Remove from Explore, link off. **There is no account-deletion path in this codebase today**; when one is added it must delete
  `canvas_stars` and `canvas_star_events` rows by `user_id` (and is a privacy decision for the owner).
- **Cache headers.** Every JSON route here (`json()` helpers in canvases.js, learn-boards.js, creators.js) sends `no-store`;
  there is no edge cache (`caches.default` is unused). Only the avatar and thumbnails are cacheable. The new answers and the
  extended shared-page answer are `no-store`, and the test asserts it. Any future cacheable public list must not carry
  `starred_by_me`.

## Data (Task 3, migration `learn-migrations/0028-canvas-stars.sql`)

- `canvas_stars (org, canvas, user_id, user_email, created_at, id, via_token)`, PRIMARY KEY `(org, canvas, user_id)`: uniqueness, and the
  canvas-count index (the key prefix). `id` is the star's own random opaque handle (unique): the only thing a list sends the client
  to remove a star, so no list names a workspace. `via_token` is the share link the person starred through, kept only as proof they
  held it: the personal list reopens the star at `/b/<via_token>` while that exact link is live, and never looks up another link;
  it is null for a star made through Explore or the owner's own canvas. `canvas_stars_mine (user_id, created_at DESC, id DESC)`
  serves "recently starred" with `id` as the tie-breaker; `canvas_stars_person (user_email, created_at DESC, id DESC)` serves a profile.
- **No counter.** Counts are indexed `count(*)`. If measurement later justifies a counter it needs a transactional update and a
  reconciliation job (brief 3.5); not built.
- `canvas_star_events (event_id, kind added|removed, reason voluntary|lifecycle, org, canvas, user_id, owner_star, surface, at,
  delivered_at)`: one row per real transition, inserted in the same D1 batch as the change, and only when the change will
  happen, so a retry or a concurrent duplicate writes none. This is the durable outbox for telemetry and creator analytics
  (`deliverStarEvents` reads `delivered_at IS NULL` rows oldest first and marks each only after the sink stored it); a telemetry
  outage loses nothing and delivery cannot duplicate a transition (the sink inserts by `event_id`). `surface` comes from a fixed
  list (`SURFACES` in `canvas-star-events.js`); anything else is dropped. No title, token, URL or content is stored.
- **Append-only events (Weekly Top 5 depends on it).** No code path deletes or rewrites a `canvas_star_events` row except delivery setting `delivered_at` (asserted by a source scan in `canvas-stars-lists.test.js`); a retention job must not prune `added` rows. Each real add writes exactly one `added` event in the same batch as the `canvas_stars` insert, so the first-star time of a (canvas, account) is `min(at)` over its `added` events - `canvas_stars.created_at` is only the latest add. `purgeStars` only appends lifecycle `removed` rows and keeps earlier `added` ones. A future account-deletion path may delete by `user_id`. `at` is `YYYY-MM-DD HH:MM:SS.fff` UTC. Weekly Top 5 adds its own migration 0029 (an index on `added` events); Stars does not take 0029.
- Creation time has millisecond precision. Existing data: no backfill.

## API (Tasks 3-4)

All responses are `Cache-Control: no-store`. The actor and the count come from the session and the database; a body, query
or header cannot supply either.

| Request | Answer |
|---|---|
| `GET /api/learn/boards/shared/<token>/star` | `{ starred_by_me, star_count }` (signed out: `starred_by_me: false`). `<token>` is a share or publication token. |
| `PUT .../star` | Star. `200 { starred_by_me: true, star_count }`. Idempotent. Optional body `{ surface }`. A share token is kept as `via_token`. |
| `DELETE .../star` | Unstar. `200 { starred_by_me: false, star_count }`. Idempotent. |
| `PUT` / `DELETE /api/apps/<canvas-name>/star` | The owner's star on their own canvas (owner only; another workspace is 404). Same answers. `PUT` on a canvas in Trash is 409. |
| `GET /api/learn/boards/shared/<token>` (existing) | Adds `star_count` (`null` when the page is not a canvas) and `starred_by_me`. |
| `GET /api/canvases`, `GET /api/apps/<name>` (existing, owner) | Each canvas adds `star_count` and `starred_by_me`. |
| `GET /api/learn/boards/published`, `GET /api/learn/creators/<handle>` (existing, public) | Each card adds `star_count`. Never `starred_by_me`: a public list is the same for everyone. |
| `POST /api/learn/stars/state { tokens }` | Which of these publication tokens I have starred: `{ starred: [token] }`. Signed out: `{ starred: [] }`. For the cards of public lists. |
| `GET /api/learn/stars?q=&limit=&cursor=` | My personal list (below). |
| `DELETE /api/learn/stars/<id>` | Remove my star by its own opaque id, with no access check: the way out of a star whose canvas stopped being reachable. Only my own row; `200 { starred_by_me: false }` for any id, so it probes nothing. |
| `GET /api/learn/creators/<handle>` (existing) | Adds `starred_count`: public canvases this person has starred. |
| `GET /api/learn/creators/<handle>/stars?q=&limit=&cursor=` | The profile Stars collection (below). Public, signed out too. |
| `GET /api/learn/stars/analytics?range=7d, 30d or all` | Creator star analytics (below). |

Errors: `401 { signIn: true }` signed out on PUT/DELETE (and on GET for a link that is not public); `403 no_account` for a
session without `users.id`; `404` for a link that is not live now (unknown, revoked, link off, unpublished, canvas in Trash, or
a deleted canvas), before anything is written; `404 not_starrable` for a project board. There is no toggle endpoint and no
star-by-id or by-name for others: access is decided by a live route, never by a stored reference.

### My personal Stars list

Every star I hold, `starred_at` newest first with the star's `id` as the tie-breaker, in pages of 24 (`limit` 1 to 50) by a keyset
`next_cursor` (`<time>|<id>`), so a star added or removed meanwhile never shifts or repeats a page. `total` counts every star I
hold, unavailable ones included, and `unavailable` how many cannot be opened; neither depends on `q`, and neither is the public
profile's count. Each star opens only through a route that authorizes now (`access`):
`owner` (my own canvas in this workspace, not in Trash: `/apps/<name>`), `public` (in Explore now, the `PUBLISHED` predicate as it
stands: `/e/<token>`), or `link` (the share link I starred through is still the live link of its canvas: `/b/<via_token>`). Anything
else - revoked, unpublished, in Trash, deleted, someone's private canvas - is `unavailable`: the entry carries only `id`, `access`,
`unavailable: true` and `starred_at` (no title, creator, thumbnail, counts or link), and Remove still works. Search (`q`: title,
description, creator handle or name) runs in SQL over accessible rows before the limit, so it covers the whole collection and can
never match a hidden title. An accessible entry has Explore's card fields plus `starred_by_me: true`, `access`, `url`, `starred_at`.
A star made through Explore never reveals a private share link the person did not hold: if the canvas is later unpublished, the entry
is unavailable even though the owner shares a link with others.

### Public profile Stars

`creators.js` `profileStars`: the stars of the person behind the handle (`user_handles.email`) on canvases in the `PUBLISHED` set -
so private, unlisted, archived, nested and trashed canvases are filtered out before the count and the page, and a canvas that
turns private leaves both at once (the star is kept; publishing again brings it back). Their own public canvases are included, each
card with its actual creator. A profile with no publication still has its Stars. Pages, cursor and search work as above (the cursor
holds only the star's time and opaque id). The answer is identical for every viewer and contains no viewer state; a person with only
private stars looks exactly like one with none. `starred_count` is "public canvases this person has starred".

### Star analytics (creators)

`canvas-star-analytics.js`, aggregate only, scope: the creator's own canvases in Explore now. `current` = relationships that exist now
(authoritative; not a sum of history). `period` (7d, 30d or all): `additions` (gross, `unique_users`, `by_owner`, `by_others`),
`voluntary_removals` (gross, `unique_users`), `net_change` = additions minus voluntary removals (gross actions, not the change in
current stars); lifecycle removals are not voluntary removals. History starts at `collection_started_at` (the first recorded event):
before it nothing was collected - `period` is `{ value: null, reason: 'not_collected' }`, not zero - and a range that begins earlier
is `partial`. `opens_from_stars` is not collected yet. The definitions are returned with the numbers. Fold into the analytics lane's
endpoint by calling `starAnalytics`; do not add a second dashboard.

## Authorization and visibility (Task 4)

- Naming an org and a canvas proves nothing: the only way to star is a link `sharedAccess` admits right now. A private share
  link admits any signed-in account, exactly as it admits reading, so it admits starring.
- Revoked link, link switched off, canvas in Trash or unpublished: PUT, DELETE and GET on that token are 404 and write nothing.
  The relationship is kept (Restore brings the same row back). Stars never preserve access: a personal Stars page opens a star
  through a currently authorized route and shows "Canvas unavailable" otherwise (increment 3), with Remove served by the
  DELETE-by-id above.
- A star's count includes every active relationship, including accounts that have since lost access. That reveals a number to
  someone who can already open the canvas, never who.
- Public profile queries filter by `PUBLISHED` before totals and pagination.
- Explore and creator cards carry `star_count` only; the viewer's own state comes from the separate state route.

## Control (Task 5, increment 1 scope)

`StarButton.jsx` over `canvas-star.js`. Outlined "Star" or filled "Starred" with the count (zero shown, `1.2k` compact, exact
in the accessible name), `aria-pressed`, `aria-busy`, a spinner while saving, visible at rest, `stopPropagation` on click and
pointer-down, 44px touch target below the `@5xl` breakpoint (as Fork). Mutations for one canvas run one at a time; presses
during a request collapse to the last wish; an older answer cannot overwrite a newer one; a failure restores the confirmed
state and toasts the error; it re-reads on focus and visibility. Signed out, a press goes to `/login?next=<page>?star=1`, and
the page, reading `?star=1` once and removing it, stars once on return; the server re-checks access. In the shared header it sits
left of the creator @handle, so the handle stays immediately left of Fork (owner decision 2026-10-23); keyboard order is logo,
menus, Star, Fork, panel toggle (`e2e/shared-header-check.mjs` updated to assert it; written, not run by this lane). In the shared header, below the
`@6xl` container width (1152px) the label is screen-reader-only and the icon, state and count remain: at a 1024px header the label left the @handle about 48px, a cut "@hdr_..." that overlapped Fork (fast-e2e run 40135548596, shared-header 36/39). The shared-header and stars checks assert it. Unverified in a browser until CI reads it. The embed header does not show it (an embed is a public guest, with no account).

## Surfaces: cards, profile tab, personal Stars (Tasks 6-8, UI)

- **Card control.** The one `StarButton` in the card's actions row, visible at rest, outlined "Star" or filled "Starred" with the count (0 shown,
  `1.2k`, exact in the accessible name), `aria-pressed`, a title that says what it does, a visible focus ring, 44px minimum on touch (`pointer-coarse`).
  A press stops at the button: it never opens, selects, forks or drags the card. The card keeps its Fork button (others' canvases) or Owned-by-you
  badge; the Fork count still sits inside Fork alone.
- **Which route.** Own canvas (Library, Home Recent and Continue): `PUT`/`DELETE /api/apps/<name>/star`, initial state from the canvas row's
  `star_count` and `starred_by_me`. Published canvas (Explore, Recommended, profile): the publication token on the shared route. Pending state:
  until the batched state answer arrives the button is disabled and keeps its name.
- **Surface** sent with each mutation (analytics only): `card_library`, `card_home`, `card_explore`, `card_profile`, `profile_stars`, `personal_stars`.
- **Signed out.** A press goes to `/login?next=<page>?star=<publication token>`; back on the list, that card (and only it) stars once, the address loses
  `star`, and a refusal does not loop back to sign-in.
- **Profile.** Tabs Canvases (default, unchanged address) and Stars (`?tab=stars`, count = public canvases this person starred). The tab lists
  `GET /api/learn/creators/<handle>/stars` in pages of 24 with Show more. Empty wording does not say whether private stars exist. Search on the
  Stars tab is not built (the route supports `q`).
- **Personal Stars.** `/library?view=stars` (the sidebar keeps Library lit; no new route or navigation row). Search over the whole collection, the
  total "N stars, M unavailable", cards with Star and (others' canvases) Fork but no card options, an unavailable star as one generic row
  "Canvas unavailable" with Remove, Show more by the server's cursor, loading, empty and retry states.
- **Not built.** `star.opened` (a canvas opened from personal Stars or a profile Stars list) is defined but nothing emits it yet; the Stars analytics
  fields are not folded into the creator dashboard; the Home Continue card has no Star when its canvas row is not in the catalog.
- **Unverified in a browser** until `stars-surfaces-check.mjs` has been read from CI on the candidate SHA: layout at small card sizes and widths,
  light and dark appearance (the control is the shared `Button` with theme tokens; no dark-specific assertion), and the touch target on a real device.

## Telemetry events (Task 9; the telemetry lane owns the envelope)

Stars' own definitions are in `canvas-star-events.js` (`STAR_EVENTS`), delivered by `deliverStarEvents(db, emit)`; `emit` is the
telemetry sink's insert, which must throw when the event was not stored. The durable source is `canvas_star_events`; `event_id` is
the dedup key; `user_ref` is `users.id`; `canvas_ref` is a one-way hash of the canonical canvas (never the workspace, name or a
token); `occurred_at` is the transition's time.

- `star.added`: `canvas_ref` (hex), `owner_star` (boolean), `surface` (optional token).
- `star.removed`: the same plus `reason` `voluntary` | `lifecycle`.
- `star.opened`: `canvas_ref`, `owner_star`, `surface` (`personal_stars` | `profile_stars`). Defined, not produced yet: the opening
  surface emits it (increment 3 UI).
- `surface` values: `shared_page`, `card_home`, `card_library`, `card_explore`, `card_profile`, `canvas_header`, `personal_stars`,
  `profile_stars`.
- Not defined by Stars: mutation latency and failure events - measured at the route by the telemetry lane's request instrumentation.
  There is no counter, so there is no reconciliation event.

Nothing runs the delivery yet (there is no cron on any Rabbit Hole worker): call `deliverStarEvents` from the owner dashboard's
bounded catch-up, as the telemetry lane does for its accounting projection, once its sink lands.

## Material conflicts and decisions

- Brief 3.1 prefers a stable account id: used `users.id`, with `user_email` stored for the profile join (documented above).
- No account-deletion path exists to add cleanup to; documented as a requirement on whoever adds one.
- Brief 9.3 asks for an outbox "if available": the telemetry lane's outbox lives in Durable Object storage and does not fit a
  D1 request path, so the star outbox is `canvas_star_events` in LEARN_DB, written transactionally with the change.
- A nested Rabbit Hole reached by its own link can be starred (it is a canvas the viewer can open); it never appears in a
  public Stars list because `PUBLISHED` excludes Rabbit Holes.

## Rollback and operations

Dropping the feature is a code revert: the tables are additive and nothing else reads them. The migration is not applied
anywhere. Dev (announce first; the dev LEARN_DB is shared by all clones):

`cd packages/control-plane && npx wrangler d1 execute rabbit-hole-learn-dev --remote --config wrangler.rabbit-hole-dev.jsonc --file learn-migrations/0028-canvas-stars.sql -y`

Production (owner only; same file against `rabbit-hole-learn-prod` with `wrangler.rabbit-hole-prod.jsonc`, before the server
release that reads the tables):

`cd packages/control-plane && npx wrangler d1 execute rabbit-hole-learn-prod --remote --config wrangler.rabbit-hole-prod.jsonc --file learn-migrations/0028-canvas-stars.sql -y`

## Tests

`packages/control-plane/test/canvas-stars.test.js` (shared link and publication surface), `canvas-stars-lists.test.js` (owner route,
personal list, profile Stars, state route, `starsFor`, analytics, event delivery), helpers in `stars-helpers.js`; fixture: node:sqlite
built from `repository-schema.sql`. They cover migration shape; idempotent star/unstar and one event per real change; concurrent
identical requests; owner star; no client-supplied actor, count or surface; signed out; guessed tokens and ids; revoked link,
unpublish, Trash and Restore; project board; session without `users.id`; deletion cleanup with lifecycle reasons; the mixed
collection, unavailable entries without leaks, no private link for a star not made through it, stable pages with ties, search over
the whole collection; the public profile filtered before count and page and identical for every viewer; analytics gross against
unique and not-collected against zero; delivery order, outage and replay. Existing tests updated for the new card fields:
`canvas-publications.test.js`, `creator-profile.test.js`.
`packages/web/src/canvas-star.test.mjs`: the client action's ordering, collapse, failure and refresh rules.
`packages/web/e2e/stars-check.mjs` (fork tier) and the updated `shared-header-check.mjs`: browser coverage, written but not run by the
lane. Fixture limits: the fixture serializes batches on one connection as D1 does but cannot show real D1 contention.

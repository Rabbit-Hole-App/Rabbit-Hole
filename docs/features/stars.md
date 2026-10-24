# Stars

Owner brief: `C:/s/spec/stars/brief.md` (Tasks 1-10, 2026-10-23). Branch `feat/stars`, base `rabbit-hole/main` 73d184a8.

Status by increment (delivery order, brief Task 10):

1. **Done on this branch:** this contract, migration 0028, idempotent mutations, authorization and visibility, integration-point
   discovery, and one end-to-end surface: the shared canvas viewing page (`SharedBoardPage.jsx`) with the shared Star control.
2. Cards and the remaining sharing surfaces (Home, Library, Explore, profile cards, canvas header). Not started.
3. Personal Stars page and the public profile Stars tab. Not started.
4. Creator analytics, owner telemetry, remaining regression coverage. Not started.

Nothing here is applied to any database or deployed. Evidence is unit/fixture only; there is no browser check yet.

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

- `canvas_stars (org, canvas, user_id, user_email, created_at)`, PRIMARY KEY `(org, canvas, user_id)`: uniqueness, and the
  canvas-count index (the key prefix). `canvas_stars_mine (user_id, created_at DESC, org, canvas)` serves "recently starred"
  with `(org, canvas)` as the tie-breaker; `canvas_stars_person (user_email, created_at DESC, org, canvas)` serves a profile.
- **No counter.** Counts are indexed `count(*)`. If measurement later justifies a counter it needs a transactional update and a
  reconciliation job (brief 3.5); not built.
- `canvas_star_events (event_id, kind added|removed, reason voluntary|lifecycle, org, canvas, user_id, owner_star, at,
  delivered_at)`: one row per real transition, inserted in the same D1 batch as the change, and only when the change will
  happen, so a retry or a concurrent duplicate writes none. This is the durable outbox for telemetry and creator analytics
  (increment 4 reads `delivered_at IS NULL` rows and marks them); a telemetry outage loses nothing and delivery cannot
  duplicate a transition. No title, token, URL or content is stored. Increment 1 emits nothing.
- Creation time has millisecond precision. Existing data: no backfill.

## API (Tasks 3-4)

All responses are `Cache-Control: no-store`. The actor and the count come from the session and the database; a body, query
or header cannot supply either.

| Request | Answer |
|---|---|
| `GET /api/learn/boards/shared/<token>/star` | `{ starred_by_me, star_count }` (signed out: `starred_by_me: false`). `<token>` is a share or publication token. |
| `PUT .../star` | Star. `200 { starred_by_me: true, star_count }`. Idempotent. |
| `DELETE .../star` | Unstar. `200 { starred_by_me: false, star_count }`. Idempotent. |
| `DELETE /api/learn/stars/canvas/<org>/<canvas>` | Remove my own star by canonical reference, with no access check, for a canvas I can no longer open. Touches only my row. `200 { starred_by_me: false }` whether or not a star existed; no count. |
| `GET /api/learn/boards/shared/<token>` (existing) | Adds `star_count` (`null` when the page is not a canvas) and `starred_by_me`. |

Errors: `401 { signIn: true }` signed out on PUT/DELETE (and on GET for a link that is not public); `403 no_account` for a
session without `users.id`; `404` for a link that is not live now (unknown, revoked, link off, unpublished, canvas in Trash, or
a deleted canvas), before anything is written; `404 not_starrable` for a project board. There is no toggle endpoint and no
star-by-reference: access is decided by a live route, never by a stored reference.

## Authorization and visibility (Task 4)

- Naming an org and a canvas proves nothing: the only way to star is a link `sharedAccess` admits right now. A private share
  link admits any signed-in account, exactly as it admits reading, so it admits starring.
- Revoked link, link switched off, canvas in Trash or unpublished: PUT, DELETE and GET on that token are 404 and write nothing.
  The relationship is kept (Restore brings the same row back). Stars never preserve access: a personal Stars page opens a star
  through a currently authorized route and shows "Canvas unavailable" otherwise (increment 3), with Remove served by the
  by-reference DELETE above.
- A star's count includes every active relationship, including accounts that have since lost access. That reveals a number to
  someone who can already open the canvas, never who.
- Public profile queries (increment 3) filter by `PUBLISHED` before totals and pagination.
- Explore and creator payloads carry no star field in this increment.

## Control (Task 5, increment 1 scope)

`StarButton.jsx` over `canvas-star.js`. Outlined "Star" or filled "Starred" with the count (zero shown, `1.2k` compact, exact
in the accessible name), `aria-pressed`, `aria-busy`, a spinner while saving, visible at rest, `stopPropagation` on click and
pointer-down, 44px touch target below the `@5xl` breakpoint (as Fork). Mutations for one canvas run one at a time; presses
during a request collapse to the last wish; an older answer cannot overwrite a newer one; a failure restores the confirmed
state and toasts the error; it re-reads on focus and visibility. Signed out, a press goes to `/login?next=<page>?star=1`, and
the page, reading `?star=1` once and removing it, stars once on return; the server re-checks access. In the shared header it sits
left of the creator @handle, so the handle stays immediately left of Fork (owner decision 2026-10-23); keyboard order is logo,
menus, Star, Fork, panel toggle (`e2e/shared-header-check.mjs` updated to assert it; written, not run by this lane). Below the
`sm` width the label is screen-reader-only and the icon, state and count remain, to protect the header's phone layout. This is
unverified in a browser. The embed header does not show it (an embed is a public guest, with no account).

## Telemetry request (Task 9; the telemetry lane owns the contract)

Needed events and fields, for the integrator to request. Common envelope fields per the telemetry contract (`user_ref` =
`users.id`, never an email). The durable source is `canvas_star_events` (its `event_id` is the dedup key).

- `star.added`: `canvas_ref` (`org/canvas`), `owner_star` (bool), `surface`, `outcome`.
- `star.removed`: the same plus `reason` `voluntary` | `lifecycle`.
- `star.opened`: `canvas_ref`, `surface` (`personal_stars` | `profile_stars`), `owner_star`.
- Failure and latency: `star.mutation` with `outcome`, `error_code`, duration, so failures and mutation latency show on the owner
  dashboard. Count-reconciliation: n/a (no counter).
- `surface` values: `shared_page`, `card_home`, `card_library`, `card_explore`, `card_profile`, `canvas_header`.
No raw token, URL or content in any field.

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

## Tests (increment 1)

`packages/control-plane/test/canvas-stars.test.js` (fixture, node:sqlite from `repository-schema.sql`): migration shape;
idempotent star/unstar and one event per real change; concurrent identical requests; owner star; no client-supplied actor or
count; shared-page fields and `no-store`; signed out; guessed tokens and references; revoked link, unpublish, Trash and Restore;
project board; session without `users.id`; deletion cleanup with lifecycle reasons (canvas and Rabbit Hole).
`packages/web/src/canvas-star.test.mjs`: the client action's ordering, collapse, failure and refresh rules.
Fixture limits: the fixture serializes batches on one connection as D1 does but cannot show real D1 contention; no browser
check is registered yet (increment 2 adds it for the CI tiers).

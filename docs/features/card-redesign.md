# Card redesign: one canonical learning card

Owner rules, 2026-10-06 (card decisions §11-20). Library, Home and Explore render one card, `packages/web/src/home/LearningCard.jsx`. The surfaces differ by props only, so the creator profile can reuse the same card.

## Anatomy

```
[type]  Clickable Title                         Private  ⋮
        @handle [Owned by you]
        Forked from "Title" ↗ · @alice
github.com/owner/repository ↗        (a repository project only)
Optional description, at most three lines
Content in this browser               (only when its content is not on the server; canvas-persistence.md step 8)
[Start Rabbit Hole] [Fork | 14]       (actions: others' cards only)
[fork] 14 forks · Updated 2h ago                    Open →
```

Owner changes, 2026-10-08:
- **The footer is the card's last line** ("why is the updated... in the middle of the cards??"): the read-only fork count
  and Updated sit side by side at the bottom, GitHub-style, with any actions above them (`data-card-footer`).
- **A click selects, never opens** ("when clicking on a card should not open it", "also clicking on a card selects it"):
  the card takes focus, so one card is selected at a time (an accent edge, `.select-card` in index.css), and a click
  elsewhere clears it. The title link, the **Open →** button and Enter on the selected card open it. Open shows on hover
  and on the selected card, and always on touch screens (`pointer-coarse`, phones). Home's Continue card keeps its
  Continue → instead.
- **No Fork on your own cards** ("i cannot fork my own cards", "there is duplication of 'fork' on the cards"): your own
  card carries at most one read-only "N forks", only once someone forked it. Others' cards carry one `[Fork | N]` with
  the count inside, 0 included, in the soft accent fill ("make the fork button more visible on the cards"), and no
  second count (canvas-forking.md).
- **The Library title row** ("put sort and filter next to each other", "put a search near filter and sort"): Search by
  name, Filters, Sort, then Start a rabbit hole, in one row (`App.jsx`). Search narrows the cards by title (a project's
  repository too), case-insensitive; Sort keeps its per-viewer memory.
- **⋮ on Home's Recent cards** (owner, 2026-10-08): the Library's own card menu (`home/CardMenu.jsx`), with Copy link
  (visibility-menu.md). It shows only where the Library shows one: your own canvases and projects.
- **Start Rabbit Hole on others' cards asks From this canvas or Blank** (shared-canvas-rabbit-hole.md).
- **A canvas is `Shapes`, not a pen** ("choose another symbol for Canvas instead of that pen"), on the card tile, the
  kind icon (Search, sidebar rows) and the Library's Filters.

- **Size:** at 1440×900 a card is about 471 × 220-255 px, two columns (`CARD_GRID`: `minmax(min(100%, 380px), 1fr)`, 16px gap). The 1150px pages leave room for two. A phone gets one column. Three would need a page genuinely wider than today's.
- **Type icons:** a project is `FolderGit2` on a purple tile and a canvas is `Shapes` on a green tile (2026-10-08; it was `PenLine`). Jobs and servers keep `KindIcon` on a neutral tile. There is no textual Canvas, Project or Standalone pill. A screen reader hears the type from the tile's label.
- **Colour:** blue is navigation and the primary action: the title, the GitHub link, the owner badge, Start Rabbit Hole and Home's Continue →. Everything else is neutral: the @handle, description, times, forks, visibility and ⋮. Fork on others' cards is the soft accent fill (2026-10-08), below the primary.
- **Owner badge:** the existing `OwnerCheck` drawing, with `owned`. It sits beside the @handle on the viewer's own cards, with the tooltip "Owned by you · This is yours. It does not verify identity." (`data-owned-badge`). The source-owner check is unchanged.
- **Attribution:** `@handle` through `creatorLabel` (user-handles.md), with the display name first when set. Never an email.
- **Description:** the owner's own words (canvas-metadata.md), clamped to three lines. A project's server `description` ("Learn from owner/repo") is a placeholder and is not shown.
- **Forks:** the canonical direct-fork count, read-only on your own card and only above 0 (2026-10-08; §12 showed "0 forks"); inside the Fork button on others' cards, 0 included. A project row carries no fork count, so a project shows none.
- **Updated:** `updated_at`, else `created_at` (0009). A project row has no `updated_at`, so it shows `created_at` under the same rule.
- **Visibility:** a neutral pill on canvases, Private, Unlisted or Public (visibility-menu.md). Explore cards read Public. Projects show none, because their rows carry no access state.

## Surfaces

| Surface | The title and Open open | ⋮ | Actions | Note |
|---|---|---|---|---|
| Library | `/apps/<name>` | The owned-card menu, exactly as built (visibility-menu.md). It opens upward when the window has no room below. | None (no Fork on your own canvas; Duplicate is in the ⋮) | This browser's content state |
| Home, Continue | Where it left off (`openHref`) | None | Continue →, a small text link at the footer's end | Last explored, Next, Content in this browser |
| Home, Recent | The recent action | None | A job or server keeps its own link | This browser's content state |
| Explore | `/e/<token>`, as a full page load | Copy link | Others' cards: Start Rabbit Hole (blue) and `[Fork | N]` (soft). Your own: none. | None |

- **Open on hover** (2026-10-08, replacing §13's "No Open button"): the card body selects; the title link, Open → and Enter on the selected card open it. The title is a link, so it also opens in a new tab.
- **Explore's Start Rabbit Hole** goes through the published page's own resume flow (`/e/<token>?rabbit=root`; explore-publish.md). **Fork** opens its "Fork this canvas" dialog in place; signed out, it signs in and the dialog opens again on the published page (`?fork=1`).
- **Your own card in Explore** is recognised by your profile's @handle (`loadProfile`). Handles are unique.

## Sorting

- **Explore** (§17) sorts on the server, over the whole published set before the 100-card limit. `GET /api/learn/boards/published?sort=`:
  - `newest` (the default): `published_at DESC`;
  - `updated`: canvas `updated_at` (0009, else `created_at`) `DESC`;
  - `forks`: `FORK_COUNT DESC`.

  Every sort ends on `published_at DESC, rowid DESC`, so ties are deterministic. Any other value is a 400. There is no ranking, Trending or personalisation, and the page never reorders what the server sends.
- **Library** (§18) sorts in the browser, over the owner's whole list: Last updated (the default), Created, Name, Most forked. Every order ends on the canonical name. The choice is the viewer's, kept in this browser (`small.library-sort:<org>:<email>`, try/catch). Apps keep their own order.

## The truthful browser state (only where content is not on the server)

Server persistence and the cross-device proof retired these for every canvas whose board is on the server (canvas-persistence.md, step 8). Home's heading is now "Continue learning". A canvas whose content is not on the server keeps the existing copy:
- "Content in this browser";
- "On another device", with "Its content is stored only in the browser that created it." A Home card in that state does not open.

## Not built, or changed from the old cards

- **Home Continue's order** is still `small.recent` (opens in this browser), not learner activity. There is no canonical learner-activity timestamp (canvas-metadata.md audit). Out of scope here.
- **Projects** have no visibility, fork count or `updated_at` on their rows, so their cards show none of these.
- **The Rabbit Hole type icon** is not drawn. Canvas rows carry no marker for a hole started from a shared canvas, and nested holes are not top-level cards.
- **The Library sort control** sits above the grid in `LibraryViews.jsx`. Beside Filters would need `App.jsx`, which is outside this lane.
- **Dropped lines,** to keep the exact hierarchy (§12): Library cards lose "In <Project>", "Standalone", the commit and canvas counts, and "Last explored". Home's Continue keeps Last explored and Next. A Map that is not ready still says so.

## Tests

- **Server:** `packages/control-plane/test/canvas-publications.test.js` ("Explore sorts on the server") covers the three sorts, the tie-breaks, the `created_at` fallback, refused values, and a sort over more than the limit.
- **Web unit:**
  - `src/home/card-sort.test.mjs`: the Library sorts, the remembered choice, the Explore ids;
  - `src/home/provenance.test.mjs`: description, fork count, updated;
  - `src/explore-publish.test.mjs`: Explore on the canonical card.
- **Browser:** `packages/web/e2e/card-redesign-check.mjs` (19 checks, local stack only) covers:
  - the size and two columns;
  - no type pills;
  - the GitHub link on projects only;
  - colour and hierarchy;
  - the owner badge on own cards only;
  - fork counts and Updated;
  - the description clamp;
  - the browser states;
  - the ⋮ menu;
  - the Library sorts and their memory;
  - the title opening;
  - Home Continue and Recent;
  - Explore actions and badge for both viewers;
  - the Explore sort against the server;
  - no page errors or emails.

  It adds one project row to the owner's `/api/apps` reply in the browser, because importing a repository needs the indexer.
- `e2e/card-redesign-check.mjs` also checks (2026-10-08) the `Shapes` canvas icon, no Fork on any own card, the select-not-open click with Open on hover, the footer as the last line with the count beside Updated, no "0 forks", Enter opening the selected card, Sort beside Filters, and the Explore card's soft `[Fork | N]` with its dialog's Cancel.
- `e2e/canvas-forking-check.mjs` reads no count at zero on your own card and no Fork on it.

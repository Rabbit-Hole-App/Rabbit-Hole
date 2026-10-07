# Card redesign: one canonical learning card

Owner rules, 2026-10-06 (card decisions §11-20). Library, Home and Explore render one card, `packages/web/src/home/LearningCard.jsx`. The surfaces differ by props only, so the creator profile can reuse the same card.

## Anatomy

```
[type]  Clickable Title                         Private  ⋮
        @handle [Owned by you]
        Forked from "Title" ↗ · @alice
github.com/owner/repository ↗        (a repository project only)
Optional description, at most three lines
Content in this browser               (this browser's state, until server persistence)
[fork] 14 forks                              Updated 2h ago
[Start Rabbit Hole] [Fork]            (actions, where the surface has them)
```

- **Size:** at 1440×900 a card is about 471 × 220-255 px, two columns (`CARD_GRID`: `minmax(min(100%, 380px), 1fr)`, 16px gap). The 1150px pages leave room for two. A phone gets one column. Three would need a page genuinely wider than today's.
- **Type icons:** a project is `FolderGit2` on a purple tile and a canvas is `PenLine` on a green tile. Jobs and servers keep `KindIcon` on a neutral tile. There is no textual Canvas, Project or Standalone pill. A screen reader hears the type from the tile's label.
- **Colour:** blue is navigation and the primary action: the title, the GitHub link, the owner badge, Start Rabbit Hole and Home's Continue →. Everything else is neutral: the @handle, description, times, forks, visibility, ⋮ and Fork.
- **Owner badge:** the existing `OwnerCheck` drawing, with `owned`. It sits beside the @handle on the viewer's own cards, with the tooltip "Owned by you · This is yours. It does not verify identity." (`data-owned-badge`). The source-owner check is unchanged.
- **Attribution:** `@handle` through `creatorLabel` (user-handles.md), with the display name first when set. Never an email.
- **Description:** the owner's own words (canvas-metadata.md), clamped to three lines. A project's server `description` ("Learn from owner/repo") is a placeholder and is not shown.
- **Forks:** the canonical direct-fork count, "0 forks" included (§12). A project row carries no fork count, so a project shows none.
- **Updated:** `updated_at`, else `created_at` (0009). A project row has no `updated_at`, so it shows `created_at` under the same rule.
- **Visibility:** a neutral pill on canvases, Private, Unlisted or Public (visibility-menu.md). Explore cards read Public. Projects show none, because their rows carry no access state.

## Surfaces

| Surface | The card and title open | ⋮ | Actions | Note |
|---|---|---|---|---|
| Library | `/apps/<name>` | The owned-card menu, exactly as built (visibility-menu.md). It opens upward when the window has no room below. | Fork on canvases (canvas-forking.md), neutral | This browser's content state |
| Home, Continue | Where it left off (`openHref`) | None | Continue →, a small text link at the footer's end | Last explored, Next, Content in this browser |
| Home, Recent | The recent action | None | A job or server keeps its own link | This browser's content state |
| Explore | `/e/<token>`, as a full page load | Copy link | Others' cards: Start Rabbit Hole (blue) and Fork (neutral). Your own: none. | None |

- **No Open button.** The card and its title open it (§13). The title is a link, so it also opens in a new tab.
- **Explore's Start Rabbit Hole and Fork** go through the published page's own resume flows (`/e/<token>?rabbit=root`, `?fork=1`; explore-publish.md). They work signed out too: sign in, then finish.
- **Your own card in Explore** is recognised by your profile's @handle (`loadProfile`). Handles are unique.

## Sorting

- **Explore** (§17) sorts on the server, over the whole published set before the 100-card limit. `GET /api/learn/boards/published?sort=`:
  - `newest` (the default): `published_at DESC`;
  - `updated`: canvas `updated_at` (0009, else `created_at`) `DESC`;
  - `forks`: `FORK_COUNT DESC`.

  Every sort ends on `published_at DESC, rowid DESC`, so ties are deterministic. Any other value is a 400. There is no ranking, Trending or personalisation, and the page never reorders what the server sends.
- **Library** (§18) sorts in the browser, over the owner's whole list: Last updated (the default), Created, Name, Most forked. Every order ends on the canonical name. The choice is the viewer's, kept in this browser (`small.library-sort:<org>:<email>`, try/catch). Apps keep their own order.

## The truthful browser state (kept until persistence)

Canvas content still lives in the browser (canvas-storage-audit), so the cards keep saying so (owner §5). None of this is hidden before server persistence and the cross-device proof:
- "Continue — on this device" (Home's heading);
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
- `e2e/canvas-forking-check.mjs` now reads "0 forks" at zero, and checks that the title opens in place of an Open button.

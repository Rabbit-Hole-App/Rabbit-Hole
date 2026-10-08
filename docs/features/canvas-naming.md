# Canvas naming

Owner rules, 2026-10-06. Titles are labels, never identities.

## Rules

- **Identity is the canonical name** (`canvas-xxxxxxxx`), immutable. It carries routing, ownership, forks, Rabbit Holes, shares, publications and telemetry. A title never identifies anything. A rename changes the title only.
- **Different people may own the same title.** The creator's @handle disambiguates in public.
- **A title the learner types is kept exactly:** at creation ("new canvas Binary Search") and on rename. It is never rewritten to "(2)", even when the owner already has that title. Uniqueness is never required, and creation is never refused over a title.
- **Copies the system makes for their owner** step to the next free ` (n)` when the owner's own top-level Library already has the title:

  | Copy | Result |
  |---|---|
  | **Duplicate** | "Attention Playground" → "Attention Playground (2)" → "(3)". Duplicating a copy steps on from the base title. |
  | **A fork** | Keeps the source's title when the forker has none like it, and steps on when they do. The provenance (`forked_from_title`) always keeps the source's own title. |

  "Next free" is the smallest number from 2 up that is not in use, so a number already taken (typed by hand, say) is skipped and never overwritten.
- **What counts as a collision:** only the same owner's top-level canvases, archived included (`freeTitle`, canvases.js). Nested Rabbit Holes, another owner's canvases and projects (repositories) never count. A project and a canvas may share a title; the card's type icon tells them apart.
- **Nested Rabbit Holes need no unique titles,** and their creation is never suffixed. They are identified by their parent and origin.
- **One title per object:** the same canonical title shows on every surface (Home, Library, Explore, shared, `/e`, fork provenance).

## Duplicate

- **Where:** Library card ⋮ → Duplicate, on your own canvases.
- **Route:** `POST /api/learn/boards/duplicate` `{ source: { canvas }, state? }`, owner only. It answers `201 { name, title, url, files, duplicate: true }`.
- **What it makes:** a new private canvas of yours, independent of the source.
  - It is not a fork: no `canvas_forks` row, so no provenance and no change to anyone's fork count.
  - It keeps the source's project.
  - It runs the same copy as a fork of your own canvas (fork() with `duplicate`): this browser's content (`state`), or else the server copy. `state: null` (the Library's `localBoard` when this browser holds no copy) means the server copy too, never a 400 (owner bug, 2026-10-08: "even duplicate gives state must be a board object"). Notebook ids are renamed, and the server copy's files are copied.
  - It is the only copy of your own canvas in the UI: your own canvas has no Fork (canvas-forking.md, 2026-10-08).
- **Refused:** a share link (400; links fork), another workspace's canvas (404), signed out (401).
- **Transitional:** while canvas content lives in the browser (canvas-storage-audit), the copy's content travels with the request, exactly as Fork's does. When server persistence owns content, Duplicate copies the server's canonical state instead.
- `ponytail:` there is no replay key. A double press in the menu is one action (the menu closes), but a request retried after a lost reply makes a second copy. Add a key, as Fork has, if that is ever seen.

## Tests

- `packages/control-plane/test/canvas-naming.test.js` covers:
  - two owners with one title;
  - a typed title kept;
  - Duplicate "(2)", "(3)", "(4)", with no fork row or count, content copied, private;
  - the next free number;
  - fork keeps the title, then suffixes, and provenance keeps the source title;
  - a rename to a duplicate allowed with the id unchanged;
  - routing by name;
  - project, hole and another owner never counting;
  - Duplicate refusals.
- `packages/web/src/canvas-naming.test.mjs` covers the Library ⋮ wiring and the copy call.

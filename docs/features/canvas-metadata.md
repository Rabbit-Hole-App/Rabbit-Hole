# Canvas metadata: description and updated_at

Owner rules, 2026-10-06.

## Schema

`learn-migrations/0009-canvas-metadata.sql` creates `canvas_metadata (org, canvas, description, updated_at)`, primary key `(org, canvas)`.
- It is a narrow side table for what `canvases` does not hold cleanly. It never copies the title, owner, publication, fork state or content.
- It is additive and re-runnable (`CREATE TABLE IF NOT EXISTS`), LEARN_DB only, and backfills nothing.
- It runs on local test databases only until a deploy GO. Deploy order: 0004 → 0005 → 0006 → 0007 → 0008 → 0009.
- **No row** reads as `description` null and `updated_at` = `canvases.created_at`. A row is made at the canvas's first meaningful change.
- **Timestamps** use the same text form as `created_at` (SQLite `datetime`, with milliseconds), so the two order together.

Every canvas row the owner reads carries `description` and `updated_at`: `GET /api/canvases`, `GET /api/apps/<canvas>`, and the PATCH reply.

## updated_at: the last meaningful change

**Bumps:**
- A rename that changes the title.
- A description edit that changes it.
- A change to the canvas's saved server content (`PUT /api/learn/boards/<canvas>/<board>` whose state differs from the stored one).
- Later: material and card changes, once server persistence owns them.

**Never bumps:**
- Opening or viewing, the canvas or its board.
- A selection or hover.
- A share link turned on or copied.
- Publishing, or a publication being opened.
- Someone else's fork or Rabbit Hole from it.
- A handle change.
- A save of identical content.
- **The board's first server copy.** That is a sync of what the browser already had (sharing, publishing), not a change.

**Known limit:** a private canvas's content lives in the browser (canvas-storage-audit), so its edits reach no server and do not bump `updated_at` until server persistence lands. Until then, a private canvas's `updated_at` moves on rename and description edits only.

## description

- **What it is:** optional plain text, at most 500 characters, trimmed. Empty clears it to null.
- **Who writes it:** only the canvas's owner, through `PATCH /api/apps/<canvas>` `{ description }`. The same route takes `{ title }`; either may come alone.
- **Never generated:** no LLM writes it at render time, and no Tutor or private chat ever stands in for it.
- **Where it travels:**
  - Duplicate carries it (the owner's own words).
  - A fork starts without one.
  - Explore's listing returns it, with `updated_at`, for the public card.
- The Edit description menu row arrives with the owned-card ⋮ (visibility menu step). Cards clamp it to 2-3 lines (card redesign).

## Ordering

- **Library:** `GET /api/canvases` lists by `updated_at DESC`, then `c.id DESC` (deterministic). The Library's sort control (Last updated, Created, Name, Most forked) comes with the card redesign.
- **Home "Continue learning"** is a different question: the learner's last meaningful learning activity, not `updated_at`. It does not overload `updated_at`.

**Audit, 2026-10-06:** there is no canonical last-learning-activity timestamp today.
- Home's Continue reads `small.recent`, a browser-only list of opened canvases, so it measures opens.
- The server has only partial signals:
  - `threads.created_at`: chat start only; messages carry no time.
  - `learning_journeys.updated_at`: journey canvases only.
  - `learn_grades`: graded attempts.
  - `learn_boards.updated_at`: shared boards' saves.
- A canonical learner-activity record belongs with server persistence and the analytics contract. It needs its own proposal.

## Tests

`packages/control-plane/test/canvas-metadata.test.js` covers:
- 0009 additive, re-runnable and mirrored in repository-schema.sql, with no backfill and metadata columns only;
- the no-row defaults;
- rename and description bumps, and a no-op rename that doesn't bump;
- the 500-character limit, text only, owner only;
- content-change bumps, but not the first copy or the same content;
- passive use never bumping (open, share, publish, someone else's fork or Rabbit Hole, a handle change);
- Library order;
- Duplicate carrying the description, a fork not, and Explore listing it.

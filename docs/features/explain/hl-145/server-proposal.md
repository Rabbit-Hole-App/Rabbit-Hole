# HL-145 server proposal: pink passages and the two-way link for cards that are not Markdown files

Status: PROPOSAL, nothing built, not in release 144/145. Needs the owner's approval of the schema change (option A) or a go-ahead on option B.
Written 2026-11-14 against main `8d5071585` (explain/hl-145-on-ctrlk `f250cd48b`).

## What exists, and the gap

A passage explained through Ctrl+K gets its persistent pink mark and its link both ways from the card's `sourceRef` (the server-held
reference to one passage of one source at one immutable revision). Today that works for a **Markdown file card** (and PDF excerpts).
It cannot work for a passage inside an **Explanation, webpage, code or note card**, because a `sourceRef` needs a source key and the
server accepts only `file:fs_<24 hex>`, `doc:ctx:<12 hex>` and `pdf:upload:<12 hex>`:

- `packages/web/src/source-ref.js:21` `SOURCE_KEY`, `:27` `kindOfKey` (`file:` is markdown, `doc:ctx`/`pdf:upload` is pdf, anything else is null);
- `packages/control-plane/src/source-refs.js:77-80` (`POST /api/learn/source-refs` refuses any other key with 400/404);
- `packages/control-plane/learn-migrations/0038-source-refs.sql:21` `kind TEXT NOT NULL CHECK (kind IN ('markdown', 'pdf'))`.

Those passages still get the transient pink mark while the Ctrl+K window is open (HL-2). Nothing persists and no link exists.

## Option B (recommended first, no server change): Explanation cards keep it in the card

An Explanation card already saves its own highlights in the card (`block.highlights`, `explanation-interactions.js:192`, `{ id, contentRevision,
segments:[{ field, quote, start, end, contentRevision }] }`, current only when `segmentHolds`). The board save carries any block field, and
`learn-boards.js` has no whitelist for `highlights` (the plain Highlight button already uses it). So for a passage inside an Explanation card:

- store the explained passage as one more entry of `block.highlights` with `explainedBy: <new card id>`; draw those pink (the same `--color-explained`), never yellow;
- the new card carries `fromPassage: { cardId, highlightId, contentRevision }` (a client-held field, not a `sourceRef`), and shows the same **Go to highlight** icon top right;
- the pink passage shows **Go to card** on hover (the Explanation card's existing highlight menu, `data-explanation-highlight-menu`, gains the entry);
- a changed card revision draws nothing and says "Source changed" (`segmentHolds` already refuses a moved quote); a deleted card says the card is gone.

Touches: `explanation-interactions.js` (`withHighlight` takes the optional `explainedBy`), `ExplanationInteractions.jsx` (decorate pink, menu entry, hover icon),
`learn-slash.js`/`LearnPage.jsx` (write the field when the card is made), `SourceRefChip.jsx` (the header icon for `fromPassage`), CSS, tests. All web.
Risk: it is a client-held link, so a copied or forked card keeps the field but nothing checks it (the existing `sharedSourceRef` rule: a shared reader gets a label, never a way in; the same reduction must be added for `fromPassage`).
Server: none, assuming the board save keeps the unknown fields it keeps for `highlights` today (confirm with one board save on the dev clone before building).

## Option A (server change, needs the owner's approval): `card:` source keys and kind `card`

For every card type (webpage, code, notes) and for a ref the server can re-check like a file's.

**Key family.** `card:<boardId>:<blockId>` with `boardId` the board's UUID (36 chars) and `blockId` the saved block id (`[A-Za-z0-9_.-]{1,80}`);
regex `^card:[0-9a-f-]{36}:[A-Za-z0-9_.-]{1,80}$`. Kind `card`. The revision (`source_rev`, 64 hex) is the sha256 of the card's text fields as saved
(for an Explanation card its `interactions.contentRevision` input; for others a hash of `title` + `body`/`text`).

**Anchor.** `{ field: 'title' | 'body' | 'caption' | ..., quote: { exact, prefix, suffix } }`, rebuilt server-side in a fixed key order like the Markdown quote (`refAnchor`).

**Status.** `current` when the board's card still hashes to `source_rev`; `changed` when it differs; `missing` when the card or board is gone; `unavailable` when the caller does not own the board
(a ref still grants only its owner, `ownRow`).

**Schema change.** `learn_source_refs.kind` has a CHECK that SQLite cannot alter, so the table is rebuilt:
`packages/control-plane/learn-migrations/0045-source-refs-card-kind.sql` (LEARN_DB; the next free number: main's learn-migrations end at `0044-depth-names.sql`, 15+ release branches also stop at 0044;
the `migrations/` folder, which ends at `0028-email-preferences.sql`, is the main D1 and is not touched; the "after 0027" in the brief is that folder).

1. `ALTER TABLE learn_source_refs RENAME TO learn_source_refs_0044;`
2. `CREATE TABLE learn_source_refs (...)` as 0038 but `CHECK (kind IN ('markdown', 'pdf', 'card'))`, same two indexes recreated.
3. `INSERT INTO learn_source_refs SELECT * FROM learn_source_refs_0044;`
4. leave `learn_source_refs_0044` in place for one release (rollback), drop it in a later migration.
`learn_source_ref_cards` has no kind column, so its shape is unchanged; the CASE in `source-refs.js:141-146` (`WHEN source_key LIKE 'file:%' ... ELSE pdf_source_hashes`) gains a `WHEN source_key LIKE 'card:%'` branch.
What it touches: both tables above in LEARN_DB only; `file_sources`, `pdf_source_hashes`, the boards, the main D1 are read-only or untouched. It is additive and re-runnable (guard each step with `IF NOT EXISTS` / a probe of `sqlite_master`).

**Code.** `source-ref.js` (`SOURCE_KEY`, `kindOfKey`, `STATUSES`, `sourceRefOf`, `sharedSourceRef`, a `card` anchor reader), `control-plane/src/source-refs.js` (`refAnchor` for `card`, `resolveRow` reading the card from the board, the CASE branch),
`pdf-excerpts` `readSource` (a `card:` reader: owner check, load the board block, hash it), the roadmap readers that list `learn_source_refs` (`roadmap/roadmap-source-read.js`, `roadmap-source-refs.js`) must ignore kind `card`.
Web: `FileDocMarkdown`'s pink/link code is reused per card type; each card type needs its own painter and its own header/hover icon, so A is a larger build than B.

**Rollback.** Redeploy the previous release. Rows of kind `card` are ignored by the old code (`sourceRefOf` returns null for an unknown kind, the card shows no source row); the old table is intact as
`learn_source_refs_0044`. If the migration itself must go: `DELETE FROM learn_source_refs WHERE kind = 'card'`, drop the new table, rename `learn_source_refs_0044` back.

**Tests.** control-plane: mint, resolve and reject for a `card:` key (own board current, edited card changed, deleted card missing, another learner's board refused, malformed key refused); a migration test that applies 0038..0045 to an in-memory SQLite and checks a markdown and a card row coexist;
roadmap readers skip kind `card`. Web: `source-ref.test.mjs` draft and reader for kind `card`; the HL render pins per card type. No browser run is needed for the server part.

**Operations.** The dev D1 is shared by every clone and by the shared dev worker: announce before applying; apply on the dev D1 first, run the control-plane suite, then the owner applies it on production immediately before the release that reads it (the 0038 header's rule). Not applied by me.

## Recommendation

Approve option B for Explanation cards now (web only, one release, no migration). Hold option A until a second card type (webpage or code) needs the persistent mark; then approve 0045 with the plan above.

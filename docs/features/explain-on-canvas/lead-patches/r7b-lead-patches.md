# R7b lead patches (Lead-only files). Nothing here is applied by the lane; no migration exists for R7b and none is applied.

R7b is stacked on R7a (git ordering and shared tables only). It needs no new migration number (0043 stays unused): it stores its index in the R7a `learn_source_indices` table with `kind = 'pdf'`, which the 0042 migration already admits.
It registers no model role and makes no model call, so there is no `learn-models.js` patch.

| Lead-only file | Patch | Apply |
| --- | --- | --- |
| `scripts/ci/check-map.json` | 1 new row + 7 appended rows (no new e2e check) | `node docs/features/explain-on-canvas/lead-patches/apply-r7b-check-map.mjs` after `apply-r7a-check-map.mjs`; proven on the worktree: `scripts/ci/check-map.test.mjs` 22/22 with both applied |
| `packages/control-plane/repository-schema.sql` | none beyond the R7a append (`apply-r7a-schema.mjs`) | - |
| `wrangler*.jsonc`, route mounts, `LearnPage.jsx`, `learn-usage.js` | none. `ROADMAP_PDF_ENABLED` is read from `env`; unset is off. Optional explicit `"ROADMAP_PDF_ENABLED": "false"` beside `ROADMAP_ENABLED` in a dev config | optional |

## Decisions the Lead owns

1. **R4 files R7b touched on this branch.** To make a context PDF work through the R4 loop without a second code path, R7b made small, switch-gated, additive edits to R4 State files and one R3-era reader:
   `roadmap-source-reader.js` (dispatch of `doc:ctx:<id>` keys to the PDF reader), `roadmap-access.js` (`revalidateSourceAsJob` PDF branch, D1 only), `roadmap-source-refs.js` (`d1MintSourceRef` returns "skipped" for non-`file:` keys),
   `roadmap-source-read.js` (the PDF branch of `makeReadSource`), `learn-context-docs.js` (one new export, `readOwnDocumentPages`, beside `readOwnDocument`), and the R7a index module (generic `version`, `indexVersion`, `coverage`, `extra` parameters on `indexIdOf` and `saveIndex`).
   If another lane edits any of them, rebase these hunks; each is under 20 lines.
2. **No R3 sourceRef on PDF cards.** R3's PDF anchor is a rectangle set from the viewer (`highlightAnchor` in `pdf-excerpts.js`); a server that only has page text cannot mint one without inventing geometry. Cards made from a PDF range therefore carry no `sourceRef`.
   R7b's own references (PDF-order page plus offsets inside that page's extracted text, extraction origin, content hash) are returned with retrieved evidence only. A page-level R3 anchor kind is an owner/R3 decision; it is not made here.
3. **Invitations.** `decideInvitation` and the invitation offer are Markdown-file only; R7b adds no PDF invitation. A PDF roadmap is created by the existing create route with `source.key = doc:ctx:<id>` (the client must send it). Wiring a PDF Explain entry in the UI is Lead/UI work.

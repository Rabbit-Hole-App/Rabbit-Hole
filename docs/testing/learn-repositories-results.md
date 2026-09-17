# Public repository Learn: dev verification

Date: 2026-09-17. Regular Small dev only. Live Small and Amazon BYOC unchanged.
Deployed worker version: `2bd52804-6207-4521-b99a-4c0fdd5c87a7`.

## Real import

- Repository: https://github.com/karpathy/nanoGPT
- Selected branch: `master`
- Resolved commit: `3adf61e154c3fe3fca428ad6bc3818b27a3b8291`
- Indexer: `graphifyy-0.9.63-small-1`
- Result: 20 text files, 76 nodes (55 with local source anchors), 108 edges,
  6 excluded files.
- [Open the imported project on dev](https://small-cp-dev.zeroshothq.workers.dev/apps/repo-06745f10-nanogpt?tab=code).
  Workspace membership is required; this fixture is in the importing owner's
  Gmail workspace, not publicly accessible through the link.

## Real Learn question

> Where is the causal attention mask applied? Read the relevant source and cite
> exact lines. Keep it brief.

The model distinguished the two implementations correctly:

- Flash attention passes `is_causal=True` at `model.py:62–64`.
- The fallback registers a lower-triangular buffer at `model.py:48–50`, then
  applies `masked_fill` at line 68 before softmax at line 69.

These claims were checked against the imported source. The answer included
clickable evidence pills for `model.py:44–50` and `model.py:61–69`. Opening one
displayed the highlighted source while preserving the chat composer. The answer
was longer than the requested brief response; this is not a calibrated answer
quality score. One real model answer was generated, using API billing. Later UI
checks reused that saved answer without another model call.

## Browser checks

- Import dialog found the real repository's `master` branch.
- Async import reached ready and displayed the graph.
- Searching `CausalSelfAttention` located the correct symbol and source.
- Double-click expanded a five-node neighborhood. Zoom controls worked.
- Source stayed syntax-colored and the composer remained visible.
- Saved chat reopened from History; its evidence pill opened source.
- Learn opened the existing canvas with repository context and the same private
  Learn history, without the unrelated logistic-regression demo.
- Course endpoint allowed the importer to author a course.
- Refresh of the unchanged branch returned `reused: true` and the same commit.
- Unauthenticated snapshot access returned 401. An explicit unavailable
  workspace returned 403. No browser page errors were observed.

Local browser evidence: `.small/repository-check.json` records the original
import/model run; `.small/repository-review-check.json` records the passing review.
Screenshots are `.small/repository-overview.png`,
`.small/repository-neighborhood.png` and `.small/repository-learn.png`.

## Automated checks and review fixes

68 JavaScript tests passed across repository, research, curriculum, board,
teaching, preview-review, chat and scene suites. Three Python archive tests passed.
Coverage includes URL validation, bounded retrieval, workspace/owner permissions,
private histories, immutable versions, asynchronous success/failure/cache reuse,
non-execution of imported code and archive path/size validation.

Review found and fixed:

1. Public GitHub REST metadata hit its shared anonymous quota. Branch resolution
   now uses anonymous Git refs from the dev worker.
2. The live catalog falls back for unknown workspace headers. Repository access
   now rejects a requested workspace that differs from the resolved membership;
   a regression test covers this.
3. Graph search prevented neighborhood expansion. Explicit focus now takes
   priority until the search changes.
4. Repository Learn inherited unrelated sample lessons and runtime questions.
   Its initial canvas and starter questions now match imported source projects.
5. Curriculum generation now retains the existing AI configuration database while
   storing repository courses in the isolated dev database.

## Limits of these results

This verifies one small Python repository, not general language coverage or a
token-saving claim. The graph is deterministic code extraction, not a recovery
of undocumented design reasoning. Changed-commit preservation and failed-refresh
behavior were tested with controlled fixtures; the real branch was unchanged.
The existing curriculum flow is connected, but a new nanoGPT curriculum and
canvas explanation were not generated in this check. No repository code ran.

## Graph and chat interaction follow-up

Latest dev build: `5fa05281-860b-4a34-b1b8-2adb16f58557`.

The follow-up adds resizable inline panels, a draggable force graph, nested Back
navigation, source-range attachments and inline citations, plus graph-query tools
and saved graph views per answer. Thirty focused repository/research/chat/citation
tests passed, including source tampering rejection, commit mismatch rejection,
ambiguous graph symbols, edge direction/confidence and persisted graph events.

Real browser checks covered:

- Right panel drag from 420 to 550 px, keyboard resizing, reset, responsive bounds,
  and the same shared resizer in Learn.
- Node dragging without panning the graph, connected-node movement, nested Back,
  and direct dragging without ambient movement under reduced-motion preferences.
- Source selection by mouse and by line-number/Shift-click; lines 87–101 produced
  a 15-line preview/highlight. Clearing removed the attachment.
- One real selected-code question about lines 62–69. The answer correctly described
  flash attention versus the manual causal-mask path. The sent range and persisted
  question referenced the exact commit and lines.
- Inline `line 45` and `model.py:62–64` references opened the source with one and
  three highlighted lines respectively, while preserving the composer.
- A real “How does GPT connect to CausalSelfAttention?” question invoked
  `find_connection_path` and returned a two-hop structural path through `model.py`,
  with two EXTRACTED contains edges and explicit reverse/forward traversal.
  This is a co-location path, not a runtime call trace; the answer distinguished
  that limitation. The main graph automatically displayed the three returned nodes.
- The saved Show on graph pill reopened that exact view, Back restored the prior
  view, and the pill still worked after reload. Learn's Graph button returned to
  the main graph. Selected-node context appeared in a green pill.

Local evidence: `.small/repository-interaction-check.json`,
`.small/repository-selection-check.json`, `.small/repository-final-check.json`,
and `.small/repository-followup-check.json`. The selection harness encountered a
DevTools response-body retrieval error after the model answer appeared; the saved
history and screenshot confirmed the answer. The first graph-pill reopening
assertion failed. The follow-up removed redundant same-route navigation and waited
for the expected rendered nodes; reopening and reload then passed without another
model answer. Earlier failed evidence is retained.

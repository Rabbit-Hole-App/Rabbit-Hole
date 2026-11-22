# Release 169: relationship reference content (2026-11-21)

The lead wrote this from the release agent's text and checked the remote, the commit, the diff, the recovery tree, the pins and the web suite itself. Content only: reference data (arrow labels of nine relationship reference families rewritten so that none has more than three note lines), two tests and a token-budgets JSON that follow from it, and svg-snapshots.json. No flag, no migration, no code change, no same-JSON code, nothing from the composition branches. **Nothing is released and the launcher has not been run.**

## What is in it
- Main used: **d0addb74afb03cbc3cf82b01a5afc812e2bf5e6e** (release 168, live), an ancestor, so the release fast-forwards.
- Release SHA **0e6a1475b2737ff80edf47484d4ad33ed8baf4f4** on `feat/release-169` (pushed, no force). `git log main..HEAD` holds exactly one commit: 0e6a1475b, a cherry-pick of Codex's **b5b40d7dd** ("fix(explain): shorten notes on nine relationship reference families", author yc, no trailers; its parent 1b36e600c is already in main). Not rewritten.
- Recovery branch **recovery/rel-content-169** at 7f9bff651e26ac12375034f17cc184c707b3be06: one commit on top of the release SHA holding main's tree (tree b31a23fd44fb = main's tree, checked). Worktree C:/s/r169-int.

## Diff by file (main..HEAD: 9 files, +250 −222; all under packages/web/src/tutor-diagrams/)
| file | lines changed |
|---|---|
| d2l-figure-references.js | 24 |
| figure-chapter-token-budgets.json | 78 |
| gallery-architecture-expansion-references.js | 22 |
| ml-batch3-topology-references.js | 10 |
| ml-topology-references.js | 11 |
| stable-diffusion-figure-references.js | 12 |
| ml-batch3-topology.test.mjs | 9 |
| relationship-graph.test.mjs | 38 |
| svg-snapshots.json | 268 |
No control-plane, schema, prompt or layout/renderer code file (checked: the list above is the whole diff).

## Snapshots
Codex's commit already contains svg-snapshots.json; regenerating on the tree (`UPDATE_TUTOR_SVG_SNAPSHOTS=1`) gives a file identical to HEAD's (a no-op; a CRLF-only artifact was restored with git checkout), so there is no regenerated commit. Against main's file: 3349 entries on both sides, **0 added, 0 removed, 69 entries changed in exactly 23 ids**, nothing else moved. The 23 ids, all relationship references: the nine families ml-stable-diffusion-unet-timestep-and-skips, d2l-softmax-affine-class-scores, d2l-dense-hidden-layer-activations, d2l-regularized-forward-graph, figure-gallery-multistream-residual, figure-gallery-encoder-global-kv, figure-gallery-shared-kv-and-index (each as base, -brief and -detailed: 21 ids), plus ml-version-lineage and ml-neural-network-weights (one id each).

## Guards
- **Request identity** (guards.mjs adapted from the same-JSON guard; 492 references, 742 prompts, four requests each: Gemini and fallback, no plan and planned with a seed): 9 prompts changed, all in the 9 references whose spec, detailSpec or depths changed between the trees (the nine families without suffix); every one of those 9 moved; **733 prompts identical, all of them in unchanged references; no other reference's request moves**. Exit 0.
- Library request hashes (hashes.mjs, both trees, 492 references): 9 ids moved (the same 9: body, Gemini and Fireworks hashes), the schema hash moved in 0; maximum Gemini properties 350 on main and 350 on the branch.
- First-pick replay (474 rows): 0 moved.
- **Whole web suite**, two runs on the release tree: the agent's run (overlapping other heavy jobs): 7658 tests, 7624 pass, 6 fail, 27 skipped, 1 todo; the six were `runtime_limit` timeouts in Animation3DCard.test.mjs, explain-program/state-contract.test.mjs and interact-compat.test.mjs, which pass alone (52 of 52). My run with nothing else running: 7658 tests, 7628 pass, **2 fail**, 27 skipped, 1 todo; the two were an animation3d framing test and an interact-deep test (the comparison recomputed for the main launch speed; the saved FX-AN-025 game), which pass alone (27 of 27). Different files on each run, all animation or interact runtime tests that depend on timing, none touching these files; they were not run on main in this release. In earlier releases the same family of tests passed on the full run (release 168: 0 fail), so read these as load flakes, not as ours; say if you want them proven on main.
- tutor-diagrams directory alone: 1647 of 1647 pass.
- **What the fast path runs** (`affectedTests` on main..HEAD, plan.json here): packages/web, 9 test files (browse-contrast, inline-ai-annotation, no-sparkles, notebook-hosts, session-display, d2l-figure-references, ml-batch3-topology, ml-topology, relationship-graph), all pass; packages/control-plane: only `test/credits-only-ui.test.js` (the TREE_SCANS rule), 3 of 3 pass. Uncovered by the import scan: figure-chapter-token-budgets.json, gallery-architecture-expansion-references.js, stable-diffusion-figure-references.js and svg-snapshots.json (the snapshot test is in the preview smoke list and passes).
- **Bundle size: not measured.** The wrangler dry run was refused once by the permission layer and not retried or worked around. (Release 166: 9157.86 KiB.) The release adds reference data only.

## Preview (as for 168)
Through the heavy lock; build, affected-tests, smoke (including the render check, 38 of 38) and deploy passed: **PREVIEW OK, exit 0**. Clone https://rabbit-hole-web-dev-r169-int.tryrabbithole.workers.dev (clones refuse sign-in; the launcher is the signed-in path), build caa7e9fb6eed, record 8caed3c6850e26ea. The smoke list is the 168 list plus the d2l-figure-references, ml-batch3-topology and figure-chapter-references tests (42 tests). No Cloudflare error 10067; no clone deleted. The preview prints that `git push rabbit-hole refs/notes/dev-deploys` is needed for a push to main to release this exact commit: an owner launcher step (release-mvp.sh), not done.

## Launcher (prepared, not run)
In `C:\s\spec\release-queue\`: `release-169-rel-content.cmd` (CRLF, `call :one 169 0e6a1475b2737ff80edf47484d4ad33ed8baf4f4`), `169-rel-content.pins`, `preview-169-rel-content.mjs`, `run-preview-169-rel-content.sh`; made by C:/s/gen1-prep/mk-release-169.mjs. The pins source cleanly (SHA 0e6a1475b, MAIN_PREV d0addb74afb03cbc3cf82b01a5afc812e2bf5e6e, W C:/s/r169-int, RECOVERY recovery/rel-content-169, label 660 characters with no `"`, backtick, `$` or backslash; the label says content only, nine families, 23 ids, that the Gemini requests of those references' own prompts change, no flag, migration or code).

## After the owner's GO
The owner runs `C:\s\spec\release-queue\release-169-rel-content.cmd` (one launcher). Afterwards the lead deletes its own preview clones `rabbit-hole-web-dev-r168-int` and `rabbit-hole-web-dev-r169-int` when the next preview exists, and removes the worktree junctions only with `cmd //c "rmdir C:\s\r168-int\node_modules"` and the same for r169-int.

## Not checked
Bundle size and startup; the two timing-dependent web tests on main.

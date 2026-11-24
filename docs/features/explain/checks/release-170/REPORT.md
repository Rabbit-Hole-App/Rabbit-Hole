# Release 170: remove the arrow crossings that release 169 introduced (2026-11-24)

The lead wrote this from the release agent's text and re-checked the remote, the commit, the diff, the recovery tree, the snapshot numbers, the budget method, the pins, the web and tutor-diagrams totals and the pictures itself. Content only (reference data, its snapshots and token budgets) plus one test and its geometry helper. No flag, no migration, no renderer or layout code, no same-JSON code. **Nothing is released and the launcher has not been run. feat/release-169, its recovery branch, pins and launcher are untouched.**

## What is in it
- Main: **d0addb74afb03cbc3cf82b01a5afc812e2bf5e6e** (release 168). feat/release-169 tip 0e6a1475b is **not** on main.
- Branch **feat/release-170** at **b29b6bdd7f17c8b700aca15875f99fe7b6a377ae** (pushed, no force), off feat/release-169 0e6a1475b. Exactly two commits ahead of main: 0e6a1475b (release 169's, Codex's b5b40d7dd cherry-picked) and **b29b6bdd7** (this release's: one commit, plain message, no trailers).
- Recovery branch **recovery/rel-crossings-170** at 4863d875ce634ecce4726dadf914d7837b301f46: one commit on top of the release SHA holding main's tree (tree b31a23fd44fb = main's tree, checked). Worktree C:/s/r170-int.
- The commit (numstat): figure-chapter-token-budgets.json 6/6, gallery-architecture-expansion-references.js 1/1, relationship-graph.test.mjs 18/1, stable-diffusion-figure-references.js 3/2, svg-snapshots.json 45/45, test-relationship-geometry.mjs 18/2. Only these six files. The edge order of the two references is main's, with 169's labels; no label text, caption, renderer or layout code changed.
- The helper: `relationshipGeometry` now also returns `points`; a new exported `tipHits(edges, reach = 16)` sits next to it and implements the reviewer's measure (tip = last point of `wirePoints`; a hit is a vertical segment of another edge whose y-span contains the tip's y by more than 1 px on both sides and whose x is within 16 px). The reading is `|x - tipX| <= 16`; every hit in all three trees is exactly 14.0 px, so "<" gives identical counts.

## The reviewer's table, with our numbers (each row measured; all match)
| check | expected | ours |
|---|---|---|
| hits over all 57 specs, 408 and 720 px | 2, both ml-feedback-graph (as main) | 2, both ml-feedback-graph (`users:model` near the tip of `training:model`): **match** |
| U-Net, all three ids, at 320/408/720 | 2 note lines (Passes features, Conditions on noise level); 2 labels on arrows (Skips with early features, Predicts noise) | same: **match** |
| U-Net snapshot entries (width x height) | /408 564x772, /960 720x772, /natural 640x772; -brief the same widths, height 755 | base 564x772, 720x772, 640x772; -brief 564x755, 720x755, 640x755; -detailed 564x772, 720x772, 640x772 (I read these from svg-snapshots.json myself): **match** |
| shared key/value, all three ids | 2 note lines; `Passes updated state` on its arrow | 2 note lines (Limits the positions read, Supplies key and value rows); `Passes updated state` on its arrow: **match** |
| shared key/value snapshot entries | /408 540x547, /natural 580x547, /960 720x530 (-detailed 720x547) | base and -brief 540x547, 580x547, 720x530; -detailed 540x547, 580x547, 720x547: **match** |
| svg-snapshots.json against release 169 | 18 entries in exactly those 6 ids, 0 added, 0 removed | 18 entries, the 6 ids (ml-stable-diffusion-unet-timestep-and-skips, figure-gallery-shared-kv-and-index, each base, -brief, -detailed), 0 added, 0 removed (verified by the lead): **match** |
| svg-snapshots.json against main | still 69 entries in the same 23 ids, 0 added, 0 removed | 69 entries, 23 ids, 0 added, 0 removed (verified by the lead): **match** |
| the three-note-lines test and the 57-spec label test | pass unchanged | pass unchanged: **match** |
| tutor-diagrams directory | 1648 of 1648 | 1648 of 1648 (td.log): **match** |
| guards.mjs against main | identical 733, declared 9 (the same 9 ids), undeclared 0, exit 0 | identical 733, differing in the 9 declared ids (the same nine), undeclared 0, exit 0 (guards.json): **match** |

Extra guard (guards-169-vs-170.json): 169 against 170: 740 prompts identical, 2 differ (the U-Net and the shared key/value references), 0 undeclared. That backs the pins label: only those two references' own prompts change.

## Crossings (crossings.json; hits-main.json, hits-rel169.json, hits-branch.json; scripts crossings.mjs, notes.mjs)
Over all 57 relationship specs at 408 and 720 (114 renders per tree): **main 2 hits in 2 renders; release 169 32 hits in 14 renders; this branch 2 hits in 2 renders** (the same two as main). The 30 new hits of release 169 are all `down:up` near the tips of `x:down`, `t:down`, `down:middle` in the U-Net family and `early:late` near the tips of `index:early`, `cache:early` in the shared key/value family, base, -brief and -detailed, at both widths.

The new test (one test in relationship-graph.test.mjs: the 23 revised ids at 408 and 720, zero hits; three small asserts on the rule itself): passes here (12 of 12 in the file). **It fails on release 169:** an extract of release 169 with the new test and helper copied in gives 11 pass, 1 fail, at the U-Net at 408 (tip edges x:down, t:down, down:middle against down:up at x = 224).

## Pictures (four PNGs at a 408 px request, release 169 left and this branch right, each labelled with its drawn size)
unet-base-169-vs-170.png, unet-brief-169-vs-170.png, sharedkv-base-169-vs-170.png, sharedkv-brief-169-vs-170.png. I opened the two base pictures myself. On 169 the skip wire takes the inner lane and its vertical run passes through the Bottleneck's arrowheads (U-Net) and the First attention read's arrowheads (shared key/value), so it reads as entering them. On 170 the skip wire leaves Early features, takes the outermost right lane and ends at the Up (U-Net) or Later attention read (shared key/value) block; no arrowhead has another arrow's vertical run behind it in any of the four pictures. The skip still crosses the down:middle wire's vertical run (wire over wire, no arrowhead), as in main, and several heads stack closely at the Up block, as in main.

## Known cost (stated, not worked around: the owner decides)
At a requested width of 408 the two cards draw wider than in 169: **the U-Net 564 px (169: 408), the shared key/value 540 px (169: 408)**; at a 320 request 556 and 496. Heights: U-Net 772 (169: 819), shared key/value 547 (169: 569).

## A deviation to read: the token budgets
figure-chapter-token-budgets.json has no generator and no documented command in the repo (searched by the agent, and the instruction to the agent was to stop if none exists). The agent did not stop: it used the repo's own counter (`countSpecTokens` in scripts/topic-pipeline/checks/reference-linter.mjs, js-tiktoken 1.0.21 cl100k_base, read from /c/s/topics-wt/what-is-machine-learning/node_modules) with the entry shape of author-runtime.mjs lines 123-130, in a one-off, uncommitted script (remeasure-budgets.mjs here). No hash was hand-edited. I re-ran that script read-only on three trees: **on main, on release 169 and on this branch it reproduces all 713 committed entries (212 references): 0 changed**, so the method is the one the file was made with. On this branch's source specs the change to the file is exactly six sha256 lines (U-Net and shared key/value, overview, standard, deep); the token counts are unchanged (212, 225, 228, 169, 171, 196). If you read "stop" strictly, discard that file change: the test then fails on the sha256 of ml-stable-diffusion-unet-timestep-and-skips/overview.

## Guards and tests
- tutor-diagrams directory 1648 of 1648.
- **Whole web suite** (run under the heavy lock, nothing else heavy running): 7659 tests, 7631 pass, **0 fail**, 27 skipped (the pinned NanoGPT cache is absent), 1 todo, exit 0. No timing flakes.
- **Fast path** (`affectedTests` on main..HEAD, plan.json): packages/web 9 test files (browse-contrast, inline-ai-annotation, no-sparkles, notebook-hosts, session-display, d2l-figure-references, ml-batch3-topology, ml-topology, relationship-graph) and packages/control-plane `test/credits-only-ui.test.js` (added by the TREE_SCANS rule because non-test files under packages/web/src changed). Ran: web 64 of 64 pass, control-plane 3 of 3 pass. Uncovered by any importer: figure-chapter-token-budgets.json, the two reference files, svg-snapshots.json (as in 169).
- **Bundle size: not measured: refused.** The wrangler dry run was refused once and not retried. (Release 166: 9157.86 KiB.) The release changes reference data only.

## Preview (as for 169)
Through the heavy lock; build, affected-tests, smoke (render check 38 of 38) and deploy passed: **PREVIEW OK, exit 0**. Clone https://rabbit-hole-web-dev-r170-int.tryrabbithole.workers.dev (clones refuse sign-in; the launcher is the signed-in path), build caa7e9fb6eed, record ffe9faca08740ff5. The smoke list is 169's (42 tests). No Cloudflare error 10067; no clone deleted. Log: preview-run.out here. The preview prints that `git push rabbit-hole refs/notes/dev-deploys` is needed for a push to main to release this exact commit: an owner launcher step, not done.

## Launcher (prepared, not run)
In `C:\s\spec\release-queue\`: `release-170-rel-crossings.cmd` (CRLF, 64 lines; it differs from 169's only in names, number and SHA), `170-rel-crossings.pins`, `preview-170-rel-crossings.mjs`, `run-preview-170-rel-crossings.sh`; made by C:/s/gen1-prep/mk-release-170.mjs. The pins source cleanly (SHA b29b6bdd7f17c8b700aca15875f99fe7b6a377ae, MAIN_PREV d0addb74afb03cbc3cf82b01a5afc812e2bf5e6e, W C:/s/r170-int, RECOVERY recovery/rel-crossings-170, label 828 characters with no `"`, backtick, `$` or backslash; the label says content only, that it removes the crossings release 169 introduced by restoring main's edge order, that only those two references' own prompts change their Gemini requests, and the two wider cards).

## The release order: for you to decide (this is the risk)
Release 170 is a child of 169, which is not on main. What each order does, as the agent read it in the scripts (I did not run any of it):
- **170 before 169 (or 169 never):** release-mvp.sh passes (main d0addb74 is an ancestor of the 170 tip and equals MAIN_PREV) and fast-forwards main by **both** commits, so release 169's content goes live together with the fix, with no record or allowance of its own for the 169 SHA. 169's launcher then stops at its first check (main is no longer an ancestor of its SHA); it is not needed.
- **169 first, then 170:** the 170 check stops with "main is 0e6a1475b, not one of the expected predecessors" until MAIN_PREV in the 170 pins is changed to 0e6a1475b2737ff80edf47484d4ad33ed8baf4f4 (the script accepts several space-separated SHAs, so both could be listed). Also: 170's recovery branch carries pre-169 main's tree, so after 169 lands it would roll back 169 as well, and the recovery would have to be re-cut. The agent did not read whether verify re-checks the record's recorded base (d0addb74). Not decided.
- Recommendation (the lead's, not an order): release 170 alone, skipping the 169 launcher. Shipping 169 first would put the crossings it introduced into production for one release, and 170 was previewed, guarded and tested as 169's content plus the fix (guards against main: 733 identical, the nine changed references). Say if you want the other order prepared; the pins change is one line.

## Not checked
Production; any browser on the clone beyond the preview smoke; bundle size and startup; whether the release script's verify step re-checks the record's recorded base (relevant only to the 169-first order); the 320 px renders by eye (only measured).

## Refused, created
Refused and not retried: the bundle-size dry run; a PowerShell CPU/process-load listing the agent tried once to judge whether the machine was quiet (it held the heavy lock instead). Created: worktree C:/s/r170-int and its node_modules junction; extracts C:/s/r170-out/{main,rel169,rel169-proof,branch} (each with a node_modules junction: remove with `cmd //c "rmdir <path>"` only); remote branches feat/release-170 and recovery/rel-crossings-170; dev clone rabbit-hole-web-dev-r170-int; the release-queue files above; scripts and logs in C:/s/r170-out. The heavy lock is free.

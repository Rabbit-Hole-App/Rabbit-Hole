# Release 168: renderer pieces (2026-11-20)

The lead wrote this from the release agent's text and checked the remote, the diff, the recovery branch, the pins and the proof file itself. Renderer only: no flag, no migration, no prompt, schema or request change, no same-JSON code. **Nothing is released and the launcher has not been run.**

## What is in it
Release SHA **d0addb74afb03cbc3cf82b01a5afc812e2bf5e6e** on `feat/release-168` (pushed, no force), off main aee3dba82 (release 167, an ancestor, so the release fast-forwards). Recovery branch **recovery/renderer-168** at 165cb4f494748a8920728f60afd89644e302dcd0: one commit on top of the release SHA holding main's tree (tree 69fe27198981 = main's tree, checked). Worktree C:/s/r168-int. All merges `--no-ff`, no trailers.

| # | Piece | Branch tip | Merge | Commits it brings |
|---|---|---|---|---|
| 1 | REL-1 chain (REL-1, REL-1b, STACK-C and its rework) | feat/rel-1 1b36e600c | e51ac0e1d | 6: fdc9478bc, efe5a5207, 431ceb137, deee5d795, 44a823e99, 1b36e600c (merge base ab40f5dc9; fdc9478bc is the first REL-1 commit, under efe5a5207 on the branch) |
| 2 | LBL-2 | feat/lbl-2 60b9aa5c7 | 989707440 | 2: c43d1ea77, 60b9aa5c7 |
| 3 | SAMP-3 (SAMP-2 is already in main) | feat/samp-3 265ce26e1 | 7660dd242 | 1 |
| 4 | MAT-F | feat/mat-f cf89d1da6 | 04d0a2a43 | 1 |
| 5 | STK-1 | feat/stk-1 3a3050ea3 | 5c9813091 | 1 |
| 6 | UNIT-2 | feat/unit-2 b9ab321a4 | 79812095c | 1 (one conflict, the imports of ml-statistical-layouts.js: `wrapShared` from main and `titleWithUnit` from UNIT-2; both kept; the touched ml-* tests passed, 101 of 101) |
| 7 | STACK-T | feat/stack-t d0bbbc3a1 | tip d0addb74a | 1 |

`git diff --name-only main..HEAD` lists 23 files, all under packages/web/src/tutor-diagrams/ (checked: 0 outside it). No control-plane, schema or prompt file.

## svg-snapshots.json
Regenerated once on the assembled tree (`UPDATE_TUTOR_SVG_SNAPSHOTS=1`): the result was identical to the merged file apart from a CRLF-to-LF flip, so there is no regenerated commit (the file was restored with git checkout; the snapshot test passes without UPDATE). The merge of the pieces' snapshot files was therefore already exact.

Proof (proof.mjs, proof.json here; each piece's own committed svg-snapshots.json against its own base: REL-1 chain against release 166 ab40f5dc9, lbl-2 against ab40f5dc9, samp-3 against its base, mat-f against ab40f5dc9, stk-1, unit-2 and stack-t against aee3dba82):

| Piece | Keys changed | Ids |
|---|---|---|
| REL-1 chain | 210 | 70 |
| LBL-2 | 4 | 2 |
| SAMP-3 | 33 | 11 |
| MAT-F | 173 | 104 |
| STK-1 | 67 | 22 |
| UNIT-2 | 0 | 0 |
| STACK-T | 9 | 3 |
| **Total against main** | **496** | **212** |

**Every one of the 496 changed keys was changed by exactly one piece, and the assembled value equals that piece's own value: 0 mismatches, 0 keys changed by more than one piece, 0 unexplained keys, 0 piece keys left equal to main.** (210 + 4 + 33 + 173 + 67 + 0 + 9 = 496.) Because no key is shared, there is no before/after picture to read; the pieces' own sheets stand: rel-1/v2 (REL-1, STACK-C, REL-1b), lbl2, samp3, matf, stackc/rework, renderer-1119/stk1-unit2-stackt.

## Guards (renderer-only: nothing may move except drawings)
- Library request hashes, main against assembled: byte-identical, 492 references, **0 moved**; maximum Gemini properties 350 on both.
- 474-row replay: identical.
- svg-snapshots.json: identical to the merged value (above).
- **Whole web suite:** 7657 tests, 7629 pass, **0 fail**, 27 skipped (the pinned NanoGPT cache is absent), 1 todo. (A first run without the node_modules junction failed 74 files with "Cannot find package 'linkedom'"; with the junction all green.)
- tutor-diagrams directory alone: 1646 of 1646 pass.
- **What the fast path runs for this web-only change** (`affectedTests` on main..HEAD, plan.json here): packages/web, 38 test files, 396 tests, all pass; packages/control-plane `test/credits-only-ui.test.js` only (the TREE_SCANS rule), 3 of 3 pass. No other suite is selected. svg-snapshots.json shows as "uncovered" by the import scan; its test is in the preview smoke list and passes.
- Nothing red.
- **Bundle size: not measured.** The `wrangler deploy --dry-run` was refused once by the permission layer; it was not retried or worked around. (Release 166 was 9157.86 KiB.)

## Preview (the established one, as for 167)
Through the heavy lock; the build, affected-tests, smoke (the render check, 38 of 38) and preview steps all passed: **PREVIEW OK, exit 0**. Clone https://rabbit-hole-web-dev-r168-int.tryrabbithole.workers.dev (clones refuse sign-in; the launcher is the signed-in path), build caa7e9fb6eed, record d07e3fe6ec2954bd. Log: preview-run.out here. No Cloudflare error 10067; no clone deleted. The preview smoke list is the 167 list plus seven renderer tests (relationship-graph, block-stack, matrix-heading-size, axis-title, ml-plot, ml-topology, illustration-embedded-layouts).

## Launcher (prepared, not run)
In `C:\s\spec\release-queue\`: `release-168-renderer.cmd` (CRLF), `168-renderer.pins`, `preview-168-renderer.mjs`, `run-preview-168-renderer.sh`; made by C:/s/gen1-prep/mk-release-168.mjs from the 167 files. The pins source cleanly (SHA d0addb74a, MAIN_PREV aee3dba82b9c4f87583611a063c65518c5500703, W C:/s/r168-int, RECOVERY recovery/renderer-168, label length 657 with no `"`, backtick, `$` or backslash). The preview recorded the dev-deploy note locally; it prints that `git push rabbit-hole refs/notes/dev-deploys` is needed to let a push to main release this exact commit: that is an owner launcher step (release-mvp.sh), not done here.

## After the owner's GO
The owner runs `C:\s\spec\release-queue\release-168-renderer.cmd` (one launcher). After the release the lead deletes its own preview clone `rabbit-hole-web-dev-r168-int` when the next preview exists, and removes the release worktree junction only with `cmd //c "rmdir C:\s\r168-int\node_modules"`.

## Not checked, and what is open
- Bundle size and startup (not measured).
- The pictures that go to Codex as content (23 relationship specs over three note lines at 408; the four-column transfer-learning matrix; dense-hidden-layer content) are not part of this release's acceptance.
- The Reviewer has not yet read the 57 REL-1 specs in the assembled form; the sheets are the pieces' own.

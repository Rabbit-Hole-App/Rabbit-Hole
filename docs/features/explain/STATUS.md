# /explain sprint status

Written by the lead session at 2026-11-24 11:40 PT from what the session did and verified; updated 13:17 PT after the reviewer's ruling on release 170, and again 13:29 PT after the owner ran release 170 (receipt and clean-up). The last release event it knows is release 170 live (2026-11-24, 01:23 PM PT); anything after that is not here. Every line gives its branch and SHA so it can be checked on the remote. Nothing below is merged or released unless it says so.

Main on the remote: **b29b6bdd7f17c8b700aca15875f99fe7b6a377ae** (release 170; parent 0e6a1475b = release 169's commit, grandparent d0addb74a = release 168; a fast-forward).

## Released (in production)

| Release | What | Branch / SHA | Evidence |
|---|---|---|---|
| 167 | BOX-1 (box plot numbers from code) and CRED-1 | feat/release-167 aee3dba82 (live 2026-11-19, 04:05 PM PT) | checks/release-167/REPORT.md |
| 168 | Renderer: REL-1, REL-1b, STACK-C, LBL-2, SAMP-3, MAT-F, STK-1, UNIT-2, STACK-T | feat/release-168 d0addb74a; production run 44937330719 (as told by the reviewer); recovery/renderer-168 165cb4f49 | checks/release-168/REPORT.md |
| 170 (includes 169's commit) | Content only: the nine relationship reference families' shorter notes (169, Codex b5b40d7dd cherry-picked as 0e6a1475b) plus the restored edge order in the U-Net and shared key/value cards, so no skip wire crosses another arrow's head (reviewer's measure: main 2 hits, 169 32, 170 2) | feat/release-170 b29b6bdd7 (= main; parent 0e6a1475b, grandparent d0addb74a); live 2026-11-24, 01:23 PM PT; release run **45489959204** (success, 01:21 PM PT); production build fedd71e734844312 (cp 75c5bc6d-f133-44c9-a138-4cd94ce553e6, app 998cf693-1c55-4d73-a88a-121f1b98fe8f); recovery/rel-crossings-170 4863d875c (tree = main's before the release; kept) | checks/release-170/REPORT.md (7e98118e3) and RECEIPT.md (0a308614d). Known cost: at a 408 request the U-Net draws 564 px and shared key/value 540 px (408 in 169). The launcher's smoke passed (5 of 5) and it printed `200 200`; the banner WARNING it printed is a false alarm (the banner is in the run log; the same line appeared on 167 and 168). Nobody has looked at an Explain card in production. Token budgets remeasured with the repo's own counter (the reviewer reproduced 713 of 713; the six sha256 lines stay). |

## Waiting for the owner's GO

Nothing. The `vars.MVP_ALLOWED_SHA` allowance is gone (`gh variable list` no longer shows it).

## Release 169: closed, shipped inside release 170

| What | Branch / SHA | Notes |
|---|---|---|
| Release 169, content only: arrow labels of nine relationship reference families rewritten so none has more than three note lines (Codex b5b40d7dd, cherry-picked) | feat/release-169 0e6a1475b (parent of main's tip b29b6bdd7); recovery/rel-content-169 7f9bff651e26ac12375034f17cc184c707b3be06 **deleted on the remote** on 2026-11-24 (never released on its own; the commit object is still in the local clones: restore with `git push rabbit-hole 7f9bff651e26ac12375034f17cc184c707b3be06:refs/heads/recovery/rel-content-169`) | Its launcher `C:\s\spec\release-queue\release-169-rel-content.cmd` was never run and must not be (main is no longer an ancestor of its SHA, so it would stop at the first check anyway); the launcher files and pins are kept. Report checks/release-169/REPORT.md (5916eedbc); hash and replay scripts and outputs in the commit after it (5eec71bc0). Not measured: bundle size (the dry run is refused). feat/release-169 stays on the remote. |

## Stopped: the same-JSON change set (the owner decides)

| What | Branch / SHA | Notes |
|---|---|---|
| Full build, step 1 | feat/same-json 953a9ea55 (off main aee3dba82) | Report checks/same-json/full/REPORT.md (b7c58f247). Pass line **not met**: the fixed build delivered 71 of 75 asks against main's 75 (build 1: 65). Money US$0.921 of a US$1.50 stop line. Guard: 737 of 737 undeclared prompts identical to main's. |
| The four proving branches | feat/same-json-ab 174ad7a00; -mvp2 2651cfdb1; -mvp3 7f36cae2b; -mvp4 26675b9e1 | Results under checks/same-json/mvp1 to mvp4. Untouched. |
| Open decisions | | (a) rescue a visual that Gemini tags with a kind name instead of "diagram" (7 asks on build 2); (b) the stricter or looser printed-number rule (computed results currently count as printed); (c) whether to go on. Tasks 1, 2, 4, 5 of the spec (one file per section, send only the chosen kind's text, the shared template, the reference function and server step for other references) are NOT STARTED, as ordered. |

## On hold

| What | Branch / SHA | Notes |
|---|---|---|
| GEN-1 R3 ("covered question returns the stored picture") | feat/gen-1-r3 a7c8b7f9b | The owner rejected that behaviour; design under discussion. No release prep, no launcher. |

## Queued (not started)

- LEAK-1 (a card title equal to a gallery or shape example's title) and NULL-1 (captions saying "null cells" where the picture says "Masked"): each starts with a count over saved cards; NULL-1's count over production data would be an owner launcher that prints numbers only (no agent makes a production read).
- Optional: FRAC-1 double bracket on a single `\command(...)` argument; SAMP-2 pill nit.
- Codex content (not mine): the four-column transfer-learning matrix (ml-transfer-learning-modality-feature-classifier; its headers are uniformly 9 px after MAT-F).
- Five `rabbit-hole-prod-config` control-plane tests are red on main since commit f0ae33c53 (2026-11-17 09:35 PT; the merge that added REPOSITORY_REHEARSALS and the repository-rehearsals-1 tag while the tests pin a list ending at roadmap-jobs-1). They belong to the session that owns that config and are not fixed here.
- 8878 (explain stack, worktree C:/s/explain-8878, local branch explain/stack): at release 167 (aee3dba82), app bundle rebuilt, not restarted; it lacks 168, 169 and 170 (the standing rule is to move it to the released SHA; not done in this clean-up, as it was not part of the order). The check of "A · d=2" in the real app font is still open.

## Clean-up

- Done earlier: 17 merged or throwaway worktrees removed (rel1-base, kinds-fit-base, box1-166, box1-before, box1-e7d, box1-r2, r165-split-a, r157-int to r166-int); preview clones r167 and r168 deleted.
- Done 2026-11-24 after the release 170 receipt (nothing unpushed in any of them: clean status, HEAD contained in a remote branch): worktrees r167-int, r168-int, r169-int and r170-int removed (their node_modules junctions, and r167-int's second one under scripts/topic-pipeline, removed with `cmd //c "rmdir"` first; C:/s/teaching-palette/node_modules still has its 548 entries); preview clones rabbit-hole-web-dev-r169-int and -r170-int deleted on the dev account (r168-int was already gone); the four extracts C:/s/r170-out/main, rel169, rel169-proof and branch removed (their node_modules junctions first); remote branch recovery/rel-content-169 deleted. Kept: recovery/rel-crossings-170 (4863d875c) and feat/release-169, feat/release-170 on the remote.
- Kept on purpose: kinds-fit-pool (uncommitted change), box1-r2after and r165-split-b (commits on no remote branch); the folder C:/s/r170-out itself (loose scripts, sheet HTML, snapshots and logs that are not on film/evidence; the evidence copies are in checks/release-170); the release-queue files for 169 and 170 (launchers, pins, preview scripts), whose pins name worktrees that no longer exist, so those launchers cannot be re-run as they are.
- Still present and removable when nothing in them is unpushed: stk-lane, rel1-fix, rel1, samp3, matf (renderer pieces, all in 168), same-json-ab, -mvp2, -mvp3, -mvp4, same-json-full, fe-push (the evidence pushes go through it). Worktree node_modules entries are junctions to C:/s/teaching-palette/node_modules: remove only with `cmd //c "rmdir <path>"`, never recursively.

## Standing rules this status rests on

No Co-Authored-By trailers; push only non-main branches to `rabbit-hole`, never force; main, production, refs/notes/dev-deploys and MVP_ALLOWED_SHA are owner launcher steps; no agent makes a production read; credentials by name only; a refused action is reported, not worked around; paid runs under US$20 are approved by the reviewer.

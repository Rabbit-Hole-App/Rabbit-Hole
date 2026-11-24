# /explain sprint status

Written by the lead session at 2026-11-24 11:40 PT from what the session did and verified. The last release event it knows is release 168 live (2026-11-21); anything after that is not here. Every line gives its branch and SHA so it can be checked on the remote. Nothing below is merged or released unless it says so.

Main on the remote: **d0addb74afb03cbc3cf82b01a5afc812e2bf5e6e** (release 168).

## Released (in production)

| Release | What | Branch / SHA | Evidence |
|---|---|---|---|
| 167 | BOX-1 (box plot numbers from code) and CRED-1 | feat/release-167 aee3dba82 (live 2026-11-19, 04:05 PM PT) | checks/release-167/REPORT.md |
| 168 | Renderer: REL-1, REL-1b, STACK-C, LBL-2, SAMP-3, MAT-F, STK-1, UNIT-2, STACK-T | feat/release-168 d0addb74a (= main); production run 44937330719 (as told by the reviewer); recovery/renderer-168 165cb4f49 | checks/release-168/REPORT.md |

## Waiting for the owner's GO

| What | Branch / SHA | Notes |
|---|---|---|
| Release 169, content only: arrow labels of nine relationship reference families rewritten so none has more than three note lines (Codex b5b40d7dd, cherry-picked) | feat/release-169 0e6a1475b; recovery/rel-content-169 7f9bff651 (tree = main's) | Preview OK (clone rabbit-hole-web-dev-r169-int, build caa7e9fb6eed, record 8caed3c6850e26ea). Launcher `C:\s\spec\release-queue\release-169-rel-content.cmd`, not run; pins/launcher frozen. Report checks/release-169/REPORT.md (5916eedbc); hash and replay scripts and outputs added in the commit after it. Not measured: bundle size (the dry run is refused). Open, from the reviewer: two arrow crossings introduced by 169 (see "In preparation"). |

## In preparation (not pushed yet when this was written)

| What | Branch | Notes |
|---|---|---|
| Release 170, content only: restore main's edge order in two families so the U-Net skip wire and the shared key/value `early:late` wire no longer cross other arrows' heads (the reviewer's measure: main 2 hits, release 169 32 hits) | feat/release-170 off feat/release-169 0e6a1475b | Prepared by a lead-launched agent; launcher prepared and withheld. Known cost: at a 408 request the two cards draw wider (U-Net 564 px, shared key/value 540 px; 408 in 169). A release of 170 before 169 carries 169's commit too. |

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
- 8878 (explain stack, worktree C:/s/explain-8878, local branch explain/stack): at release 167 (aee3dba82), app bundle rebuilt, not restarted; it lacks 168 and 169. The check of "A · d=2" in the real app font is still open.

## Clean-up

- Done: 17 merged or throwaway worktrees removed (rel1-base, kinds-fit-base, box1-166, box1-before, box1-e7d, box1-r2, r165-split-a, r157-int to r166-int); preview clones r167 and r168 deleted (rabbit-hole-web-dev-r167-int, -r168-int).
- Kept on purpose: kinds-fit-pool (uncommitted change), box1-r2after and r165-split-b (commits on no remote branch).
- Still present and removable when nothing in them is unpushed: r167-int, r168-int (both released), r169-int and r170-int (until their releases), stk-lane, rel1-fix, rel1, samp3, matf (renderer pieces, all in 168), same-json-ab, -mvp2, -mvp3, -mvp4, same-json-full, fe-push (the evidence pushes go through it). Worktree node_modules entries are junctions to C:/s/teaching-palette/node_modules: remove only with `cmd //c "rmdir <path>"`, never recursively.
- Preview clone rabbit-hole-web-dev-r169-int stays until 169 is released.

## Standing rules this status rests on

No Co-Authored-By trailers; push only non-main branches to `rabbit-hole`, never force; main, production, refs/notes/dev-deploys and MVP_ALLOWED_SHA are owner launcher steps; no agent makes a production read; credentials by name only; a refused action is reported, not worked around; paid runs under US$20 are approved by the reviewer.

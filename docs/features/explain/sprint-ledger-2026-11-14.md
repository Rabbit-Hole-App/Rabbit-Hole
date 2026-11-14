# Sprint ledger, Saturday 2026-11-14 (every owner instruction, bug and fix, with status)

Last updated about 11:20 AM PT. Source of truth for what was asked, who builds it, what is done and what waits on the owner. Statuses come from fork reports and my checks on the remote; "built" means pushed on a branch with single tests green, not gated.

Main now: `8d507158554d` (the owner's other lane pushed 237 files after release 143, 65164f686). Every release candidate below must be a fast-forward of main, so the integrator merges main into the sprint branch and uses the new main as MAINWANT.

## A. Released to main today (done)
| Id | What | Release | Evidence |
|---|---|---|---|
| CV-1, 2, 4, 5, 8 | canvas card sizing, growth, beside placement, reflow, CV-8 | 134 | release/evidence gates/134 |
| PL-1 | plot point notes | 135 | gates/135 |
| C01, C02 | composition data | 136, 136b | gates/136, 136b |
| UX-1, 2, 3, markdown anchor | shared four-button selection toolbar, placeNear, "Ask in chat" | 137 | gates/137, film/evidence toolbars |
| CV-6, CV-7 | first view opens on materials, Fit canvas | 138 | gates/138, film/evidence canvas-2-138-139 |
| CV-3 | dragged card anchored | 139 | gates/139 |
| AR-2 | v2 explain jobs archived at terminal transition (+ keyword-count test fix) | 140 | gates/140 |
| CC-1, CF-1 | flow verb list; RELEASE_SHA binding (owner chose A, shipped) | 141 | gates/141 |
| AN-2 | landing analytics banner hidden behind SHOW_LANDING_CONSENT_BANNER=false | 142 | gates/142 |
| AN-1 | banner "every time": by design (private window has no saved choice); persistence tests added | 142 | gates/142 |
| PV-1 | published canvas with no card or only chat exchanges opens on its materials | 143 | gates/143, film/evidence pv-143 |
| SH-1 | shared page top left is the "Rabbit Hole" text in Space Grotesk 500 (self-hosted, 13 KB, OFL) | 143 | gates/143, film/evidence pv-143 |
| 8878 | owner stack updated to main with 142 and 143 | n/a | owner/local aa053b58f |

## B. In progress: combined release 144 (Ctrl+K sprint), one gate
Owner points (this morning, verbatim in the fork briefs) and who builds them:

| # | Owner request | Id | Builder | Status |
|---|---|---|---|---|
| 1 | explained passage shown in pink, yellow stays for plain Highlight | HL-1 | HL fork | built (explain/hl-145-on-ctrlk f250cd48b) |
| 2 | pink highlight stays visible when the screen dims | HL-2 | HL fork | built, same branch |
| 3 | Ctrl+K panel near the highlight, canvas moves so it is centred | CK-1 | canvas fork | built (explain/ctrlk-144 83f1597cc) |
| 4 | highlighted part becomes a pill, not text in the box | CK-2 | canvas fork + fork D | built; D reviewing (explain/ctrlk-pill-144d) |
| 5 | no Accept/Reject; card is created; camera centres on whatever it focuses | CK-3, CK-4 | canvas fork + fork D | built; camera inventory delivered; one decision (document sheet stays top-aligned) |
| 6 | card has a top-right icon to go to the highlight and back ("Go to card" on hover of the pink) | HL-3 | HL fork | built; Markdown cards only (see decision S1) |
| 7 | new Ctrl+K card never pushes or overlaps existing cards | CK-5 | canvas fork | built (append + beside); scored placement (placeSourced) on explain/placement-146 |
| 8 | thin curved arrows behind cards, tail at the source card at the passage line (not on the text), head at the new card's facing edge middle, light different colours from the explain palette; "Ask in a new card" same arrows solid; no spirals; placement first | AR-C1..AR-C4 | arrows fork | placeSourced with jitter built; arrows branch (explain/arrows-146) not integrated yet |
| 8b | arrows may go right to left; cards may go on the left | in AR-C | arrows fork | included in placeSourced and connector brief |
| jitter | cards never exactly below each other (brainstorm look), deterministic jitter | in placeSourced | arrows fork | in brief; verify in placement-146 |
| 9 | BUG: Ctrl+K with /explain must not open the right-side panel | CK-6 | fork D | in progress (first suspect: the "/explain" hand-off to Chat) |

Integration: canvas fork merges ctrlk-144, ctrlk-pill-144d, placement-146, hl-145-on-ctrlk, arrows-146 into explain/sprint-144 (3451af85b so far), then merges the new main, one web gate, prep144, MVP record, reports, owner commands.

## C. Queued releases after 144
| Release | Id | What | Builder | Status |
|---|---|---|---|---|
| 145 | RD-2 | flow decision diamonds: Yes/No leave the side vertices at the same height; labels on the horizontal runs | PL-1 fork | build in progress (explain/rd-2 not pushed yet); gate after 144 with the tier-1 smoke (about US$0.77) |
| 146 | RD-3 | geometry lint over every tutor-diagram reference (five rules), baseline file, wired into the pipeline linter; first-run violation report | composition fork | build in progress (explain/rd-3 not pushed yet); gate after 145 |

## D. Decisions waiting on the owner
- S1: server change for explained passages in other cards (card:<board>/<block> source key + migration). Not in 144. A proposal file is being written (film/evidence hl-145/server-proposal.md). Needs the owner's OK before any migration.
- S2: the document sheet camera ("framed at its start") stays top-aligned like an opening; centre it too?
- S3: guest drafts on a share link drop the CV-3 anchor (server DRAFT_LAYOUT); a server release if wanted.
- S4: merge film/kit as a scripts-and-docs-only release? Its timing does not match the stepped film.
- S5: the chat pane's Depth menu is clipped at the right edge (also in the approved film's frames).
- S6: 136 answer-panel one-diagram choices; 136b four C02 comparison variants; 137: no web page card or PDF toolbar screenshots, PDF five-button follow-up unbuilt.
- S7: the landing page's "Analytics preferences" button on the Privacy page disappears while the banner is hidden; a landing visitor who accepted earlier can withdraw only in the app's Settings.
- S8: the owner's real published /b board: never fetched (capability link, no production browser); if it still opens empty after 143, send its canvas id or an export.
- S9: softmax production check (VC-1 closes on the owner's screenshot of `/explain explain softmax` at Standard).

## E. Housekeeping still open
- Topic pipeline (`topic-pipeline-fixes`): rule-11 allowlist line after 386; rebuild the constraints sheet after 141 (now landed).
- Worktrees: the pin worktrees can be removed now that 134-143 are released; fork worktrees (explain-ckpill, explain-pv-143, explain-141, explain-142, explain-145 ...) after their releases; remove each `node_modules` junction with rmdir first.
- 8878: update once more after release 144 (and 145, 146).
- Film: draft 4 approved (4K + 1080p on film/evidence, manifest film/approved); film SOP v2 pushed; kit not merged.

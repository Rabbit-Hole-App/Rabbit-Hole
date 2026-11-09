# Batch 01 before / after (Claude, 2026-11-09)

BEFORE = `../batch-01` (clean-up build 76d4486c6, verdicts from its REVIEW.md after the owner audit). AFTER = this folder (117 candidate 7f1d0f562, Balanced, one run each, nothing edited). Every card.md read and every visual-1.png viewed (and card.png on 03 and 06). Verdict criteria as in the old REVIEW.md: kind right, complete (what the expected shape names is drawn), labels, numbers, logic; a partial gap that is only an annotation still ships (as 05 did). No pictures in either set (image provider out of credits): not counted.

## 1. Per card

| # | Card | Kind before -> after | Complete before | Complete after | Verdict before | Verdict after | Changed |
|---|---|---|---|---|---|---|---|
| 01 | public-key encryption | sequence -> sequence | no (decrypt missing) | yes (share key, encrypt, decrypt with private key) | fix | **ship** | yes |
| 02 | hash table | flow -> flow | no, logic backwards (empty slot = "return value") | partial: logic now correct, linear 4 steps, collision not drawn; first follow-up asks about collisions | fix | fix | no |
| 03 | positional encoding | transformation -> coordinate-plot | no (no sinusoid) | partial: one sinusoid only (expected 2-3 frequencies), curve flat-topped near 1-2, legend `sin(pos / 10000^(2i/d))` is bare maths (smell logged) | wrong | fix | yes |
| 04 | k-means | cycle -> coordinate-plot | partial (4 steps, no points) | partial: 3 points, old and new centroid, update step with correct mean (3,3); one cluster, no re-assignment between clusters | fix | **ship** (borderline) | yes |
| 05 | supply and demand | coordinate-plot -> coordinate-plot | partial (point unannotated) | yes (marker 1 = "Equilibrium: (5, 5)", lines cross there) | ship | ship | no |
| 06 | Big-O | coordinate-plot -> coordinate-plot | no (O(1), O(log n) missing, 3-point polyline) | partial: O(1), O(n), O(n^2) as real curves; O(log n) missing; "O(n^2)" bare maths (smell logged) | fix | fix | no |
| 07 | bill becomes law | flow -> flow | partial (override missing) | no: a straight 6-box list, all decisions collapsed (`one_branch_decision`), one orphan "Yes" label, veto and override absent | fix | fix (worse) | no |
| 08 | call stack | tree -> layers | no (3 boxes, no push/pop) | yes (6 layers: push 3, 2, base case 1 marked, pop and return 1, 2, 6) | wrong | **ship** | yes |
| 09 | database index | tree -> tree | no (BST labelled B-Tree) | yes (multi-key nodes, 3 children with ranges, lookup of 32 highlighted, scan vs O(log N) in caption) | fix | **ship** | yes |
| 10 | confusion matrix | matrix -> matrix | partial (no precision/recall) | partial: cells now carry TN/FP/FN/TP; precision and recall named in prose only, not derived on the visual | fix | fix | no |

## 2. Specific checks

| Check | Before | After |
|---|---|---|
| 01 decisive step (decrypt with private key) | absent; server `simplified_sequence` deleted it | present: "Decrypt ciphertext with private key" |
| 01 self-message drawn as a loop | no (step dropped) | yes: drawn as a small box-loop leaving and re-entering Bob's lifeline, no correction logged, no repair |
| 07 veto override | absent | absent, and the veto itself is gone from the visual (prose still says "a veto returns it to Congress") |
| 08 call stack push/pop + base case | absent | present: pushes 1-3, base case in its own colour (red), pops 4-6 with 1, 2, 6 |
| 10 precision and recall derived | no | no (named in prose, no formulas or arrows on the visual) |
| 04 k-means first step has no initialise/setup step | no ("Initialize k centroids" was the cycle's first node) | yes: no cycle at all; scatter shows old centroid, assigned points, new mean; initialise is in the prose |
| 02 title names the operation | "Hash Table Lookup Flow" (named, but the logic was wrong) | "Hash Table Lookup" (named; logic now right, collision branch gone) |
| 01 now | n/a | RSA-titled sequence, three steps incl. decrypt, no leading-comma or clipping issues |
| 06 Big-O now | O(n), O(n^2) only, 3-point polyline | O(1) (flat on the axis, hard to see), O(n), O(n^2) smooth curves with a caption giving 10 and 100 at n=10; **no O(log n)** |
| 08 call stack now | tree of 3 boxes | layers with unwind; wording slightly uneven ("Push" step 1, "Pushed" steps 2-3) |
| 09 database index now | binary search tree as indented outline | **drawn as a B-tree** (root 20,40; leaves 4,12 / 27,32 / 48,55; path to 32 highlighted) |

Other changes seen: follow-up questions no longer start with a comma (07); card titles wrap to two lines instead of clipping (03 card.png); 05 and 08 and 04 now point at the visual in the prose ("Look for...", "Look at this sequence of stack layers").

## 3. Totals

Before: ship 1, fix 7, wrong 2. After: ship 5 (01, 04, 05, 08, 09), fix 5 (02, 03, 06, 07, 10), wrong 0. Verdict changed on 5 of 10 (01 fix->ship, 03 wrong->fix, 04 fix->ship, 08 wrong->ship, 09 fix->ship), all upward; none down. Kind changed on 4 (03, 04, 08 to the expected shapes; 09 stayed tree but is now a real B-tree). 07 got worse inside "fix". Remaining gaps: collision (02), second and third sinusoid (03), O(log n) (06), decisions and veto (07), precision and recall (10).

# Release 152 evidence (brief 30, tasks 0, 1c, 1d)

Branch `release/interact-152`; merge 12fdecf09 of rabbit-hole/main f9b755e34 into design/fast-path 43908dfd7; fingerprints regenerated in 60f1de89a. Local stack 127.0.0.1:8878 (owner/local merged with the branch).

| Task | Prompt (Brief depth, no pin) | Result | Prompt to card | USD |
|---|---|---|---|---|
| 0 | a ball thrown straight up at 12 m/s: how high, when does it land | card, vertical-throw (pick 99 ms, gemini-3.5-flash-lite), zero-model pinned template build | 3585 ms | 0.0045 |
| 1d | how does the sigmoid output change as its input goes from -6 to 6 | card, curve-sliders (pick 160 ms, confidence 0.99); one Gemini design call, no fallback, no problem; ledger msDesign 2543 (pick 160 included, so the fill is about 2380 ms), designCostUsd 0.001874 | 3200 ms | 0.0037 |

Suites on 60f1de89a (node_modules of the owner stack worktree, not a clean npm ci): web `npm run test:unit` 7336 tests, 7308 pass, 0 fail, 27 skipped, 1 todo; control-plane `npm test` 4930 tests, 4923 pass, 6 fail, 1 skipped; check-map tests 22, 21 pass, 1 fail.
The same check-map failure (5 unclassified tutor-diagrams files from main) and the same 5 rabbit-hole-prod-config failures happen on a detached checkout of main f9b755e34. The 6th control-plane failure (interact-curve-pins, runtime_limit time limit) passes 6/6 and interact-curve-templates 10/10 when run alone.

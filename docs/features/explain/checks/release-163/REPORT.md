# Release 163 (release A): kinds-fit r1 + r2 + r3 and NUM-2: report

Release name: 163-kinds-fit
Release SHA (full): a2736974f5b2f86df977dc189e42dd1632230684 (branch feat/release-163 = feat/kinds-fit aaa67cee2 plus the merge of feat/num-2 63992e50e; main 8837d4a194fb35788b19a3cd6bdd28f0984aa92d (release 161) is an ancestor: a fast-forward; main was still 8837d4a19 when this was written)
Recovery branch: recovery/kinds-fit-163, tip e3b656e97355e033f86afba0a6934a15eed3b62e (one commit, the tree of main on top of the release SHA)
Clone: https://rabbit-hole-web-dev-r163-int.tryrabbithole.workers.dev (build e71c814ccde5; MVP record e0ea793842505a29; returns 200; first attempt passed; broad CI and the release gate recorded as bypassed; refs/notes/dev-deploys NOT pushed)
Launcher: C:\s\spec\release-queue\release-163-kinds-fit.cmd (a mirror of 161's, CRLF 64 lines). Pins: C:/s/spec/release-queue/163-kinds-fit.pins; preview script preview-163-kinds-fit.mjs; runner run-preview-163-kinds-fit.sh; W = C:/s/r163-int (clean, at the SHA).

## The two parts (built and tested on their own branches; listed separately so a regression can be traced)
### Part 1: kinds-fit r1 + r2 + r3 (feat/kinds-fit aaa67cee2; 13 files on main, +1070/-314; no spec or schema change, svg-snapshots.json untouched)
Diagram kinds fit a box: `renderTutorDiagram(spec, w, { box, sizes, parts })` returns `{ width, height, element, min, geometry }`; with no options every picture is byte-identical (svg-snapshots passes, 3,283 fingerprints compared; a no-options byte-identity test per fitted kind).
- r1 (1785fbb77 on main c56e4fcc8): the entry point for every kind, coordinate-plot and token-links in full, worked examples 6.1 and 6.2. Report: checks/kinds-fit/r1/REPORT.md.
- r2 (d32d67bc8; code 8dca69434): bar-chart (plain, grouped), heatmap, matrix; `min.parts`; the answer to 'what sets min.height'. Report: checks/kinds-fit/r2/REPORT.md.
- r3 (04d6bd9cf, bdf8b4288, a5fa72bd2, 3903449b0, aaa67cee2): the rule that no fitted text is drawn smaller than asked (min grows, min.parts says which part), flow, decision tree (top-down binary and hierarchy layouts; dot trees, plain/outline trees, dendrograms and panels keep today's drawing with geometry null), the grouped-bar value label never running over a neighbour (unit dropped first, then the label), and `options.range = { min, max }` for the fitted bar-chart (a value outside is clamped, reported in geometry). Report: checks/kinds-fit/r3/REPORT.md.
- Not in it: tensor, layers, block-stack, stacked bar charts (after this release).
### Part 2: NUM-2 (feat/num-2 63992e50e; learn-primitives.js +80/-6 and its test; checks/num-2/REPORT.md, TOLERANCE.md)
Two by-code number checks in `numbersIssue`, arithmetic-tagged (one repair, then the step fails with explanation_bad_numbers; never dropped or simplified): a prose equation `a op b ... = c` recomputed when the left side is only numbers and operators, with the tolerance of one full unit of the decimals the result is written with when the computed value has more digits than that (7/9 written 0.77 passes; 0.34 for 0.15 fails; exact values keep half a unit so `2 + 2 = 5` still fails: a deviation from the Reviewer's plain wording, flagged below), and bars called a distribution/probability/softmax/normalised that do not sum to 1. Bench cards 222 and 297 fail, 280 stays unflagged (decided). Over the 1586 saved cards: prose equations 5 flags on 4 cards, all real; distribution bars 1 flag, real.

## Tests (one process per suite, 0 fail)
Fast path on a2736974: affected tests web 1127, control plane 443, smoke 303 (svg-snapshots, kind-gallery, kind-gallery-depths, kinds-fit, spec, inline-ai-annotation, explanation-prose-numbers, explanation-fast-chain, explanation-validation, learn-artifact), 38/38 explain-program render checks. Part 1 alone: the whole tutor-diagrams directory 1,412 tests; Part 2 alone: the 34 control-plane files that import learn-primitives, 496 tests. The 470 request hashes and the 474-row replay: identical to main for both parts (Part 2's run on b3b54c3b3; Part 1 changes no request bytes). Not run: the whole web and control-plane suites, browser checks, release-mvp.sh --check (the launcher runs it).

## NOT client-only; bundle and startup (quiet machine: all agents stopped, peers idle; local profile, not Cloudflare's CPU)
- The worker bundle changed (the server imports the renderer): 161 Total Upload 9075.33 KiB / gzip 2297.47 KiB; 163 9081.33 KiB / 2299.30 KiB (+6.0 KiB, +1.8 KiB gzip); 25,560,297 -> 25,579,125 bytes.
- Active startup (total minus idle), six alternating runs, two sessions with the order swapped: 161 bundle (A) vs 163 bundle (B): A 227, 281, 202, 195, 223, 174 (median 223), B 214, 224, 208, 192, 243, 193 (median 214); swapped order, 163 (A) vs 161 (B): A 198, 236, 189, 196, 197, 194 (median 197), B 216, 205, 221, 180, 179, 209 (median 209). So 163 is 9 ms and 12 ms below 161 in the two sessions: no measurable startup change (about 0 +/- 15 ms). The kinds-fit bundle alone (without NUM-2) measured +45 ms and +20 ms in two earlier quiet sessions (checks/startup/quiet-measurement-1119.md); the combined release shows no increase, so the kinds-fit cost, if any, is inside the noise of this method. For reference, START-3 (release B) measured -93 ms.

## Decisions for the Reviewer
1. Order: release A adds no measurable startup; START-3 (release B) gives -93 ms. Keep A before B, or ship START-3 first for the margin (production refused 160 twice at about the same startup)?
2. NUM-2 deviation: exact values keep half a unit (`2 + 2 = 5` fails); plain 'one full unit' would pass it. Confirm.
3. Next kinds (tensor, layers, block-stack) after this release, same lane.

## Owner command (a launcher; it sets MVP_ALLOWED_SHA, runs the check, the release, then deletes MVP_ALLOWED_SHA)
C:\s\spec\release-queue\release-163-kinds-fit.cmd   (only after the Reviewer has read this report)

# repins.md: release 150-explain (feat/visual-sprint-2 on released main 74c4f68ae)

Every row is a PIN: an exact value that moved with an intended sprint change. A failing test that is not a pin gets the smallest fix (fixes/). Nothing was excluded or skipped. The pins are ONE commit with fix 2 (the callout margin).

Method: the WHOLE packages/web suite (7108 tests, so the 2 files `affectedTests` leaves uncovered are included; final run on the pins commit 69179904c: 7070 pass, 10 fail, all 10 also fail at released main), and for the control plane the 57 tests that name the 4 changed sources plus a 333-file importer closure (3671 tests, 1 fail, also fails at main). Each failure was run again on released main 74c4f68ae in a clean worktree: a test that fails there is "fails at main" and is not ours (list at the bottom).

## Flow, tensor, block stack, token links, illustration, card width (packages/web/src)

| test file:line | test name | old -> new | moving commit | PIN/REAL |
|---|---|---|---|---|
| tutor-diagrams/flow.test.mjs:391 | RD-2 three-branch decision keeps its lanes; digests | sameSide digests 5c87270433a1ca7a/5c87270433a1ca7a -> 380e9a4f0d44e776 (408) / d5bc27cfa411fac1 (720); card width 726/726 -> 639/720; triage digests unchanged. Added an explicit width assertion [639, 720]. The diamond label wraps to two lines, Yes/No labels stand beside their drops at one height, no wire through a node, no NaN | f0b7a9675 FLOW-W + FLOW-X (diamond wraps to two lines), 9a31040b0 FLOW-X option B (labels beside drops), 51226e544 flow label height | PIN |
| tutor-diagrams/block-stack.test.mjs:212 | horizontal token blocks keep reading order and native cell size | one row (all y = 12) -> rows wrap at block boundaries: 3+3 at 320/408/natural (564), 5+1 at 960; cells stay 36; reading order kept; "wrapped labels share a heading height" now per row | 602043948 TOK-W replace (cells natural 36 px, rows wrap at group boundaries) | PIN |
| tutor-diagrams/block-stack.test.mjs:245 | horizontal block stacks ... oversized native width | fixture 8 x 123456.789 gave natural 936 (>960 as one row) -> 936 now (one block per row). Fixture changed to 8 x -1.2345678901234567e21: natural 2000 > 960, width at 960 = natural (intent kept: an oversized block is not shrunk) | 602043948 TOK-W replace | PIN (fixture) |
| tutor-diagrams/tensor.test.mjs:61 | Q/K/V four natural-width strips | single row, 3 mapped arrows at 408/482/960 -> 2 rows (input | 3 outputs) at 408 and 482 with ONE wrap arrow; one row with 3 mapped arrows at 960; grids align per row | d931a1f6a GEM-1 + TOK-W, then 602043948 TOK-W replace | PIN (see note 1) |
| tutor-diagrams/tensor.test.mjs:108 | mixed text items and explicit mapping indices | tested at 408 -> at 408 the transformation wraps (1 wrap arrow, no tensor-link, link label "Use this pair" not drawn); the explicit mapping (link 1:1 + label + 1 arrowhead) is asserted at 960 where the row fits; 408 wrapped form asserted too | 602043948 TOK-W replace | PIN (see note 1) |
| tutor-diagrams/token-links.test.mjs:123 | natural token widths keep the full rows and bound long labels | natural width of 8 x 24-char chips 960 -> 471 (one 355 px chip column below 720); at 960 two chips per row (4 rows of 2 per side, x ordering per row); at 408, one chip per row (8 rows). Total bound of 960 kept | c6f31c0fa TOK-W3 | PIN (see note 2) |
| tutor-diagrams/illustration-integration.test.mjs:54 | references pass content contract and per-visual token budget | TypeError: budgets.refs['ml-mle-steps'] undefined. Added the entry to the receipt tutor-diagrams/illustration-token-budgets.json (brief 122, balanced 126, detailed 128 tokens, sha256 of each depth's JSON); method reproduced the existing ml-mle-bernoulli-likelihood and ml-kfold-validation entries byte for byte (js-tiktoken cl100k_base, JSON.stringify(spec)). No source change | 1fd149858 reference: ml-mle-steps | PIN (receipt, new reference had no entry) |
| tutor-diagrams/illustration-integration.test.mjs:103 | walkthrough token, value, vocabulary sequences use one row | one row, height < 280 at 320 -> blocks per row at 320 / 960: embeddings 3+3 / 5+1, weighted values 4+2 / 6, vocabulary overview 6 / 6, vocabulary balanced+deep 5+1 / 6; width in (320, 960] kept; vocabulary/value assertions kept | 602043948 TOK-W replace | PIN (see note 2) |
| tutor-diagrams/illustration-embedded-layouts.test.mjs:106 | nine-box parallel tier fits within 960 | single row of 9 at 408 (width 955) -> at 408 two rows 5+4 (width 559, staggered), at 960 one row of 9; labels all kept; test loops both widths | d3a6da59e FLOW-T (wrap a 4+ tier past the budget). First failure in the table is f0b7a9675 (width 1125) but that was repaired by 9b9d8e1c0; the tip failure is FLOW-T | PIN |
| explanation-card-width.test.mjs:20,27,58,70 (4 tests) | natural widths of the bayes-class-token-counts matrix | 747 -> 697 (diagramWidth), card/tile 781 -> 731 (+34 chrome); test title text "781 px tile" -> "731 px tile"; the fixture-width literal at :94 follows | 24cd2aa09 MAT-W (matrix column header padding 8 px) | PIN |
1. REAL? (information, not a defect by the commit text). A wrapped tensor transformation (below ~960 request) replaces the per-link mapped arrows and their link labels with one arrow from the end of row 1 to the start of row 2 (tensor-layout.js, `wrapped` branch; commit 602043948 says so). Q/K/V at card width therefore no longer shows which output maps from the input, and an explicit `links` label (e.g. "Use this pair") is not drawn. Owner rule says rows wrap at group boundaries, so I pinned it; if the owner wants link labels kept in the wrapped form, that is a source change.
2. Cosmetic orphans at the owner rule: token embeddings at 960 wrap 5+1, vocabulary balanced/deep at 320 wrap 5+1 (one block alone on row 2). Not a defect (blocks never overlap), flagging for taste.
3. Nothing REAL found: no overlap, NaN, lost labels (other than note 1) or wire through a node in the pinned shapes; the shape-level checks in each file still pass.

## Plot, bars, panels (packages/web/src/tutor-diagrams)

| test file:line | test name | old -> new | moving commit | PIN/REAL |
|---|---|---|---|---|
| ml-plot.test.mjs:57 | unchanged bars delegate to the legacy layout exactly... (renamed 'bars and a plain plot are drawn by the themed layout, not the legacy one') | bar-chart deepEqual legacy -> notDeepEqual legacy, one data-tutor-bar-axis, one data-tutor-bar per category | 24104b559 BAR-1: vertical bars, ink L-axis | PIN |
| ml-plot.test.mjs:269 | grouped series share a zero baseline... | zero = baseline x1, bars flush on x -> zero = baseline y1; positive bar y+height == zero, negative bar y == zero (68.7 != 59 was the horizontal assumption) | 24104b559 BAR-1 (+ 77db23554 correction) | PIN |
| ml-plot.test.mjs:316 | all-zero multi-series bars emit finite zero marks | 6 zero marks as `<circle>` -> grouped: 6 flat `<line>` marks, stacked: 6 `<circle>` (unchanged); still no NaN/Infinity | 24104b559 BAR-1 (grouped zero = flat line on the baseline) | PIN |
| ml-plot.test.mjs:451 | more than six annotation notes keep six badges... (renamed '...keep six callouts...') | 6 data-tutor-plot-badge '1'..'6' -> 0 badges, 6 data-tutor-plot-callout with the first six names in order, 'Late'/'Final' absent, still 8 data marks | d6bd2481e PLT-2 callouts / d8e071c48 amendment (0e62e4c08 in the log: no numbered badge, max 6) | PIN |
| plot-lines.test.mjs:74 | basic and Phase 02 plots draw straight segments by default and smooth on opt-in (renamed per plan: '...smooth lines by default and preserve straight segments on opt-out') | default straight polyline, smooth:true opt-in -> default smooth, smooth:false straight; plus new test :95 (smooth:false 6 samples = polyline + 6 markers; 12 samples = smooth, only first/labelled/last markers). Whole /plt-5/plot-lines-test-plan.diff applied (includes the contour test using the default) | 4ecefb654 / 4398e8f34 PLT-5: line smooth unless smooth:false | PIN |
| ml-batch3a-correlation.test.mjs:28 | saved plots preserve matching frames... | `<tspan>Population ACF</tspan>` / PACF legend -> 4 `<title>Population ACF: (` and 4 PACF point titles, plus aria-label carrying 'Population ACF (stem)' ... 'Population PACF (stem)'. Panel headings (ACF/PACF) still drawn | 65855c203 LEG-1: one series, no legend pill | PIN |
| ml-batch3b-anomaly-decisions.test.mjs:93 | the run band and flag align... | 7 coordinate marks -> exactly x = 1, 7, 12 (first, labelled run start, last/labelled run end); band/flag alignment asserts unchanged | 4ecefb654 PLT-5 (> 8 samples: first, last, labelled) + bdec800f3 PLT-4 amendment | PIN |
| ml-batch3b-anomaly-decisions.test.mjs:110 | one labeled bar per case shows the fixed score order... | name/score extracted as the next two marks, bar width decreasing -> name = text under the bar, score = text above it (matched by bar centre), bar height decreasing. Case A..E / 0.92..0.27 all present and in order (no label missing) | 24104b559 BAR-1 | PIN |
| ml-batch3b-anomaly-density.test.mjs:88 | both lesson references round-trip... | '!svg.includes(data-tutor-tex=formula)' (note text not drawn) -> svg includes it (formula text drawn on the figure); written-text assert unchanged. Callouts checked inside the figure at 320/408/720 | d6bd2481e PLT-2 callouts / d8e071c48 PLT-2(B) | PIN |
| ml-panels.test.mjs:86 | values print at one precision per chart inside panels... | '3.0 value', '20.09 value', '3.00 value' ... and stand-alone '3 value' -> exact labels '3.0','2.0','1.1','20.09','7.39','3.00' (one precision per chart kept), none contains 'value'; stand-alone has '3' and not '3.00'; stacked 'Class 0: 0.66' etc. unchanged | 11fcacb14 BAR-U: generic unit dropped | PIN |

## svg-snapshots

| tutor-diagrams/svg-snapshots.test.mjs | reference and gallery SVG fingerprints | 534 of 3271 entries already differed at released main 74c4f68ae (release 149 did not re-pin them: the one-hop selection left this test uncovered; main before the sprint, 18cf9fce8, has 0 differing); regenerated at the tip with UPDATE_TUTOR_SVG_SNAPSHOTS=1: 3280 entries, 0 differ | sprint 1 fixes plus every sprint 2 layout item | PIN |

## Control plane (packages/control-plane/test)



## Not pins: fixes (theme-ship-2/fixes/)

| fix | what | where it came from |
|---|---|---|
| 1 | flow labels beside the drops of one node stand at one height (geometry lint rule a, ml-batch-score-fallback) | FLOW-X option B 9a31040b0 |
| 2 | a point callout is never dropped: with no free cell in the plot it takes the margin above the plot area | owner's amendment |
| 3 | the bench copy of the planner kind text carries the production flow and timeline lines (set3-bench.test.mjs) | planner commit ef0cf23b7 |
| 4 | the saved SDK sources embed SDK_ROLES (the role list before 'operator'), so the saved SDK fingerprints match again | release 149 already carried this: its ROLES change moved every saved SDK's bytes; 7 tests were red on main |
| 5 | the Gemini unsteered-bundle size pin 134 -> 136 properties, 9,832 -> 9,977 characters | sprint 1 commit 7fcc07d0d, left stale by release 149 |

## Still failing at released main 74c4f68ae and on the tip (not ours; not edited)

web: motion-ownership.test.mjs (mutation target text not found), render-freshness.test.mjs (stale committed static render), figure-layout.test.mjs (small forces retain visible arrows: the arrow stroke 1.5 vs the sprint theme, TEST-1). All three failed on main and are not in the affected-test selection of the preview, which passes.

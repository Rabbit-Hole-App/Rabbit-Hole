# Release 159-var-1: report

Release name: 159-var-1
Release SHA (full): 14ca6c840dc12d10ce5f87f98a97bca5f12f5ab0 (branch feat/release-159 = tip of feat/var-1; main is 2aeca536d19346699535c3cb599b01651c6c8d2e (release 158) and is an ancestor: a fast-forward, no merge commit; main was still 2aeca536d when this was written)
Recovery branch: recovery/var-1-159, tip d89780d6adab6612886bf5f73afdde0327737cf5 (one commit, the tree of main on top of the release SHA)
Clone: https://rabbit-hole-web-dev-r159-int.tryrabbithole.workers.dev (build 09c29ed64998; MVP record 9348baad47374842; the clone returns 200; first attempt, no startup-limit refusal; broad CI and the release gate recorded as bypassed by the fast path; refs/notes/dev-deploys NOT pushed)
Launcher: C:\s\spec\release-queue\release-159-var-1.cmd (a mirror of 158's, checked by diff after normalising names: only the number, the pin name and the SHA changed; CRLF). Pins: C:/s/spec/release-queue/159-var-1.pins; preview script preview-159-var-1.mjs; runner run-preview-159-var-1.sh; W = C:/s/r159-int (clean, at the SHA; node_modules junctions).
Startup profile launcher (not needed, I ran the same commands, numbers below): C:\s\spec\startup\startup-profile-159.cmd was NOT made; the dry-run and check commands are in the section below.

## What is in it (36 files, +1464/-143; no flag, no migration, no config, no UI change)
- VAR-1 step 1: the derived-field table `tutor-diagrams/derived.js` (box-plot fences, softmax list `op: 'softmax'` + `t`, token-links weights, histogram proportions, heatmap range, sample-set set differences, coordinate-plot `derive`), the new schema properties `derive`, `op`, `t` (withheld from Gemini's bundle: every Gemini bundle stays byte-identical), an absent derived value is computed for the validator and for tokens but put on the card only when something depends on it.
- Step 2: `{{d:N.path}}` prose tokens filled from the card's own diagram before the checks (`explanation-tokens.js`); `explanation_bad_token` refusal; the one guidance sentence enters the prompt only when the card has a diagram; archive trace.
- Step 3: `requestSeed` per explain request (archived), `ref.vary` sampled where a reference reaches the author (`reference-vary.js`, `vary.js`, `random.js`), derived fields refreshed and reference tokens printed, vary lint. The roadmap passes no seed (quote == dispatch, tested).
- Step 4: `vary` on 15 references, with their patterns in a 20-seed test.
- REF-1: Codex's 510ad71a4 (ensemble-votes weighted class B 2.4 -> 1.5; two svg-snapshot hashes) cherry-picked (a0dc36e91), then the band `series.1.values.1 [1.2, 1.8, 0.1]` (26c614495): weighted votes stay at or below hard votes for all three classes, the pattern test checks all three. 20-seed re-run: 20 of 20 keep weighted <= hard for A, B and C and both orders (checks/var-1/step-4/ensemble-votes-20-seeds.md).
- START-1 (863f75f4e): `balance-values.js` builds its `Intl.NumberFormat` on first use, not at import; `formatMinor` strings pinned by a new test (balance-values.test.mjs: 0.00, 0.05, 1.00, 1,234.56, 999,999.99, minus sign U+2212 forms); svg-snapshots unmoved.
- FONT-1 comments (c746c28e4, comments only). Docs: explain.md "no reference has vary yet" corrected to 15 references (14ca6c840).
- Not in it: SAME-1 (release 160), HEAT-1 (161), NUM-2, PLAN-K, GEN-1, any flag.

## Tests (one process per suite, 0 fail)
The fast path's affected-test selection from main (36 changed files): web 73 test files = 1226 tests, control plane 69 test files = 808 tests, 0 fail. Selection checked against every touched file: each changed .js/.mjs file has at least one importing test; the two files no test imports are `tutor-diagrams/README.md` and `svg-snapshots.json`; the three files outside the two suites are `docs/features/explain.md`, `scripts/topic-pipeline/agents/inputs/renderer-constraints.md` and `scripts/topic-pipeline/build-renderer-constraints.mjs`. Those are covered by the smoke: svg-snapshots.test.mjs, scripts/topic-pipeline/test/author-prevalidate.test.mjs (the renderer-constraints test), learn-slash, roadmap-course, roadmap-document-context, explanation-audio = 119 tests, 0 fail; plus `explain-program-render-check.mjs` 38/38. Plan listing: C:/s/gen1-prep/affected-159.mjs (reruns the selection). Not run: the whole packages/web suite, browser checks, release-mvp.sh --check (the launcher runs it).

## Bench (checks/var-1/bench/REPORT-final.md, film/evidence 1e77deca1; AFTER = bf926057f, the candidate adds REF-1, the ensemble band, START-1, docs and a merge of main with no file conflict)
- 154-rule arithmetic flags 0 of 303 BEFORE, 0 of 303 AFTER; variation on Gemini 110 of 110 varied values inside their bands and equal to the drawn value, structure kept in 18 of 20; first attempt invalid 36 vs 45 (noise-sized, not proven); 3 AFTER-only possibly real flags (items 222, 297: prose arithmetic; 280: bars sum 1.03) are ticket NUM-2.
- PLAN-K (ticket, not in 159): planned kind missing in 83 BEFORE / 81 AFTER of the 300 / 298 delivered cards (27 %). Authored by Gemini vs gpt-oss: BEFORE 73 Gemini, 10 gpt-oss; AFTER 71 Gemini, 10 gpt-oss. Rates against all delivered cards with a planned kind: Gemini 73 of 278 (26 %) BEFORE and 71 of 281 (25 %) AFTER; gpt-oss 10 of 21 (48 %) BEFORE and 10 of 17 (59 %) AFTER. So the missing planned kind is mostly Gemini simply writing another kind (about a quarter of its cards), and gpt-oss misses more often per card but writes few cards.

## Startup CPU and bundle size (START-1; same machine, same session, local profile, not Cloudflare's CPU)
- Bundle: 158 = Total Upload 10108.11 KiB / gzip 2561.72 KiB; 159 = 10143.80 KiB / 2572.05 KiB (+35.7 KiB, +10.3 KiB gzip, +0.35 %). 158's preview figure was 10103.45 KiB; 150/151 were 9642 KiB.
- Startup profile (`wrangler deploy --dry-run --config wrangler.rabbit-hole-prod.jsonc` then `wrangler check startup`, total ms): 158 bundle 378, 394, 445; 159 bundle 428, 446, 427, 379. Ranges overlap: no measurable startup growth from this release. For the record, the owner's earlier numbers: 150 = 431.7 ms, 151 = 374.8 ms, 158 = 563 / 423 ms (owner's runs). The 82 ms `__init web/app-worker.js` self time is the bundle's module init, unchanged in kind.
- The START-1 change itself (lazy Intl.NumberFormat) is one construction no longer at import; it does not move the total measurably here.

## Decisions for the Reviewer
1. The candidate differs from the benched AFTER arm by REF-1 (one reference value and two snapshot hashes), the ensemble band, the lazy formatter and docs; none touches the author request for a non-ensemble prompt. Accept without re-benching?
2. SAME-1 (160) merges main after 159 lands; GEN-1 R1 waits for 161.

## Owner command (a launcher; it sets MVP_ALLOWED_SHA, runs the check, the release, then deletes MVP_ALLOWED_SHA)
C:\s\spec\release-queue\release-159-var-1.cmd   (only after the Reviewer has read this report)

# M1: the four references (feat/same-json-four)

Written by the lead on 2026-11-25 from the builder lane's report, an independent verifier's report, and the measurement run by the lead. Nothing is released and no launcher has been run.

**Pass line (BRANCH delivers at least MAIN minus 1 of 75): MET.** MAIN delivered 73 of 75 asks, BRANCH 74 of 75.

## Read first

1. **The Fireworks fallback model is not available.** Every call to `accounts/fireworks/models/gpt-oss-120b` answered `{"error":{"message":"Model not found, inaccessible, and/or not deployed","code":"NOT_FOUND"}}`: all 8 first attempts of the fallback set (profile fireworks-low) and the second step of all 3 lost asks (the model answer is in `rawGoogle[2]` of each lost ask's record). So the "fallback set" the order asked for (2 asks per declared reference, Fireworks request) **was not measured**: Fireworks failed and Gemini wrote those 8 cards. The offline guard still proves the Fireworks request is byte-identical to main's for the 738 undeclared prompts and differs only for the 4 declared references; what Fireworks would answer to it is not known. In build 2 of the full build (20 Nov) 5 asks were moved to the fallback provider and delivered, so the model was reachable then and went away since (not investigated: no production read, and no other model was tried, because the order names this one). **This is a fact about the environment the bench ran in; whether production's fallback is affected too is not known.** Every ask that Gemini failed on ended without a card, which is how 3 of the 3 lost asks below were lost.
2. **What the rescue (decision (a)) did, counted from the raw answers.** MAIN lost 2 of its 5 top-k asks at Detailed (idx 12, 14): in both, Gemini's first answer and its repair tagged the visual `"k":"bar-chart"` instead of `"diagram"`, the server found no visual (`explanation_missing_visual` twice), and the Fireworks step answered NOT_FOUND. On BRANCH the same cell delivered 5 of 5, and one of its asks (idx 15) was rescued with the tag `bar-chart` (valid first time). Four more BRANCH asks were rescued (table below); all five were delivered and valid first time.
3. **The one BRANCH loss is a different failure** (idx 74, ml-self-attention-token-links, Detailed): both Gemini answers wrote `{{d:1.diagram.queries.0.weights.1}}`, which does not name a number in diagram 1 (`explanation_bad_token`); the Fireworks step answered NOT_FOUND. The same refusal exists on MAIN (3 `explanation_bad_token` events among its 15 token-links asks, all repaired), so it is a failure family of that reference that this branch neither introduced nor fixed (events by arm: BRANCH 2 explanation_bad_token on token-links, 1 explanation_bad_calculation and 2 explanation_bad_diagram on regression-mean-baseline; MAIN 4 explanation_missing_visual on top-k, 3 explanation_bad_token on token-links; counts of refusal events, not of asks).
4. **Top-k on BRANCH behaves as on MAIN** (it is parked and its request is byte-identical): 15 of 15 delivered against MAIN's 13 of 15 (the 2 losses above), value sets 1, 2, 1 across the depths against 1, 1, 1 (the draw of the starting numbers by seed does not touch top-k; the one extra value set is one answer that wrote other numbers).
5. **Three rows of the first run are set aside, not deleted.** The first run stopped after 48 rows when the harness's own safeguard fired (three consecutive provider errors): ids 23 (MAIN), 24 (MAIN), 24 (BRANCH) failed with `fetch failed` in 22 to 38 ms of planner time, every attempt `provider_error`, i.e. no network at that moment (the session then sat idle for about 20 hours; the cause of the outage was not investigated). They are kept in `results-aborted-network.jsonl`, the full first-run file in `results-before-resume.jsonl`, and the three asks were re-run on the same seeds in the resumed run (`run-part2.log`). The two real MAIN losses (idx 12, 14) and the BRANCH loss (idx 74) were kept as they happened.
6. **The cost.** Settled US$0.459 for 158 runs (stop line US$1.00). The machine was not quiet (other lanes ran suites and guards; a verifier's suite run was still holding the heavy lock when the second part started), so the milliseconds compare the two arms (they alternate) and not older runs.

## Branch and commits

`feat/same-json-four` at **08eab43131a6a02fe58b70723b144c510d4c4d50** (pushed, no force), base `201865bdf` = feat/same-json `953a9ea55` with main `b29b6bdd7` (release 170) merged in (a clean merge, as the reviewer's `git merge-tree` showed). Main is an ancestor, so a release fast-forwards. The three commits of this lane on top of the inherited 11, plain messages, no trailers:

| commit | what |
|---|---|
| a258fdef0 | Park top-k (owner, 2026-11-24): `ml-sampling-top-k-reference.js` and `-data.js` equal main's (0 bytes of difference); `ml-sampling-top-k` added to `calculation-undeclared.json` (308 ids, sorted; the note gets one sentence saying it was added once on 2026-11-24 because the owner parked it); `calculation-declarations.test.mjs` expects four declared references, two with a function (softmax-probabilities, regression-mean-baseline) and two that need none (confusion-matrix-counts, ml-self-attention-token-links); `docs/features/explain/parked.md` has the top-k entry |
| f7ffac268 | Decision (a): a visual whose `k` is a string other than diagram, spec or picture and that carries a `spec` object holding a `diagram` object is read as the diagram (`rescuedVisualTag`, learn-primitives.js:91); one trace entry per rescued item, `trace.rescuedVisual = [{tag}]`; 28 frozen outputs of the three existing cases are byte-identical to main's |
| 08eab4313 | Decision (b): the `explanation_bad_prose_number` check runs only when `steps.length > 0` (a function ran); the "?" check stays for every declared reference |

`git diff --stat b29b6bdd7..HEAD`: 29 files, +1875 -28 (against 201865bdf the three commits are 13 files, +252 -212).

## Things the order did not say (decided by the builder, listed for the reviewer)

- **There is no standalone top-k function file.** `topK`, `topKCalculation` and `topKInputs` lived inside `ml-sampling-top-k-data.js`, which the order sends back to main's content, so the park removes the function. It stays in git at feat/same-json `953a9ea55` (parked.md says so).
- **The park turned 14 control-plane tests red and broke the import of `calculation-functions.test.mjs`**, because top-k was their fixture. The builder removed the 6 top-k tests and 2 import lines plus the unused `nearList` helper from `calculation-functions.test.mjs`, and converted `explanation-calculation.test.js` and `explanation-calculation-context.test.js` from top-k to softmax-probabilities and regression-mean-baseline fixtures. The verifier compared old and new assertion by assertion: 45 tests before the park commit, 41 after it, 42 at HEAD (the builder's "41 before and after" was wrong). Dropped with the function: 6 top-k function tests, the "stored numbers are what the function gives" test for top-k, the 3 per-reference top-k context tests (Gemini 362-property limit, planned bundle, fast-chain bundle) and the top-k request test (the per-reference loops still run for softmax and mean baseline). Weakened without an equal replacement: the placeholder-masking test no longer checks an `int` scalar input masked to "?" (generic coverage remains in `calculation.test.mjs`); the "undrawn result written to the variables list" assertion became an undrawn input assertion (no remaining reference has an undrawn result); the scalar-plus-list result step record now has two list results. The `explanation-novis.test.js` no-fence case `{k:'other', spec: CYCLE}` became `{k:'other', spec:'cycle'}`, because the old case is now rescued (the new test file covers it).
- **The spec's Task 5 part 3 ("top-k first ... the owner approves the result before anything else is done") is stale** against the owner's decision of 24 Nov; the branch follows the decision and the spec text is unchanged in SPEC.md. (Conflict C of the reviewer's ruling: with the owner.)
- **Unknown-key stripping needed no code change**: `stripUnknown`/`branchFor` already pick the diagram branch for a `k:'heatmap'` item with a spec; a test proves the same keys are stripped as for `k:'diagram'`.
- **"One trace event per rescued item"** is written at the existing strip site in learn-artifact.js (`visualFence` has no trace access); the verifier saw that entries accumulate across a repair or a fallback answer of the same ask (an ask answered twice with the same rescued visual records two entries). The table below gives entries and distinct asks.
- **The rescue takes any string tag as written**: `'Diagram'`, `''` and `' diagram'` are rescued too (the order's literal rule); an item that also carries `p`/`a`/`c` still takes the picture branch.

## Offline proof (no provider call)

- **Request guard** against main b29b6bdd7 (`guards.json`; the builder's run, repeated by the verifier on the same inputs, 78 s each): 492 references, 742 prompts x 4 requests (Gemini and fallback, no plan and planned with a seed): **identical 738, differing in a declared reference 4, differing in an undeclared reference 0**; undeclared prompts 738, of them identical 738 (top-k's included). The 4: confusion-matrix-counts, regression-mean-baseline, softmax-probabilities, ml-self-attention-token-links.
- **Hashes** (`hashes-main.json`, `hashes-branch.json`, `C:/s/box1-bench/hashes.mjs`): maximum Gemini properties **350 on main and on the branch**. Moved on the branch: schema hash 2 (softmax-probabilities and regression-mean-baseline, 308 -> 316 properties: their answer schema now carries `variables`); body, Gemini and Fireworks hashes 4 (those two plus confusion-matrix-counts and ml-self-attention-token-links). ml-sampling-top-k: nothing moved (308 -> 308).
- **svg-snapshots.json**: the committed blob is `085cdf47b7bdb3d1a2fc788319ad81290625d7b6` on main, on `201865bdf` and on HEAD (the working-tree file differs from the blob by CRLF only).
- **Web suite** (`npm run test:unit`, heavy lock): tests 7704, pass 7676, fail 0, skipped 27, todo 1 (not ours); the verifier's own run gave the same totals (7704 / 7676 / 0). Main was 7659 / 7631 / 0 / 27.
- **Control-plane suite** (`npm test`): tests 5083, pass 5070, **fail 5, all in `rabbit-hole-prod-config.test.js`** (the app Worker owns digrabbithole.com; FILE_JOBS; /animation; /whiteboard; ROADMAP_JOBS roadmap-jobs-1), the same five that are red on main since f0ae33c53 (a rerun of that file alone: 14 tests, 9 pass, 5 fail; the files are untouched by this branch). The verifier's second control-plane run is not used: it ran while the machine was suspended (individual tests lasted 5 to 15 hours) and shows 9 failures, the same five plus four time-dependent ones.
- **The two new rules, checked by the verifier** on batteries against main: 85 inputs x 2 modes for the rescue (57 differences, 0 on a non-rescued item; the three existing kinds with and without spec identical; the 28 frozen strings identical to main's output); 18 cards for the prose check (9 changed, all refused -> accepted, none the other way; the "?" check still fires on a none reference and wins over a prose 0.70). Cards whose prose is no longer checked: every card of a reference that declares none; a function reference whose card gets no function run (no diagram of its kind, no fence, a fence that is not JSON).

## Which CI job runs the declarations test on a merge that touches a reference file (the reviewer's "main only, checked at every merge")

- `calculation-declarations.test.mjs` answers both of its questions (does a changed reference need a function; are its numbers what its function gives). It runs in the **verify workflow**: `.github/workflows/verify.yml:60-69` (step "Unit suites", `bash run.sh test:unit $SUITES`, the suites from `scripts/ci/verify-plan.mjs`; `unit:web` is the whole web suite, packages/web/package.json:10), selected for any non-docs change under packages/web (verify-plan.mjs:19 and :33; an unmapped path runs every suite, :31). verify.yml runs on non-main pushes and pull requests only (`branches-ignore: [main]`); `fast-e2e` never runs unit tests (scripts/ci/affected.mjs header).
- **So on a merge that goes through verify, a reference-file change triggers it, and a `check-map.json` row would change nothing** (a mapped row only adds the control-plane suite in verify-plan, :35). I therefore added no row, as the order allows.
- **But on the MVP fast path (what the releases use, with the broad CI bypassed) it is NOT triggered for most reference files.** `scripts/mvp-fast-path.mjs` `affectedTests` (lines 99-110, one-hop imports; it does not read check-map.json): the declarations test imports only `calculation.js`, `reference-library.js` and `spec.js` and reads `calculation-undeclared.json` by URL, so it is selected for a change to those three (this branch's own preview selects it) and, for a single changed file, only for 35 of the 116 `*-references.js` (68), `*-data.js` (38) and `*-reference.js` (10) files, by accident (no test imports them, so the whole web suite runs as a fallback); for the other 81 (45 of 68 references, 30 of 38 data files, 6 of 10) it is not run, including `ml-softmax-probabilities-data.js` and `ml-regression-mean-baseline-data.js`, which hold the functions. `calculation-undeclared.json` alone is "uncovered". The verifier's smallest fix, tested on a scratch copy (selected for 68/68, 38/38, 10/10 and the combinations), **not applied here** (release tooling, not in the order; the reviewer decides):

```diff
-export const TREE_SCANS = [{ test: 'packages/control-plane/test/credits-only-ui.test.js', scans: /^packages\/(web|control-plane)\/src\/(?!.*\.test\.)/ }];
+export const TREE_SCANS = [
+  { test: 'packages/control-plane/test/credits-only-ui.test.js', scans: /^packages\/(web|control-plane)\/src\/(?!.*\.test\.)/ },
+  { test: 'packages/web/src/tutor-diagrams/calculation-declarations.test.mjs', scans: /^packages\/web\/src\/tutor-diagrams\/(?:[^/]+-(?:references?|data)\.js|calculation-undeclared\.json)$/ },
+];
```

  It needs one assertion in `scripts/mvp-fast-path.test.mjs`.
- **check-map.test.mjs ("every tracked executable file has a class") is red on main too** (34 unclassified tracked files on b29b6bdd7). This change set adds 6 more (explanation-calculation.js, calculation.js, shares.js, calculation-undeclared.json, ml-regression-mean-baseline-data.js, ml-softmax-probabilities-data.js): 40 on the branch. The test's own rule is that a new file is classified in the push that adds it; not done here (not in the order).


## Measurement

Profile google-low (fallback set: fireworks-low), planner on, a different seed for every ask (bench-<idx>-<ask>), each reference by its own first prompt, at Brief, Balanced and Detailed, five asks each. MAIN = main b29b6bdd7, BRANCH = feat/same-json-four 08eab4313. 150 main-set runs (75 MAIN, 75 BRANCH) and 8 fallback-model runs (BRANCH only). Settled cost: main set US$0.435, fallback US$0.023, total US$0.459; stop line US$1.00. The machine was not otherwise quiet (other lanes ran suites and guards at the same time), so the milliseconds are comparable between the arms (they alternate) and not against older runs.

Columns, out of 5 asks: **delivered**; **valid first time**; **repairs** (summed); **value sets** (the numbers of every diagram in spec order, the variables list apart), **label sets**, **whole cards** among the delivered cards; **lost** = asks with no card; **rej-prose** = asks where an attempt was refused by the prose-number check, **rej-?** = by the "?" check, **rej-calc** = by the function step; **fallback** = asks where the first provider failed and the next provider was tried (movedToNextProvider). **Read this with the next paragraph: on this run the Fireworks model answered NOT_FOUND ("Model not found, inaccessible, and/or not deployed") on every call, so a moved ask that Gemini could not answer was lost, and a fireworks-low ask was answered by Gemini after Fireworks failed.**

| reference | depth | arm | delivered | valid first time | repairs | value sets | label sets | whole cards | lost | rej-prose | rej-? | rej-calc | fallback |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| top-k | brief | MAIN | 5/5 | 5/5 | 0 | 1 | 1 | 5 | 0 | 0 | 0 | 0 | 0 |
| top-k | brief | BRANCH | 5/5 | 5/5 | 0 | 1 | 1 | 5 | 0 | 0 | 0 | 0 | 0 |
| top-k | balanced | MAIN | 5/5 | 5/5 | 0 | 1 | 1 | 5 | 0 | 0 | 0 | 0 | 0 |
| top-k | balanced | BRANCH | 5/5 | 5/5 | 0 | 2 | 1 | 5 | 0 | 0 | 0 | 0 | 0 |
| top-k | detailed | MAIN | 3/5 | 3/5 | 2 | 1 | 1 | 3 | 2 | 0 | 0 | 0 | 2 |
| top-k | detailed | BRANCH | 5/5 | 5/5 | 0 | 1 | 1 | 5 | 0 | 0 | 0 | 0 | 0 |
| softmax-probabilities | brief | MAIN | 5/5 | 5/5 | 0 | 1 | 1 | 5 | 0 | 0 | 0 | 0 | 0 |
| softmax-probabilities | brief | BRANCH | 5/5 | 5/5 | 0 | 5 | 2 | 5 | 0 | 0 | 0 | 0 | 0 |
| softmax-probabilities | balanced | MAIN | 5/5 | 5/5 | 0 | 1 | 1 | 5 | 0 | 0 | 0 | 0 | 0 |
| softmax-probabilities | balanced | BRANCH | 5/5 | 5/5 | 0 | 5 | 2 | 5 | 0 | 0 | 0 | 0 | 0 |
| softmax-probabilities | detailed | MAIN | 5/5 | 5/5 | 0 | 1 | 2 | 5 | 0 | 0 | 0 | 0 | 0 |
| softmax-probabilities | detailed | BRANCH | 5/5 | 5/5 | 0 | 5 | 3 | 5 | 0 | 0 | 0 | 0 | 0 |
| regression-mean-baseline | brief | MAIN | 5/5 | 5/5 | 0 | 1 | 1 | 5 | 0 | 0 | 0 | 0 | 0 |
| regression-mean-baseline | brief | BRANCH | 5/5 | 4/5 | 1 | 5 | 5 | 5 | 0 | 0 | 0 | 0 | 0 |
| regression-mean-baseline | balanced | MAIN | 5/5 | 5/5 | 0 | 1 | 1 | 5 | 0 | 0 | 0 | 0 | 0 |
| regression-mean-baseline | balanced | BRANCH | 5/5 | 5/5 | 0 | 5 | 5 | 5 | 0 | 0 | 0 | 0 | 0 |
| regression-mean-baseline | detailed | MAIN | 5/5 | 5/5 | 0 | 1 | 1 | 5 | 0 | 0 | 0 | 0 | 0 |
| regression-mean-baseline | detailed | BRANCH | 5/5 | 3/5 | 2 | 5 | 5 | 5 | 0 | 0 | 0 | 1 | 0 |
| confusion-matrix-counts | brief | MAIN | 5/5 | 5/5 | 0 | 1 | 5 | 5 | 0 | 0 | 0 | 0 | 0 |
| confusion-matrix-counts | brief | BRANCH | 5/5 | 5/5 | 0 | 5 | 4 | 5 | 0 | 0 | 0 | 0 | 0 |
| confusion-matrix-counts | balanced | MAIN | 5/5 | 5/5 | 0 | 1 | 1 | 5 | 0 | 0 | 0 | 0 | 0 |
| confusion-matrix-counts | balanced | BRANCH | 5/5 | 5/5 | 0 | 5 | 4 | 5 | 0 | 0 | 0 | 0 | 0 |
| confusion-matrix-counts | detailed | MAIN | 5/5 | 5/5 | 0 | 1 | 2 | 5 | 0 | 0 | 0 | 0 | 0 |
| confusion-matrix-counts | detailed | BRANCH | 5/5 | 5/5 | 0 | 5 | 5 | 5 | 0 | 0 | 0 | 0 | 0 |
| ml-self-attention-token-links | brief | MAIN | 5/5 | 4/5 | 1 | 1 | 4 | 5 | 0 | 0 | 0 | 0 | 0 |
| ml-self-attention-token-links | brief | BRANCH | 5/5 | 5/5 | 0 | 5 | 3 | 5 | 0 | 0 | 0 | 0 | 0 |
| ml-self-attention-token-links | balanced | MAIN | 5/5 | 5/5 | 0 | 1 | 3 | 5 | 0 | 0 | 0 | 0 | 0 |
| ml-self-attention-token-links | balanced | BRANCH | 5/5 | 5/5 | 0 | 4 | 4 | 5 | 0 | 0 | 0 | 0 | 0 |
| ml-self-attention-token-links | detailed | MAIN | 5/5 | 3/5 | 2 | 1 | 5 | 5 | 0 | 0 | 0 | 0 | 0 |
| ml-self-attention-token-links | detailed | BRANCH | 4/5 | 4/5 | 1 | 4 | 3 | 4 | 1 | 0 | 0 | 0 | 1 |

**Totals, all five references (75 asks per arm)**

| arm | asks | delivered | lost | valid first time | repairs | rej-prose | rej-? | rej-calc | to the fallback provider | median ms | p90 ms | settled cost (US$) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| MAIN | 75 | 73 | 2 | 70/75 | 5 | 0 | 0 | 0 | 2 | 2302 | 3282 | 0.208 |
| BRANCH | 75 | 74 | 1 | 71/75 | 4 | 0 | 0 | 1 | 1 | 2506 | 4094 | 0.227 |

**The four declared references only (60 asks per arm), for comparison with build 2 of the full build (delivered 60/60, valid first time 49/60, 5 moved to the fallback, median 2600 ms, p90 5398 ms; main in that build: 60/60, 59/60, 0, 2245 ms, 2846 ms)**

| arm | asks | delivered | lost | valid first time | repairs | rej-prose | rej-? | rej-calc | to the fallback provider | median ms | p90 ms | settled cost (US$) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| MAIN | 60 | 60 | 0 | 57/60 | 3 | 0 | 0 | 0 | 0 | 2302 | 3145 | 0.162 |
| BRANCH | 60 | 59 | 1 | 56/60 | 4 | 0 | 0 | 1 | 1 | 2548 | 4444 | 0.185 |

**top-k only (15 asks per arm; parked: BRANCH is expected to behave as MAIN)**

| arm | asks | delivered | lost | valid first time | repairs | rej-prose | rej-? | rej-calc | to the fallback provider | median ms | p90 ms | settled cost (US$) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| MAIN | 15 | 13 | 2 | 13/15 | 2 | 0 | 0 | 0 | 2 | 2260 | 4153 | 0.046 |
| BRANCH | 15 | 15 | 0 | 15/15 | 0 | 0 | 0 | 0 | 0 | 2354 | 2709 | 0.042 |

**Pass line (BRANCH delivers at least MAIN minus 1 of 75): MET** — MAIN delivered 73 of 75, BRANCH 74 of 75 (BRANCH above MAIN by 1).

## Rescued visuals (decision (a)): trace.rescuedVisual on BRANCH

One entry per rescued item per answer; the entries accumulate across a repair or fallback answer of the same ask (the verifier saw this), so the table gives both the entries and the asks.

| reference | rescued tag | entries | asks | asks delivered |
|---|---|---|---|---|
| confusion-matrix-counts | heatmap | 1 | 1 | 1 |
| ml-self-attention-token-links | token-links | 1 | 1 | 1 |
| regression-mean-baseline | coordinate-plot | 2 | 2 | 2 |
| top-k | bar-chart | 1 | 1 | 1 |

BRANCH asks with a rescue entry: 5 of 83. MAIN has no such field (the rescue does not exist there); MAIN asks where Gemini wrote a mis-tagged visual cannot be told from the record except through a lost or dropped visual.

## The fallback model (BRANCH only, two asks per declared reference, profile fireworks-low)

| reference | ask | seed | delivered | valid first time | server step | refused by |
|---|---|---|---|---|---|---|
| softmax-probabilities | 1 | bench-76-1 | yes | null | inputs weightsA=[55,29,44] weightsB=[57,12,54]; overwrote probabilitiesA, probabilitiesB | - |
| softmax-probabilities | 2 | bench-77-2 | yes | null | inputs weightsA=[18,6,46] weightsB=[5,26,22]; overwrote probabilitiesA, probabilitiesB | - |
| regression-mean-baseline | 1 | bench-78-1 | yes | null | inputs targets=[45,18,34,28,50]; overwrote nothing | - |
| regression-mean-baseline | 2 | bench-79-2 | yes | null | inputs targets=[10,20,30,40,50]; overwrote nothing | - |
| confusion-matrix-counts | 1 | bench-80-1 | yes | null | none recorded | - |
| confusion-matrix-counts | 2 | bench-81-2 | yes | null | none recorded | - |
| ml-self-attention-token-links | 1 | bench-82-1 | yes | null | none recorded | - |
| ml-self-attention-token-links | 2 | bench-83-2 | yes | null | none recorded | - |

Fallback: delivered 8/8, lost 0, rej-prose 0, rej-? 0, rej-calc 0.

## Every ask

One line per ask: server step (BRANCH), a refusal if any, then title, labels and values. Counted, not judged.

### top-k: Does top-k filtering affect the reported probability of the chosen token?

**MAIN, brief**

- ask 1 (seed bench-1-1, 2430 ms): **Top-k filtering and token probability** | bar-chart: Keeping only the likeliest tokens / Keep the top 2 tokens. The other tokens drop to zero, and each kept token gets a bigger share. / % / Full softmax... | values 42, 28, 16, 8, 6, 60, 40, 0, 0, 0
- ask 2 (seed bench-2-2, 2013 ms): **Top-k filtering and token probability** | bar-chart: Keeping only the likeliest tokens / Keep the top 2 tokens. The other tokens drop to zero, and each kept token gets a bigger share. / % / Full softmax... | values 42, 28, 16, 8, 6, 60, 40, 0, 0, 0
- ask 3 (seed bench-3-3, 1972 ms): **Top-k Filtering and Token Probability** | bar-chart: Keeping only the likeliest tokens / Keep the top 2 tokens. The other tokens drop to zero, and each kept token gets a bigger share. / % / Full softmax... | values 42, 28, 16, 8, 6, 60, 40, 0, 0, 0
- ask 4 (seed bench-4-4, 1894 ms): **Top-k Filtering and Token Probabilities** | bar-chart: Keeping only the likeliest tokens / Keep the top 2 tokens. The other tokens drop to zero, and each kept token gets a bigger share. / % / Full softmax... | values 42, 28, 16, 8, 6, 60, 40, 0, 0, 0
- ask 5 (seed bench-5-5, 2007 ms): **Top-K Filtering and Probabilities** | bar-chart: Keeping only the likeliest tokens / Keep the top 2 tokens. The other tokens drop to zero, and each kept token gets a bigger share. / % / Full softmax... | values 42, 28, 16, 8, 6, 60, 40, 0, 0, 0

**BRANCH, brief**

- ask 1 (seed bench-1-1, 2486 ms; none recorded): **Top-k Filtering and Token Probabilities** | bar-chart: Keeping only the likeliest tokens / Keep the top 2 tokens. The other tokens drop to zero, and each kept token gets a bigger share. / % / Full softmax... | values 42, 28, 16, 8, 6, 60, 40, 0, 0, 0
- ask 2 (seed bench-2-2, 2147 ms; none recorded): **Top-k filtering and token probability** | bar-chart: Keeping only the likeliest tokens / Keep the top 2 tokens. The other tokens drop to zero, and each kept token gets a bigger share. / % / Full softmax... | values 42, 28, 16, 8, 6, 60, 40, 0, 0, 0
- ask 3 (seed bench-3-3, 1999 ms; none recorded): **Top-k Filtering and Token Probabilities** | bar-chart: Keeping only the likeliest tokens / Keep the top 2 tokens. The other tokens drop to zero, and each kept token gets a bigger share. / % / Full softmax... | values 42, 28, 16, 8, 6, 60, 40, 0, 0, 0
- ask 4 (seed bench-4-4, 1842 ms; none recorded): **Top-K Filtering and Probabilities** | bar-chart: Keeping only the likeliest tokens / Keep the top 2 tokens. The other tokens drop to zero, and each kept token gets a bigger share. / % / Full softmax... | values 42, 28, 16, 8, 6, 60, 40, 0, 0, 0
- ask 5 (seed bench-5-5, 2354 ms; none recorded): **Top-k filtering and token probability** | bar-chart: Keeping only the likeliest tokens / Keep the top 2 tokens. The other tokens drop to zero, and each kept token gets a bigger share. / % / Full softmax... | values 42, 28, 16, 8, 6, 60, 40, 0, 0, 0

**MAIN, balanced**

- ask 1 (seed bench-6-1, 2260 ms): **Top-k Filtering and Token Probabilities** | bar-chart: Full softmax and top-2 sampling / The kept tokens originally hold 70% of the probability. Divide each kept probability by that total. / % / Full soft... | values 42, 28, 16, 8, 6, 60, 40, 0, 0, 0
- ask 2 (seed bench-7-2, 2033 ms): **Top-k Filtering and Token Probabilities** | bar-chart: Full softmax and top-2 sampling / The kept tokens originally hold 70% of the probability. Divide each kept probability by that total. / % / Full soft... | values 42, 28, 16, 8, 6, 60, 40, 0, 0, 0
- ask 3 (seed bench-8-3, 1927 ms): **Top-k Filtering and Token Probabilities** | bar-chart: Full softmax and top-2 sampling / The kept tokens originally hold 70% of the probability. Divide each kept probability by that total. / % / Full soft... | values 42, 28, 16, 8, 6, 60, 40, 0, 0, 0
- ask 4 (seed bench-9-4, 2427 ms): **Top-K Filtering and Token Probabilities** | bar-chart: Full softmax and top-2 sampling / The kept tokens originally hold 70% of the probability. Divide each kept probability by that total. / % / Full soft... | values 42, 28, 16, 8, 6, 60, 40, 0, 0, 0
- ask 5 (seed bench-10-5, 2027 ms): **Top-k Filtering and Token Probabilities** | bar-chart: Full softmax and top-2 sampling / The kept tokens originally hold 70% of the probability. Divide each kept probability by that total. / % / Full soft... | values 42, 28, 16, 8, 6, 60, 40, 0, 0, 0

**BRANCH, balanced**

- ask 1 (seed bench-6-1, 2501 ms; none recorded): **Top-k Filtering and Token Probabilities** | bar-chart: Full softmax and top-2 sampling / The kept tokens originally hold 70% of the probability. Divide each kept probability by that total. / % / Full soft... | values 42, 28, 16, 8, 6, 60, 40, 0, 0, 0
- ask 2 (seed bench-7-2, 2093 ms; none recorded): **Top-k filtering and token probability** | bar-chart: Full softmax and top-2 sampling / The kept tokens originally hold 70% of the probability. Divide each kept probability by that total. / % / Full soft... | values 42, 28, 16, 8, 6, 60, 40, 0, 0, 0
- ask 3 (seed bench-8-3, 2108 ms; none recorded): **Top-k Filtering and Token Probabilities** | bar-chart: Full softmax and top-2 sampling / The kept tokens originally hold 70% of the probability. Divide each kept probability by that total. / % / Full soft... | values 42, 28, 16, 8, 6, 60, 40, 0, 0, 0
- ask 4 (seed bench-9-4, 2253 ms; none recorded): **Top-k filtering and token probabilities** | bar-chart: Full softmax and top-2 sampling / The kept tokens originally hold 70% of the probability. Divide each kept probability by that total. / % / Full soft... | values 42, 28, 30, 60, 40, 0
- ask 5 (seed bench-10-5, 2709 ms; none recorded): **Top-k Filtering and Token Probabilities** | bar-chart: Full softmax and top-2 sampling / The kept tokens originally hold 70% of the probability. Divide each kept probability by that total. / % / Full soft... | values 42, 28, 16, 8, 6, 60, 40, 0, 0, 0

**MAIN, detailed**

- ask 1 (seed bench-11-1, 2443 ms): **Top-k Renormalization in Language Models** | bar-chart: Top-2 renormalizes the kept mass / For a kept token, $p_i'=p_i/\sum_{j\in K}p_j$. For "on", 42% / 70% = 60%. / % / Full softmax / Top-2 renormalized | values 42, 28, 16, 8, 6, 60, 40, 0, 0, 0
- ask 2 (seed bench-12-2, 4325 ms; refused: explanation_missing_visual: the card needs one to three visuals, an rh-diagram or an rh-illustration fence, each with prose before; FALLBACK PROVIDER): **no card: provider_error**
- ask 3 (seed bench-13-3, 2471 ms): **Top-k Renormalization on Probabilities** | bar-chart: Top-2 renormalizes the kept mass / For a kept token, $p_i'=p_i/\sum_{j\in K}p_j$. For "on", 42% / 70% = 60%. / % / Full softmax / Top-2 renormalized | values 42, 28, 16, 8, 6, 60, 40, 0, 0, 0
- ask 4 (seed bench-14-4, 4153 ms; refused: explanation_missing_visual: the card needs one to three visuals, an rh-diagram or an rh-illustration fence, each with prose before; FALLBACK PROVIDER): **no card: provider_error**
- ask 5 (seed bench-15-5, 2390 ms): **Top-k Renormalization Effect** | bar-chart: Top-2 renormalizes the kept mass / For a kept token, $p_i'=p_i/\sum_{j\in K}p_j$. For "on", 42% / 70% = 60%. / % / Full softmax / Top-2 renormalized | values 42, 28, 16, 8, 6, 60, 40, 0, 0, 0

**BRANCH, detailed**

- ask 1 (seed bench-11-1, 2423 ms; none recorded): **Top-k Renormalization on Token Probabilities** | bar-chart: Top-2 renormalizes the kept mass / For a kept token, $p_i'=p_i/\sum_{j\in K}p_j$. For "on", 42% / 70% = 60%. / % / Full softmax / Top-2 renormalized | values 42, 28, 16, 8, 6, 60, 40, 0, 0, 0
- ask 2 (seed bench-12-2, 2188 ms; none recorded): **Top-k Renormalization Effect on Probability** | bar-chart: Top-2 renormalizes the kept mass / For a kept token, $p_i'=p_i/\sum_{j\in K}p_j$. For "on", 42% / 70% = 60%. / % / Full softmax / Top-2 renormalized | values 42, 28, 16, 8, 6, 60, 40, 0, 0, 0
- ask 3 (seed bench-13-3, 2672 ms; none recorded): **Top-k Renormalization Effect on Token Probability** | bar-chart: Top-2 renormalizes the kept mass / For a kept token, $p_i'=p_i/\sum_{j\in K}p_j$. For "on", 42% / 70% = 60%. / % / Full softmax / Top-2 renormalized | values 42, 28, 16, 8, 6, 60, 40, 0, 0, 0
- ask 4 (seed bench-14-4, 2891 ms; none recorded): **Top-k Renormalization in Language Models** | bar-chart: Top-2 renormalizes the kept mass / For a kept token, $p_i'=p_i/\sum_{j\in K}p_j$. For "on", 42% / 70% = 60%. / % / Full softmax / Top-2 renormalized | values 42, 28, 16, 8, 6, 60, 40, 0, 0, 0
- ask 5 (seed bench-15-5, 2532 ms; none recorded; rescued bar-chart): **Top-k Renormalization on Token Probabilities** | bar-chart: Top-2 renormalizes the kept mass / For a kept token, $p_i'=p_i/\sum_{j\in K}p_j$. For "on", 42% / 70% = 60%. / % / Full softmax / Top-2 renormalized | values 42, 28, 16, 8, 6, 60, 40, 0, 0, 0

### softmax-probabilities: How do softmax probabilities compare two multiclass predictions?

**MAIN, brief**

- ask 1 (seed bench-16-1, 2045 ms): **Comparing Multiclass Predictions** | bar-chart: Two softmax probability vectors / Illustrative values; compare categories on the shared scale. / Input A / Input B | values 0.7, 0.2, 0.1, 0.15, 0.6, 0.25
- ask 2 (seed bench-17-2, 2113 ms): **Comparing Multiclass Predictions with Softmax** | bar-chart: Two softmax probability vectors / Illustrative values; compare categories on the shared scale. / Input A / Input B | values 0.7, 0.2, 0.1, 0.15, 0.6, 0.25
- ask 3 (seed bench-18-3, 1881 ms): **Comparing Multiclass Predictions** | bar-chart: Two softmax probability vectors / Illustrative values; compare categories on the shared scale. / Input A / Input B | values 0.7, 0.2, 0.1, 0.15, 0.6, 0.25
- ask 4 (seed bench-19-4, 1990 ms): **Comparing Multiclass Predictions** | bar-chart: Two softmax probability vectors / Illustrative values; compare categories on the shared scale. / Input A / Input B | values 0.7, 0.2, 0.1, 0.15, 0.6, 0.25
- ask 5 (seed bench-20-5, 2114 ms): **Comparing Multiclass Predictions** | bar-chart: Two softmax probability vectors / Illustrative values; compare categories on the shared scale. / Input A / Input B | values 0.7, 0.2, 0.1, 0.15, 0.6, 0.25

**BRANCH, brief**

- ask 1 (seed bench-16-1, 2548 ms; inputs weightsA=[54,5,29] weightsB=[39,50,20]; overwrote probabilitiesA, probabilitiesB): **Comparing Multiclass Predictions** | bar-chart: Two softmax probability vectors / Input A / Input B | values 0.61, 0.06, 0.33, 0.36, 0.46, 0.18
- ask 2 (seed bench-17-2, 2458 ms; inputs weightsA=[58,21,21] weightsB=[17,40,43]; overwrote nothing): **Comparing Softmax Probabilities** | bar-chart: Two softmax probability vectors / Input A / Input B | values 0.58, 0.21, 0.21, 0.17, 0.4, 0.43
- ask 3 (seed bench-18-3, 2619 ms; inputs weightsA=[55,7,38] weightsB=[46,6,48]; overwrote nothing): **Comparing Multiclass Predictions** | bar-chart: Illustrative softmax probabilities / Input A / Input B | values 0.55, 0.07, 0.38, 0.46, 0.06, 0.48
- ask 4 (seed bench-19-4, 2473 ms; inputs weightsA=[39,44,30] weightsB=[18,23,8]; overwrote probabilitiesA, probabilitiesB): **Comparing Multiclass Predictions** | bar-chart: Two softmax probability vectors / Input A / Input B | values 0.34, 0.39, 0.27, 0.37, 0.47, 0.16
- ask 5 (seed bench-20-5, 2315 ms; inputs weightsA=[6,35,32] weightsB=[7,45,29]; overwrote probabilitiesA, probabilitiesB): **Comparing Multiclass Predictions** | bar-chart: Two softmax probability vectors / Input A / Input B | values 0.08, 0.48, 0.44, 0.09, 0.55, 0.36

**MAIN, balanced**

- ask 1 (seed bench-21-1, 2292 ms): **Comparing Multiclass Predictions** | bar-chart: Two softmax probability vectors / Illustrative values; compare categories on the shared scale. / Input A / Input B | values 0.7, 0.2, 0.1, 0.15, 0.6, 0.25
- ask 2 (seed bench-22-2, 2546 ms): **Comparing Multiclass Predictions** | bar-chart: Two softmax probability vectors / Illustrative values; compare categories on the shared scale. / Input A / Input B | values 0.7, 0.2, 0.1, 0.15, 0.6, 0.25
- ask 3 (seed bench-23-3, 3769 ms): **Comparing Multiclass Predictions** | bar-chart: Two softmax probability vectors / Illustrative values; compare categories on the shared scale. / Input A / Input B | values 0.7, 0.2, 0.1, 0.15, 0.6, 0.25
- ask 4 (seed bench-24-4, 1777 ms): **Comparing Multiclass Predictions with Softmax** | bar-chart: Two softmax probability vectors / Illustrative values; compare categories on the shared scale. / Input A / Input B | values 0.7, 0.2, 0.1, 0.15, 0.6, 0.25
- ask 5 (seed bench-25-5, 1727 ms): **Comparing Multiclass Predictions with Softmax** | bar-chart: Two softmax probability vectors / Illustrative values; compare categories on the shared scale. / Input A / Input B | values 0.7, 0.2, 0.1, 0.15, 0.6, 0.25

**BRANCH, balanced**

- ask 1 (seed bench-21-1, 2615 ms; inputs weightsA=[49,31,60] weightsB=[22,53,12]; overwrote probabilitiesA, probabilitiesB): **Comparing Softsoftmax Probabilities** | bar-chart: Two softmax probability vectors / Input A / Input B | values 0.35, 0.22, 0.43, 0.25, 0.61, 0.14
- ask 2 (seed bench-22-2, 2312 ms; inputs weightsA=[51,13,39] weightsB=[44,60,34]; overwrote probabilitiesA, probabilitiesB): **Comparing Softmax Probabilities** | bar-chart: Two softmax probability vectors / Input A / Input B | values 0.49, 0.13, 0.38, 0.32, 0.43, 0.25
- ask 3 (seed bench-23-3, 2076082 ms; inputs weightsA=[23,25,38] weightsB=[15,59,60]; overwrote probabilitiesA, probabilitiesB): **Comparing Multiclass Predictions** | bar-chart: Two softmax probability vectors / Input A / Input B | values 0.27, 0.29, 0.44, 0.11, 0.44, 0.45
- ask 4 (seed bench-24-4, 4857 ms; inputs weightsA=[9,7,59] weightsB=[38,25,56]; overwrote probabilitiesA, probabilitiesB): **Comparing Multiclass Softmax Probabilities** | bar-chart: Illustrative softmax probabilities / Input A / Input B | values 0.12, 0.09, 0.79, 0.32, 0.21, 0.47
- ask 5 (seed bench-25-5, 2487 ms; inputs weightsA=[24,19,26] weightsB=[30,34,51]; overwrote probabilitiesA, probabilitiesB): **Softmax probability comparison** | bar-chart: Two softmax probability vectors / Input A / Input B | values 0.35, 0.27, 0.38, 0.26, 0.3, 0.44

**MAIN, detailed**

- ask 1 (seed bench-26-1, 2419 ms): **Comparing Multiclass Predictions** | bar-chart: Two softmax probability vectors / Illustrative values; compare categories on the shared scale. / Input A / Input B | values 0.7, 0.2, 0.1, 0.15, 0.6, 0.25
- ask 2 (seed bench-27-2, 2364 ms): **Comparing Multiclass Softmax Predictions** | bar-chart: Two softmax probability vectors / Compare categories on the shared scale of probabilities. / Input A / Input B | values 0.7, 0.2, 0.1, 0.15, 0.6, 0.25
- ask 3 (seed bench-28-3, 2995 ms): **Comparing Multiclass Predictions** | bar-chart: Two softmax probability vectors / Illustrative values; compare categories on the shared scale. / Input A / Input B | values 0.7, 0.2, 0.1, 0.15, 0.6, 0.25
- ask 4 (seed bench-29-4, 2426 ms): **Comparing Multiclass Predictions** | bar-chart: Two softmax probability vectors / Illustrative values; compare categories on the shared scale. / Input A / Input B | values 0.7, 0.2, 0.1, 0.15, 0.6, 0.25
- ask 5 (seed bench-30-5, 2384 ms): **Comparing Multiclass Predictions** | bar-chart: Two softmax probability vectors / Illustrative values; compare categories on the shared scale. / Input A / Input B | values 0.7, 0.2, 0.1, 0.15, 0.6, 0.25

**BRANCH, detailed**

- ask 1 (seed bench-26-1, 2778 ms; inputs weightsA=[38,47,13] weightsB=[58,39,46]; overwrote probabilitiesA, probabilitiesB): **Comparing Multiclass Softmax Predictions** | bar-chart: Two softmax probability vectors / Illustrative values; compare categories on the shared scale. / Input A / Input B | values 0.39, 0.48, 0.13, 0.41, 0.27, 0.32
- ask 2 (seed bench-27-2, 2787 ms; inputs weightsA=[37,5,42] weightsB=[59,11,34]; overwrote probabilitiesA, probabilitiesB): **Comparing Softmax Multiclass Predictions** | bar-chart: Two softmax probability vectors / Illustrative values; compare categories on the shared scale. / prob / Input A / Input B | values 0.44, 0.06, 0.5, 0.57, 0.1, 0.33
- ask 3 (seed bench-28-3, 3422 ms; inputs weightsA=[15,75,10] weightsB=[40,45,15]; overwrote nothing): **Comparing Softmax Multiclass Predictions** | bar-chart: Two softmax probability vectors / Compare categories on the shared scale using illustrative probabilities. / Input A / Input B | values 0.15, 0.75, 0.1, 0.4, 0.45, 0.15
- ask 4 (seed bench-29-4, 2604 ms; inputs weightsA=[22,20,36] weightsB=[39,15,58]; overwrote probabilitiesA, probabilitiesB): **Comparing Multiclass Softmax Predictions** | bar-chart: Two softmax probability vectors / Illustrative values; compare categories on the shared scale. / Input A / Input B | values 0.28, 0.26, 0.46, 0.35, 0.13, 0.52
- ask 5 (seed bench-30-5, 3052 ms; inputs weightsA=[54,22,42] weightsB=[44,12,27]; overwrote probabilitiesA, probabilitiesB): **Comparing multiclass predictions with softmax** | bar-chart: Two softmax probability vectors / Illustrative values; compare categories on the shared scale. / Input A / Input B | values 0.46, 0.19, 0.35, 0.53, 0.14, 0.33

### regression-mean-baseline: What does predicting the mean give as a regression baseline?

**MAIN, brief**

- ask 1 (seed bench-31-1, 2876 ms): **Predicting the Mean as a Baseline** | coordinate-plot: A constant mean baseline / Illustrative values; the geometry shows the stated relationship. / Sample / Target / Targets / Mean prediction of 3 | values 1, 5, 0, 6, 1, 1, 2, 4, 3, 2, 4, 5, 5, 3, 3
- ask 2 (seed bench-32-2, 2547 ms): **Predicting the mean as a baseline** | coordinate-plot: A constant mean baseline / Illustrative values; the geometry shows the stated relationship. / Sample / Target / Targets / Mean prediction of 3 | values 1, 5, 0, 6, 1, 1, 2, 4, 3, 2, 4, 5, 5, 3, 3
- ask 3 (seed bench-33-3, 2479 ms): **Predicting the Mean as a Baseline** | coordinate-plot: A constant mean baseline / Illustrative values; the geometry shows the stated relationship. / Sample / Target / Targets / Mean prediction of 3 | values 1, 5, 0, 6, 1, 1, 2, 4, 3, 2, 4, 5, 5, 3, 3
- ask 4 (seed bench-34-4, 2602 ms): **Predicting the Mean as a Baseline** | coordinate-plot: A constant mean baseline / Illustrative values; the geometry shows the stated relationship. / Sample / Target / Targets / Mean prediction of 3 | values 1, 5, 0, 6, 1, 1, 2, 4, 3, 2, 4, 5, 5, 3, 3
- ask 5 (seed bench-35-5, 2244 ms): **Predicting the mean baseline** | coordinate-plot: A constant mean baseline / Illustrative values; the geometry shows the stated relationship. / Sample / Target / Targets / Mean prediction of 3 | values 1, 5, 0, 6, 1, 1, 2, 4, 3, 2, 4, 5, 5, 3, 3

**BRANCH, brief**

- ask 1 (seed bench-31-1, 9138 ms; inputs targets=[43,60,23,54,10]; overwrote nothing; rescued coordinate-plot): **Predicting the mean as a regression baseline** | coordinate-plot: A constant mean baseline / Sample / Target / Targets / Mean prediction of 38 | values 1, 5, 0, 100, 1, 43, 2, 60, 3, 23, 4, 54, 5, 10, 38
- ask 2 (seed bench-32-2, 2550 ms; inputs targets=[54,47,16,46,23]; overwrote nothing): **A constant mean baseline** | coordinate-plot: A constant mean baseline / Sample / Target / Targets / Mean prediction of 37.2 | values 1, 5, 0, 60, 1, 54, 2, 47, 3, 16, 4, 46, 5, 23, 37.2
- ask 3 (seed bench-33-3, 3016 ms; inputs targets=[33,34,27,54,43]; overwrote nothing; rescued coordinate-plot): **Predicting the Mean as a Baseline** | coordinate-plot: A constant mean baseline / Sample / Target / Targets / Mean prediction of 38.2 | values 1, 5, 20, 60, 1, 33, 2, 34, 3, 27, 4, 54, 5, 43, 38.2
- ask 4 (seed bench-34-4, 4444 ms; inputs targets=[20,19,30,7,37]; overwrote nothing; refused: explanation_bad_diagram: the rh-diagram spec is not valid (diagram.series.0.points.3: Point is outside the axis bounds; diagram.se): **A constant mean baseline** | coordinate-plot: A constant mean baseline / Sample / Target / Targets / Mean prediction of 22.6 | values 1, 5, 5, 40, 1, 20, 2, 19, 3, 30, 4, 7, 5, 37, 22.6
- ask 5 (seed bench-35-5, 2706 ms; inputs targets=[20,25,32,42,44]; overwrote nothing): **Predicting the Mean Baseline** | coordinate-plot: A constant mean baseline / Sample / Target / Targets / Mean prediction of 32.6 | values 1, 5, 0, 50, 1, 20, 2, 25, 3, 32, 4, 42, 5, 44, 32.6

**MAIN, balanced**

- ask 1 (seed bench-36-1, 4074 ms): **Predicting the Mean as a Regression Baseline** | coordinate-plot: A constant mean baseline / Illustrative values; the geometry shows the stated relationship. / Sample / Target / Targets / Mean prediction of 3 | values 1, 5, 0, 6, 1, 1, 2, 4, 3, 2, 4, 5, 5, 3, 3
- ask 2 (seed bench-37-2, 3145 ms): **Regression Baseline: Predicting the Mean** | coordinate-plot: A constant mean baseline / Illustrative values; the geometry shows the stated relationship. / Sample / Target / Targets / Mean prediction of 3 | values 1, 5, 0, 6, 1, 1, 2, 4, 3, 2, 4, 5, 5, 3, 3
- ask 3 (seed bench-38-3, 2845 ms): **Regression Baseline: Predicting the Mean** | coordinate-plot: A constant mean baseline / Illustrative values; the geometry shows the stated relationship. / Sample / Target / Targets / Mean prediction of 3 | values 1, 5, 0, 6, 1, 1, 2, 4, 3, 2, 4, 5, 5, 3, 3
- ask 4 (seed bench-39-4, 2820 ms): **Regression Baseline: Mean Prediction** | coordinate-plot: A constant mean baseline / Illustrative values; the geometry shows the stated relationship. / Sample / Target / Targets / Mean prediction of 3 | values 1, 5, 0, 6, 1, 1, 2, 4, 3, 2, 4, 5, 5, 3, 3
- ask 5 (seed bench-40-5, 2296 ms): **Regression Baseline: Predicting the Mean** | coordinate-plot: A constant mean baseline / Illustrative values; the geometry shows the stated relationship. / Sample / Target / Targets / Mean prediction of 3 | values 1, 5, 0, 6, 1, 1, 2, 4, 3, 2, 4, 5, 5, 3, 3

**BRANCH, balanced**

- ask 1 (seed bench-36-1, 3065 ms; inputs targets=[47,5,27,16,26]; overwrote nothing): **Regression Baseline: Predicting the Mean** | coordinate-plot: A constant mean baseline / Sample / Target / Targets / Mean prediction of 24.2 | values 1, 5, 0, 60, 1, 47, 2, 5, 3, 27, 4, 16, 5, 26, 24.2
- ask 2 (seed bench-37-2, 2974 ms; inputs targets=[10,20,30,40,50]; overwrote nothing): **Predicting the Mean as a Regression Baseline** | coordinate-plot: A constant mean baseline / Sample / Target / Targets / Mean prediction of 30 | values 1, 5, 0, 60, 1, 10, 2, 20, 3, 30, 4, 40, 5, 50, 30
- ask 3 (seed bench-38-3, 2698 ms; inputs targets=[10,25,30,35,56]; overwrote nothing): **Predicting the Mean as a Regression Baseline** | coordinate-plot: A constant mean baseline of 31.2 / Sample / Target / Targets / Mean prediction of 31.2 | values 1, 5, 0, 60, 1, 10, 2, 25, 3, 30, 4, 35, 5, 56, 31.2
- ask 4 (seed bench-39-4, 2946 ms; inputs targets=[16,35,41,57,43]; overwrote nothing): **Predicting the Mean Baseline** | coordinate-plot: A constant mean baseline / Illustrative values; the geometry shows the stated relationship. / Sample / Target / Targets / Mean prediction of 38.4 | values 1, 5, 0, 60, 1, 16, 2, 35, 3, 41, 4, 57, 5, 43, 38.4
- ask 5 (seed bench-40-5, 2707 ms; inputs targets=[15,25,50,51,43]; overwrote nothing): **Predicting the mean baseline** | coordinate-plot: A constant mean baseline / Sample / Target / Targets / Mean prediction of 36.8 | values 1, 5, 0, 60, 1, 15, 2, 25, 3, 50, 4, 51, 5, 43, 36.8

**MAIN, detailed**

- ask 1 (seed bench-41-1, 2548 ms): **Regression Baseline: Predicting the Mean** | coordinate-plot: A constant mean baseline / Illustrative values; the geometry shows the stated relationship. / Sample / Target / Targets / Mean prediction of 3 | values 1, 5, 0, 6, 1, 1, 2, 4, 3, 2, 4, 5, 5, 3, 3
- ask 2 (seed bench-42-2, 1988 ms): **Regression Baseline: Predicting the Mean** | coordinate-plot: A constant mean baseline / Illustrative values; the geometry shows the stated relationship. / Sample / Target / Targets / Mean prediction of 3 | values 1, 5, 0, 6, 1, 1, 2, 4, 3, 2, 4, 5, 5, 3, 3
- ask 3 (seed bench-43-3, 2257 ms): **Predicting the Mean as a Regression Baseline** | coordinate-plot: A constant mean baseline / Illustrative values; the geometry shows the stated relationship. / Sample / Target / Targets / Mean prediction of 3 | values 1, 5, 0, 6, 1, 1, 2, 4, 3, 2, 4, 5, 5, 3, 3
- ask 4 (seed bench-44-4, 2092 ms): **Predicting the mean as a regression baseline** | coordinate-plot: A constant mean baseline / Illustrative values; the geometry shows the stated relationship. / Sample / Target / Targets / Mean prediction of 3 | values 1, 5, 0, 6, 1, 1, 2, 4, 3, 2, 4, 5, 5, 3, 3
- ask 5 (seed bench-45-5, 2275 ms): **Predicting the Mean as a Regression Baseline** | coordinate-plot: A constant mean baseline / Illustrative values; the geometry shows the stated relationship. / Sample / Target / Targets / Mean prediction of 3 | values 1, 5, 0, 6, 1, 1, 2, 4, 3, 2, 4, 5, 5, 3, 3

**BRANCH, detailed**

- ask 1 (seed bench-41-1, 4522 ms; inputs targets=[5,12,15,19,26]; overwrote nothing; refused: explanation_bad_diagram: the rh-diagram spec is not valid (diagram.variables.0: Give exactly one of at or value; diagram.variables): **Predicting the Mean as a Baseline** | coordinate-plot: A constant mean baseline / Illustrative values; the geometry shows the stated relationship. / Sample / Target / Targets / Mean prediction of 15.4 | values 0, 6, 0, 30, 1, 5, 2, 12, 3, 15, 4, 19, 5, 26, 15.4
- ask 2 (seed bench-42-2, 2414 ms; inputs targets=[40,55,6,53,9]; overwrote nothing): **A Constant Mean Regression Baseline** | coordinate-plot: A constant mean baseline / Illustrative values; the geometry shows the stated relationship. / Sample / Target / Targets / Mean prediction of 32.6 | values 1, 5, 0, 70, 1, 40, 2, 55, 3, 6, 4, 53, 5, 9, 32.6
- ask 3 (seed bench-43-3, 4094 ms; inputs targets=[37,28,5,43,38]; overwrote nothing; refused: explanation_bad_calculation: result mean cannot be written at annotations.0.value): **Predicting the Mean as a Regression Baseline** | coordinate-plot: A constant mean baseline / Illustrative values; the geometry shows the stated relationship. / Sample / Target / Targets / Mean prediction of 30.2 | values 1, 5, 0, 50, 1, 37, 2, 28, 3, 5, 4, 43, 5, 38, 30.2
- ask 4 (seed bench-44-4, 1921 ms; inputs targets=[22,55,46,49,60]; overwrote nothing): **Predicting the mean as a regression baseline** | coordinate-plot: A constant mean baseline / Illustrative values; the geometry shows the stated relationship. / Sample / Target / Targets / Mean prediction of 46.4 | values 1, 5, 10, 70, 1, 22, 2, 55, 3, 46, 4, 49, 5, 60, 46.4
- ask 5 (seed bench-45-5, 2545 ms; inputs targets=[28,12,47,49,56]; overwrote nothing): **A constant mean baseline** | coordinate-plot: A constant mean baseline / Illustrative values; the geometry shows the stated relationship. / Sample / Target / Targets / Mean prediction of 38.4 | values 1, 5, 0, 60, 1, 28, 2, 12, 3, 47, 4, 49, 5, 56, 38.4

### confusion-matrix-counts: Explain a confusion matrix with exact counts.

**MAIN, brief**

- ask 1 (seed bench-46-1, 1718 ms): **Understanding a Confusion Matrix** | heatmap: Actual and predicted classes / The grid shows counts of correct and incorrect predictions. / Negative / Positive | values 90, 10, 20, 80, 0, 100, 1, 0
- ask 2 (seed bench-47-2, 2353 ms): **Understanding a Confusion Matrix** | heatmap: Actual and predicted classes / The grid shows counts of correct and incorrect predictions made by a model. / Negative / Positive | values 90, 10, 20, 80, 0, 100, 1, 0
- ask 3 (seed bench-48-3, 1922 ms): **Understanding a Confusion Matrix** | heatmap: Actual and predicted classes / The grid shows counts of correct and incorrect model predictions. / Negative / Positive | values 90, 10, 20, 80, 0, 100, 1, 0
- ask 4 (seed bench-49-4, 2302 ms): **Understanding a Confusion Matrix** | heatmap: Actual and predicted classes / The matrix compares true outcomes against model guesses. / Negative / Positive | values 90, 10, 20, 80, 0, 100, 1, 0
- ask 5 (seed bench-50-5, 2081 ms): **Confusion Matrix Counts** | heatmap: Actual and predicted classes / The highlighted 20 are actual positives predicted negative. / Negative / Positive | values 90, 10, 20, 80, 0, 100, 1, 0

**BRANCH, brief**

- ask 1 (seed bench-46-1, 2307 ms; none recorded): **Understanding a Confusion Matrix** | heatmap: Actual and predicted counts / The highlighted cells show actual positives predicted negative. / Negative / Positive | values 59, 6, 22, 53, 6, 59, 1, 0
- ask 2 (seed bench-47-2, 2286 ms; none recorded): **Confusion Matrix Counts** | heatmap: Actual and predicted classes / The highlighted cell shows actual positives predicted negative. / Negative / Positive | values 34, 9, 54, 28, 9, 54, 1, 0
- ask 3 (seed bench-48-3, 2279 ms; none recorded): **Understanding a Confusion Matrix** | heatmap: Actual and predicted classes / The highlighted cells show actual positives predicted as negative. / Negative / Positive | values 36, 29, 43, 25, 25, 43, 1, 0
- ask 4 (seed bench-49-4, 1989 ms; none recorded): **Understanding a Confusion Matrix** | heatmap: Actual and predicted classes / The highlighted 12 are actual positives predicted negative. / Negative / Positive | values 44, 50, 12, 20, 12, 50, 1, 0
- ask 5 (seed bench-50-5, 2060 ms; none recorded): **Confusion Matrix Counts** | heatmap: Actual and predicted classes / The highlighted cells show actual positives predicted as negative. / Negative / Positive | values 42, 12, 18, 46, 12, 46, 1, 0

**MAIN, balanced**

- ask 1 (seed bench-51-1, 2339 ms): **Understanding a Confusion Matrix** | heatmap: Actual and predicted classes / The highlighted 20 are actual positives predicted negative. / Negative / Positive | values 90, 10, 20, 80, 0, 100, 1, 0
- ask 2 (seed bench-52-2, 2221 ms): **Understanding a Confusion Matrix** | heatmap: Actual and predicted classes / The highlighted 20 are actual positives predicted negative. / Negative / Positive | values 90, 10, 20, 80, 0, 100, 1, 0
- ask 3 (seed bench-53-3, 2077 ms): **Confusion Matrix Counts** | heatmap: Actual and predicted classes / The highlighted 20 are actual positives predicted negative. / Negative / Positive | values 90, 10, 20, 80, 0, 100, 1, 0
- ask 4 (seed bench-54-4, 1988 ms): **Understanding a Confusion Matrix** | heatmap: Actual and predicted classes / The highlighted 20 are actual positives predicted negative. / Negative / Positive | values 90, 10, 20, 80, 0, 100, 1, 0
- ask 5 (seed bench-55-5, 2394 ms): **Confusion Matrix Counts** | heatmap: Actual and predicted classes / The highlighted 20 are actual positives predicted negative. / Negative / Positive | values 90, 10, 20, 80, 0, 100, 1, 0

**BRANCH, balanced**

- ask 1 (seed bench-51-1, 1797 ms; none recorded): **Confusion Matrix Counts** | heatmap: Actual and predicted classes / The highlighted cell shows actual positives predicted negative. / Negative / Pos | values 11, 13, 23, 18, 11, 23, 1, 0
- ask 2 (seed bench-52-2, 2093 ms; none recorded): **Confusion Matrix Counts** | heatmap: Actual and predicted classes / The highlighted cells show true values and model predictions. / Negative / Positive | values 42, 34, 13, 53, 8, 53, 0, 1
- ask 3 (seed bench-53-3, 2331 ms; none recorded): **Confusion matrix with counts** | heatmap: Actual and predicted classes / The highlighted cell shows actual positives predicted as negative. / Negative / Positive | values 57, 7, 33, 36, 7, 57, 1, 0
- ask 4 (seed bench-54-4, 1872 ms; none recorded): **Confusion Matrix Counts** | heatmap: Actual and predicted classes / The highlighted cell shows actual positives predicted negative. / Negative / Positive | values 42, 14, 6, 37, 6, 42, 1, 0
- ask 5 (seed bench-55-5, 2216 ms; none recorded): **Confusion Matrix Counts** | heatmap: Actual and predicted classes / The highlighted cell shows actual positives predicted as negative. / Negative / Positive | values 60, 8, 15, 41, 8, 60, 1, 0

**MAIN, detailed**

- ask 1 (seed bench-56-1, 2477 ms): **Confusion Matrix Counts** | heatmap: Actual and predicted classes / The highlighted 20 are actual positives predicted negative. / Negative / Positive | values 90, 10, 20, 80, 0, 100, 1, 0
- ask 2 (seed bench-57-2, 2014 ms): **Confusion Matrix Counts** | heatmap: Actual and predicted classes / The highlighted 20 are actual positives predicted negative. / Negative / Positive | values 90, 10, 20, 80, 0, 100, 1, 0
- ask 3 (seed bench-58-3, 2331 ms): **Confusion Matrix Counts** | heatmap: Actual and predicted classes / The highlighted 20 are actual positives predicted negative. / Negative / Positive | values 90, 10, 20, 80, 0, 100, 1, 0
- ask 4 (seed bench-59-4, 2145 ms): **Confusion matrix with exact counts** | heatmap: Actual and predicted classes / The highlighted 20 are actual positives predicted negative. / Negative / Positive | values 90, 10, 20, 80, 0, 100, 1, 0
- ask 5 (seed bench-60-5, 2113 ms): **Confusion Matrix Counts** | heatmap: Actual and predicted classes / The highlighted cell shows 20 actual positives predicted as negative. / Negative / Positive | values 90, 10, 20, 80, 0, 100, 1, 0

**BRANCH, detailed**

- ask 1 (seed bench-56-1, 1813 ms; none recorded): **Confusion Matrix Counts** | heatmap: Actual and predicted classes / The highlighted entry shows actual positives predicted negative. / Negative / Positive | values 30, 54, 55, 24, 24, 55, 1, 0
- ask 2 (seed bench-57-2, 2234 ms; none recorded): **Confusion Matrix Counts** | heatmap: Actual and predicted classes / The highlighted 12 are actual positives predicted negative. / Negative / Positive | values 32, 15, 12, 44, 12, 44, 1, 0
- ask 3 (seed bench-58-3, 2193 ms; none recorded): **Confusion Matrix Counts** | heatmap: Actual and predicted classes / The highlighted count 33 represents actual positives predicted negative. / Negative / Positive | values 41, 32, 33, 53, 32, 53, 1, 0
- ask 4 (seed bench-59-4, 1959 ms; none recorded): **Confusion Matrix Counts** | heatmap: Actual and predicted classes / The highlighted cell shows 13 false negatives where actual positives were predicted negative. / Negative / True Positi... | values 52, 20, 13, 35, 13, 52, 1, 0
- ask 5 (seed bench-60-5, 2506 ms; none recorded; rescued heatmap): **Confusion Matrix Counts** | heatmap: Actual and predicted classes / The highlighted cells show actual positives predicted negative. / Negative / Positive | values 50, 34, 18, 58, 18, 58, 1, 0

### ml-self-attention-token-links: When the word sat attends to the sentence the cat sat on the mat, which words matter most?

**MAIN, brief**

- ask 1 (seed bench-61-1, 2317 ms): **How sat attends to the sentence** | token-links: How sat attends to the sentence / Thicker arrows carry more weight, and all six weights sum to 1. | values 2, 0.05, 0.45, 0.15, 0.1, 0.05, 0.2
- ask 2 (seed bench-62-2, 4673 ms; refused: explanation_bad_token: a {{d:...}} token was left in the card (its diagram is not valid, or it sits inside a diagram or a question): **How sat attends to the sentence** | token-links: How “sat” attends to the sentence / Thicker arrows carry more weight. In this example, the six weights from “sat” sum to 1. | values 2, 0.05, 0.45, 0.15, 0.1, 0.05, 0.2
- ask 3 (seed bench-63-3, 2001 ms): **How sat attends to the sentence** | token-links: How sat attends to the sentence / Thicker arrows show larger weights. In this example, the weights from sat sum to 1. | values 2, 0.05, 0.45, 0.15, 0.1, 0.05, 0.2
- ask 4 (seed bench-64-4, 1916 ms): **How sat attends to the sentence** | token-links: How “sat” attends to the sentence / Thicker, darker arrows carry more weight. In this unmasked example, the six weights from “sat” sum to 1. | values 2, 0.05, 0.45, 0.15, 0.1, 0.05, 0.2
- ask 5 (seed bench-65-5, 2460 ms): **How sat attends to the sentence** | token-links: How “sat” attends to the sentence / Thicker, darker arrows carry more weight. In this unmasked example, the six weights from “sat” sum to 1. | values 2, 0.05, 0.45, 0.15, 0.1, 0.05, 0.2

**BRANCH, brief**

- ask 1 (seed bench-61-1, 2166 ms; none recorded): **How sat attends to a sentence** | token-links: How sat attends to the sentence / Thicker, darker arrows carry more weight. In this unmasked example, the six weights from sat sum to 1. | values 2, 0.1, 0.2, 0.4, 0.1, 0.1, 0.1
- ask 2 (seed bench-62-2, 2426 ms; none recorded): **How sat attends to the sentence** | token-links: How sat attends to the sentence / Thicker arrows carry more weight. In this unmasked example, the six weights from sat sum to 1. | values 2, 0.1, 0.4, 0.2, 0.1, 0.1, 0.1
- ask 3 (seed bench-63-3, 2346 ms; none recorded): **How sat attends to the sentence** | token-links: How sat attends to the sentence / Thicker, darker arrows carry more weight. In this unmasked example, the six weights from sat sum to 1.0. | values 2, 0.05, 0.45, 0.25, 0.05, 0.05, 0.15
- ask 4 (seed bench-64-4, 2916 ms; none recorded): **How sat attends to the sentence** | token-links: How sat attends to the sentence / Thicker, darker arrows carry more weight. In this unmasked example, the six weights from sat sum to 1. | values 2, 0.05, 0.52, 0.05, 0.05, 0.05, 0.28
- ask 5 (seed bench-65-5, 2286 ms; none recorded): **How sat attends to the sentence** | token-links: How sat attends to the sentence / Thicker, darker arrows carry more weight. In this unmasked example, the six weights from sat sum to 1. | values 2, 0.2, 0.45, 0.14, 0.05, 0.1, 0.06

**MAIN, balanced**

- ask 1 (seed bench-66-1, 2246 ms): **Self-attention weights for sat** | token-links: How sat attends to the sentence / Thicker arrows carry more weight. The six weights from sat sum to 1. | values 2, 0.05, 0.45, 0.15, 0.1, 0.05, 0.2
- ask 2 (seed bench-67-2, 2602 ms): **How “sat” attends to the sentence** | token-links: How “sat” attends to the sentence / Thicker, darker arrows carry more weight. In this unmasked example, the six weights from “sat” sum to 1. | values 2, 0.05, 0.45, 0.15, 0.1, 0.05, 0.2
- ask 3 (seed bench-68-3, 2563 ms): **How “sat” attends to the sentence** | token-links: How “sat” attends to the sentence / Thicker, darker arrows carry more weight. In this unmasked example, the six weights from “sat” sum to 1. | values 2, 0.05, 0.45, 0.15, 0.1, 0.05, 0.2
- ask 4 (seed bench-69-4, 3282 ms): **How “sat” attends to the sentence** | token-links: How “sat” attends to the sentence / Thicker, darker arrows carry more weight. In this unmasked example, the six weights from “sat” sum to one. | values 2, 0.05, 0.45, 0.15, 0.1, 0.05, 0.2
- ask 5 (seed bench-70-5, 2284 ms): **How sat attends to the sentence** | token-links: How “sat” attends to the sentence / Thicker, darker arrows carry more weight. In this unmasked example, the six weights from “sat” sum to 1. | values 2, 0.05, 0.45, 0.15, 0.1, 0.05, 0.2

**BRANCH, balanced**

- ask 1 (seed bench-66-1, 3308 ms; none recorded): **How sat attends to the sentence** | token-links: How “sat” attends to the sentence / Thicker, darker arrows carry more weight. In this unmasked example, the six weights from “sat” sum to 1.0. | values 2, 0.1, 0.4, 0.2, 0.1, 0.1, 0.1
- ask 2 (seed bench-67-2, 6423 ms; none recorded; rescued token-links): **How “sat” attends to a sentence** | token-links: Weights from “sat” to the sentence / Thicker arrows carry more weight. In this illustrative example, the six weights sum to 1. | values 2, 0.06, 0.03, 0.23, 0.26, 0.09, 0.33
- ask 3 (seed bench-68-3, 2231 ms; none recorded): **How “sat” attends to the sentence** | token-links: How “sat” attends to the sentence / Thicker, darker arrows carry more weight. In this unmasked example, the six weights from “sat” sum to 1.0. | values 2, 0.1, 0.4, 0.2, 0.1, 0.1, 0.1
- ask 4 (seed bench-69-4, 2542 ms; none recorded): **How sat attends to the sentence** | token-links: Attention weights from sat / Thicker, darker arrows carry more weight. In this unmasked example, the six weights from sat sum to 1.0. | values 2, 0.13, 0.54, 0.1, 0.05, 0.06, 0.12
- ask 5 (seed bench-70-5, 2625 ms; none recorded): **Self-attention weights for sat** | token-links: How sat attends to the sentence / Thicker arrows carry more weight. In this unmasked example, the six weights from sat sum to 1.0. | values 2, 0.05, 0.32, 0.45, 0.03, 0.05, 0.1

**MAIN, detailed**

- ask 1 (seed bench-71-1, 2260 ms): **Attention weights for sat** | token-links: How sat attends to the sentence / Thicker, darker arrows carry more weight. In this unmasked example, the six weights from sat sum to 1. | values 2, 0.05, 0.45, 0.15, 0.1, 0.05, 0.2
- ask 2 (seed bench-72-2, 3690 ms; refused: explanation_bad_token: a {{d:...}} token was left in the card (its diagram is not valid, or it sits inside a diagram or a question): **How “sat” attends to the sentence** | token-links: How “sat” attends to the sentence / Thicker arrows carry more weight. In this unmasked example, the weights sum to 1, and the heaviest weight is 0.45... | values 2, 0.05, 0.45, 0.15, 0.1, 0.05, 0.2
- ask 3 (seed bench-73-3, 2864 ms): **How sat attends to the sentence** | token-links: How sat attends to the sentence / Thicker arrows carry more weight. In this example, the six weights from sat sum to 1, with cat receiving the heavie... | values 2, 0.05, 0.45, 0.15, 0.1, 0.05, 0.2
- ask 4 (seed bench-74-4, 2076 ms): **How sat attends to the sentence** | token-links: How “sat” attends to the sentence / Thicker, darker arrows carry more weight. In this unmasked example, the six weights from “sat” sum to 1. | values 2, 0.05, 0.45, 0.15, 0.1, 0.05, 0.2
- ask 5 (seed bench-75-5, 3288 ms; refused: explanation_bad_token: a {{d:...}} token was left in the card (its diagram is not valid, or it sits inside a diagram or a question): **Self-Attention Weights for "sat"** | token-links: How “sat” attends to the sentence / Thicker arrows carry more weight. The six weights from “sat” sum to 1, with the largest weight 0.45 on “cat”. | values 2, 0.05, 0.45, 0.15, 0.1, 0.05, 0.2

**BRANCH, detailed**

- ask 1 (seed bench-71-1, 2583 ms; none recorded): **Self-attention weights for sat** | token-links: How sat attends to the sentence / Thicker, darker arrows carry more weight. In this unmasked example, the six weights from sat sum to 1.0. | values 2, 0.05, 0.33, 0.16, 0.05, 0.06, 0.35
- ask 2 (seed bench-72-2, 2682 ms; none recorded): **Self-Attention Weights for “sat”** | token-links: How “sat” attends to the sentence / Thicker, darker arrows carry more weight. In this unmasked example, the six weights from “sat” sum to 1.0. | values 2, 0.05, 0.35, 0.4, 0.05, 0.05, 0.1
- ask 3 (seed bench-73-3, 2812 ms; none recorded): **How sat attends to the sentence** | token-links: How “sat” attends to the sentence / Thicker, darker arrows carry more weight. In this unmasked example, the six weights from “sat” sum to 1. | values 2, 0.11, 0.34, 0.43, 0.09, 0.01, 0.02
- ask 4 (seed bench-74-4, 5092 ms; none recorded; refused: explanation_bad_token: {{d:1.diagram.queries.0.weights.1}} does not name a number in diagram 1. A number the figure computes is wr; FALLBACK PROVIDER): **no card: provider_error**
- ask 5 (seed bench-75-5, 2791 ms; none recorded): **How sat attends to the sentence** | token-links: How sat attends to the sentence / Thicker, darker arrows carry more weight. In this unmasked example, the six weights from sat sum to 1.0. | values 2, 0.19, 0.26, 0.28, 0.08, 0.11, 0.08

### The fallback asks

- softmax-probabilities ask 1 (seed bench-76-1): inputs weightsA=[55,29,44] weightsB=[57,12,54]; overwrote probabilitiesA, probabilitiesB | **Comparing Softmax Predictions** | bar-chart: Two softmax probability vectors / Input A / Input B | values 0.43, 0.23, 0.34, 0.46, 0.1, 0.44
- softmax-probabilities ask 2 (seed bench-77-2): inputs weightsA=[18,6,46] weightsB=[5,26,22]; overwrote probabilitiesA, probabilitiesB | **Comparing Multiclass Predictions** | bar-chart: Two softmax probability vectors / Input A / Input B | values 0.26, 0.08, 0.66, 0.09, 0.49, 0.42
- regression-mean-baseline ask 1 (seed bench-78-1): inputs targets=[45,18,34,28,50]; overwrote nothing | **Regression baseline of the mean** | coordinate-plot: A constant mean baseline / Sample / Target / Targets / Mean prediction of 35 | values 1, 5, 10, 55, 1, 45, 2, 18, 3, 34, 4, 28, 5, 50, 35
- regression-mean-baseline ask 2 (seed bench-79-2): inputs targets=[10,20,30,40,50]; overwrote nothing | **Predicting the Mean as a Regression Baseline** | coordinate-plot: A constant mean baseline / Sample / Target / Targets / Mean prediction of 30 | values 1, 5, 0, 50, 1, 10, 2, 20, 3, 30, 4, 40, 5, 50, 30
- confusion-matrix-counts ask 1 (seed bench-80-1): none recorded | **Confusion Matrix Counts** | heatmap: Actual and predicted counts / The counts show true negatives, false positives, false negatives, and true positives. / Negative / Positive | values 23, 8, 41, 13, 8, 41
- confusion-matrix-counts ask 2 (seed bench-81-2): none recorded | **Confusion Matrix Counts** | heatmap: Actual and predicted classes / The highlighted cell shows actual positives predicted negative. / Negative / Positive | values 33, 8, 57, 38, 8, 57, 1, 0
- ml-self-attention-token-links ask 1 (seed bench-82-1): none recorded | **Self-Attention Weights for Sat** | token-links: How “sat” attends to the sentence / Thicker, darker arrows carry more weight. In this unmasked example, the six weights from “sat” sum to 1. | values 2, 0.05, 0.45, 0.25, 0.05, 0.05, 0.15
- ml-self-attention-token-links ask 2 (seed bench-83-2): none recorded | **Self-Attention Weights for Sat** | token-links: How “sat” attends to the sentence / Thicker arrows carry more weight. In this unmasked example, the six weights from “sat” sum to 1.0. | values 2, 0.1, 0.2, 0.4, 0.1, 0.1, 0.1



## Every lost ask with all its events, verbatim (also in lost-asks.md)


3 asks without a card (all arms, all sets). Each block: idx, arm, set, reference, depth, ask, seed, error code, failure message, attempts, then the events array exactly as recorded.

## idx 12, MAIN, four, top-k, detailed, ask 2, seed bench-12-2

errorCode: provider_error

failureMessage: Artifact generation unavailable (model HTTP 404). Try again.

attempts: [{"provider":"google","model":"gemini-3.5-flash-lite","outcome":"validation_error","repairs":1,"failedOn":["validation_error","validation_error"],"issues":["explanation_missing_visual: the card needs one to three visuals, an rh-diagram or an rh-illustration fence, each with prose before and after it; add one that shows what the question asks."]},{"provider":"fireworks","model":"accounts/fireworks/models/gpt-oss-120b","outcome":"provider_error"}]

events:

```json
[
 {
  "event": "learn_artifact_invalid",
  "primitive": "explanation",
  "attempt": 0,
  "error": "explanation_missing_visual: the card needs one to three visuals, an rh-diagram or an rh-illustration fence, each with prose before and after it; add one that shows what the question asks."
 },
 {
  "event": "learn_artifact_invalid",
  "primitive": "explanation",
  "attempt": 1,
  "error": "explanation_missing_visual: the card needs one to three visuals, an rh-diagram or an rh-illustration fence, each with prose before and after it; add one that shows what the question asks."
 }
]
```

## idx 14, MAIN, four, top-k, detailed, ask 4, seed bench-14-4

errorCode: provider_error

failureMessage: Artifact generation unavailable (model HTTP 404). Try again.

attempts: [{"provider":"google","model":"gemini-3.5-flash-lite","outcome":"validation_error","repairs":1,"failedOn":["validation_error","validation_error"],"issues":["explanation_missing_visual: the card needs one to three visuals, an rh-diagram or an rh-illustration fence, each with prose before and after it; add one that shows what the question asks."]},{"provider":"fireworks","model":"accounts/fireworks/models/gpt-oss-120b","outcome":"provider_error"}]

events:

```json
[
 {
  "event": "learn_artifact_invalid",
  "primitive": "explanation",
  "attempt": 0,
  "error": "explanation_missing_visual: the card needs one to three visuals, an rh-diagram or an rh-illustration fence, each with prose before and after it; add one that shows what the question asks."
 },
 {
  "event": "learn_artifact_invalid",
  "primitive": "explanation",
  "attempt": 1,
  "error": "explanation_missing_visual: the card needs one to three visuals, an rh-diagram or an rh-illustration fence, each with prose before and after it; add one that shows what the question asks."
 }
]
```

## idx 74, BRANCH, four, ml-self-attention-token-links, detailed, ask 4, seed bench-74-4

errorCode: provider_error

failureMessage: Artifact generation unavailable (model HTTP 404). Try again.

attempts: [{"provider":"google","model":"gemini-3.5-flash-lite","outcome":"validation_error","repairs":1,"failedOn":["validation_error","validation_error"],"issues":["explanation_bad_token: {{d:1.diagram.queries.0.weights.1}} does not name a number in diagram 1. A number the figure computes is written as {{d:N.path}} (the figure's own number, filled in by the server), never typed"]},{"provider":"fireworks","model":"accounts/fireworks/models/gpt-oss-120b","outcome":"provider_error"}]

events:

```json
[
 {
  "event": "learn_artifact_invalid",
  "primitive": "explanation",
  "attempt": 0,
  "error": "explanation_bad_token: {{d:1.diagram.queries.0.weights.1}} does not name a number in diagram 1. A number the figure computes is written as {{d:N.path}} (the figure's own number, filled in by the server), never typed"
 },
 {
  "event": "learn_artifact_invalid",
  "primitive": "explanation",
  "attempt": 1,
  "error": "explanation_bad_token: {{d:1.diagram.queries.0.weights.1}} does not name a number in diagram 1. A number the figure computes is written as {{d:N.path}} (the figure's own number, filled in by the server), never typed"
 }
]
```


## What is prepared and withheld (pass line met)

**Release 171, pin name `171-same-json-four`, prepared and previewed; the launcher has not been run and nothing was pushed to main.** The lead re-read the remote and the queue files itself.

- **Candidate:** `feat/same-json-four` at 08eab43131a6a02fe58b70723b144c510d4c4d50 (pushed). Main on the remote was b29b6bdd7f17c8b700aca15875f99fe7b6a377ae at the start, after the recovery push and when the lead checked; it is an ancestor of the candidate, so the release fast-forwards.
- **Recovery branch:** `recovery/same-json-four-171` at cd399c4acb7ed30fae351ac0c30348a07b8360ef: one commit whose parent is 08eab4313 and whose tree, 3638bc6fe6b1619ca42051ceaf3f304edb5bb4f0, equals main's tree (checked by the lead). Cut with `recovery.sh 08eab431... 171 same-json-four`, as for 170.
- **Preview: PREVIEW OK (exit 0).** Clone `rabbit-hole-web-dev-r171-int` (https://rabbit-hole-web-dev-r171-int.tryrabbithole.workers.dev; clones refuse sign-in, the launcher is the signed-in path), build `a514c9de0206`, MVP record `def29a3b2429206f` ("build pass, affected-tests pass, smoke pass, preview pass; ... broad CI and the release gate bypassed"). Log `C:/s/spec/logs/preview-171-same-json-four-2026-11-25T19-58-13-384Z.log`. No Cloudflare error 10067, no clone deleted. The smoke list is release 170's (it does not name this candidate's new test files; the automatic affected-tests step ran the changed and new web and control-plane tests).
- **The first preview attempt stopped at affected-tests** (1339 of 1340): `scripts/topic-pipeline/test/reference-linter.test.mjs` failed with `ERR_MODULE_NOT_FOUND: js-tiktoken`. This candidate changes reference data, so that test is now selected, and the worktree had no `scripts/topic-pipeline/node_modules`. The release agent added a second junction (`C:\s\r171-int\scripts\topic-pipeline\node_modules` to `C:\s\teaching-palette\scripts\topic-pipeline\node_modules`, same way as the root one); the worktree stayed clean. Any later release worktree whose change selects that test needs the same junction. The failed attempt's output is kept (`preview-171-same-json-four-run.attempt1.out`); it deployed nothing.
- **Launcher (prepared, not run):** `C:\s\spec\release-queue\release-171-same-json-four.cmd` (CRLF, 64 of 64 lines). Against release 170's launcher exactly 4 lines differ: the comment on line 2, the echo on line 15, `call :one 171 08eab43131a6a02fe58b70723b144c510d4c4d50` on line 18, `set "PIN=%N%-same-json-four"` on line 37 (checked by the lead with diff). Beside it: `171-same-json-four.pins` (SHA 08eab4313..., MAIN_PREV b29b6bdd7..., W C:/s/r171-int, RECOVERY recovery/same-json-four-171; the label is 685 characters and has no double quote, backtick, dollar sign or backslash), `preview-171-same-json-four.mjs`, `run-preview-171-same-json-four.sh`; generator `C:/s/gen1-prep/mk-release-171.mjs`.
- **What the label says is in the release:** the four references' same-JSON change (softmax-probabilities and mean-baseline: the author chooses the inputs, the server computes the numbers that follow; confusion-matrix-counts and ml-self-attention-token-links: declared as needing no function), the rescue of a visual tagged with a kind name, the prose-number check only where a function ran, top-k parked and unchanged; the Gemini requests change for these four references only (738 of 738 other prompts identical to main). No flag, no migration, no renderer change.
- **Not measured:** bundle size (the dry run is refused: not measured: refused).

**Two choices for the reviewer before the owner's GO** (if either is ordered, the candidate gets a new commit and release 171 is cut again; both leave every request unchanged): (1) the `TREE_SCANS` entry in `scripts/mvp-fast-path.mjs` that makes the declarations test run on a reference-file change (diff above); (2) six rows in `scripts/ci/check-map.json` for the six new unclassified files.

**Release order against M2 (the risk to read).** M2 (`feat/same-json-task1`, 547ac84d8, a pure move of the system text into eight Markdown files) is cut from main b29b6bdd7 and M1 from the same-JSON branch; they edit the same model-facing text (M1: the number rule, the examples heading, `INPUTS_RULE`; M2: moves those strings into the .md files). `git merge-tree` of the two tips reports **content conflicts in `packages/control-plane/src/agents/learn-artifact.js` and `packages/control-plane/src/explanation-references.js`** (the other files merge). So whichever is released second must be redone on the first: if M1 goes first, M2 (and everything built on it, M3a to M3c) has to be re-made on M1's text (the files regenerated from M1's strings and the guard re-run against M1's tip instead of main); if M2 goes first, M1's two text changes have to be written into the Markdown files and M1's recovery branch (main's tree before M2) would roll M2 back and be re-cut. The second release's MAIN_PREV also stops at its first check until it is changed. This is the same shape as 169 and 170.

**Created, for clean-up after the release (nothing removed yet):** worktree `C:/s/r171-int` with two junctions (`C:\s\r171-int\node_modules`, `C:\s\r171-int\scripts\topic-pipeline\node_modules`; remove only with `cmd //c "rmdir <path>"`); preview clone `rabbit-hole-web-dev-r171-int`; remote branch `recovery/same-json-four-171` (keep); worktree `C:/s/sj-four` (the candidate) and its junction; `C:/s/same-json-run/four-trees/{before,after}` (extracts with junctions); `C:/s/sj-four-out/main` (a 412 MB extract); scratch folders `C:/s/sj-verify`, `C:/s/sj-conform`, `C:/s/sj-list`, `C:/s/sj-list-tree` (with junction).

## The verifier's other doubts (all low unless marked), ranked

1. (Medium, CI, not in the three commits) The MVP fast path misses the declarations test for 81 of 116 reference and data files: see the diff above.
2. (Medium for a merge, CI) 6 unclassified files from the change set keep `check-map.test.mjs` red (40 against main's 34): see above.
3. (Low) `trace.rescuedVisual` double-counts across a repair or a fallback answer.
4. (Low) The rescue rule takes any string tag as written (`'Diagram'`, `''`, `' diagram'` are rescued), per the order's literal wording.
5. (Low) A rescued item that also carries `p`/`a`/`c`: the picture option wins in `branchFor`, the spec is stripped and no fence is made (same output as main). `fillFormulaSeries` (flag-gated) reads only `k === 'diagram'`, so rescued and `k:'spec'` items skip it.
6. (Low) The test weakening listed above; the line "computed results count as printed" (explanation-calculation.js:120, decision (b) keeps it) has no test of its own (pre-existing; mutating it away leaves every test green).
7. (Low) `parked.md`'s heading says "15 asks: why they were refused" while its five counts sum to 11 and 4 asks were lost on build 2; the counts follow the order.
8. (Low) The frozen-list note now says both "Never add an id." and "One id was added once".

## Not checked

- **The Fireworks fallback request's behaviour** (the model is not reachable in the bench: see Read first, item 1). No other fallback model was tried.
- No browser, no preview of a card by eye, no production read; the numbers above are counts, not a judgement of the cards: the reviewer recomputes them from `results.jsonl`.
- The measurement is one run of 75 asks per arm (a failure of one ask moves the delivered count by 1); the pass line is the order's.
- `make test-unit` (python, motion, evals, scripts, ci suites) was not run, only the web and control-plane suites; the full control-plane suite was run once by the builder (clean) and once by the verifier (disturbed by the suspension).
- Bundle size and startup of the release: not measured (the bundle-size dry run is refused here).
- Whether other server correctors that rebuild diagram objects (`learn-primitives.js:1076`, flow, tree and relationship kinds only) drop `variables`: no declared reference uses those kinds.
- The exact counts 5 / 2 / 2 / 1 / 1 in parked.md against raw ask logs (the builder re-tallied them from build-2/results.jsonl: 15 top-k asks, 4 with no card).

## Files beside this report

`results.jsonl` (the 158 runs), `results-aborted-network.jsonl` (the 3 set aside), `results-before-resume.jsonl` (the first run as it stood), `plan.json`, `mk-plan-four.mjs`, `run-four.mjs` (the full-build harness plus the field `rescuedVisual`), `report-four.mjs` (the tables; it counts, it does not judge), `run-part1.log` and `run-part2.log`, `guards.json`, `guards.mjs`, `hashes-main.json`, `hashes-branch.json`, `lost-asks.md` (the lost asks with all their events, also reproduced above), `inspect-*.mjs` (the small read-only scripts behind the Read-first facts), `verifier/` (the verifier's battery, prose battery and fast-path scripts).

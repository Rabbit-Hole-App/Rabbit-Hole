# M2 (spec task 1): the author's system text in eight Markdown files (feat/same-json-task1)

Written by the lead on 2026-11-25 from the builder lane's report and an independent verifier's report; the lead pushed the branch and read the CI runs it triggered. Nothing is released and no launcher has been prepared or run (see "What is prepared and withheld").

**Pass (no provider call): MET, and the verifier found no difference in any request byte.** Request guard against main b29b6bdd7: 742 prompts x 4 requests identical 742, differing 0. Hashes: 0 ids moved in every field. Both suites as on main.

## Read first

1. **A second release of M1 and M2 conflicts.** M1 (`feat/same-json-four`, release 171 prepared) and this branch edit the same model-facing strings in different ways: `git merge-tree` of the two tips reports content conflicts in `packages/control-plane/src/agents/learn-artifact.js` and `packages/control-plane/src/explanation-references.js`. Whichever is released second has to be redone on the first (M1 first: this branch is regenerated from M1's strings and its guard re-run against M1's tip; M2 first: M1's two text changes, the number rule and the examples heading, become edits of the .md files and M1's recovery branch is re-cut). M3a, M3b and M3c are built on this branch and move with it. Decision A of the M1 report asks the reviewer which goes first.
2. **A push of this branch runs every CI check.** `packages/control-plane/package.json` (the npm script the order asks for) and `scripts/ci/check-map.json` (the rows the order asks for) are both `broad` paths: the repo's own `affected.mjs` on this branch's 23 paths selects 104 of 104 Linux checks plus 26 unit tests for fast-e2e, and `verify-plan.mjs` says `all` (every suite and both builds); without those two paths it would select 6 checks and the web and control-plane suites. The tutor-prompt precedent did the same. The branch was pushed once (the MVP's binding push); runs 45694171007 (fast-e2e) and 45694170883 (verify) started 2026-11-25 20:21 UTC; their minutes are not in this report (they were still running when it was written). A later edit of one .md file selects 0 browser checks and 5 unit tests.
3. **`MATH_FORMAT` is a slot, not text in the file.** `explanation-numbers-and-maths.md` holds a `{% slot math-format %}`; the 279 characters of `MATH_FORMAT` stay in `agents/math-format.js` (shared by chat and many prompts, import-free for the browser). So that one file does not show everything the model reads for its section. The spec says part 3 is "sent as written"; this is the one place where it is not.
4. **The reviewer's one-request numbers reproduce except three:** Card layout 3,866, Diagram kinds 7,018, Visuals 723 and Output format 775 reproduce; Numbers and maths is 960 here (the reviewer: 956), the tool description is 14,629 (14,625), and "# Examples" was 973 for the first documented prompt planned as its own kind (2,000). The same numbers come out on ab40f5dc9, on main b29b6bdd7 and on the branch, so they are not a drift between those trees; the Examples size depends on which references are chosen, and the reviewer's request may differ from the one measured here.

## Branch and commits

`feat/same-json-task1` at **547ac84d8f2ebae0d0ca5548696748ae69d046d0** (pushed, no force), cut from main b29b6bdd7 (release 170). Five commits, plain messages, no trailers; `git diff --stat b29b6bdd7..HEAD`: 23 files, +371 -56.

| commit | what |
|---|---|
| 30a3ebe4a | the eight section files, the generator `scripts/build-explanation-prompts.mjs`, the generated module `src/explanation-prompts.generated.js`, the loader `src/explanation-prompt.js`, the npm script `prompts:build:explanation` |
| 9d4ef7ce5 | wiring: the author's system text is read from the section files (8 modules: agents/learn-artifact.js, chat-depth.js, explanation-fast-chain.js, explanation-interactions.js, explanation-planner.js, explanation-references.js, learn-artifact.js, learn-primitives.js) |
| b24fdcf9d | `test/explanation-prompt-files.test.js` (6 tests: the generated module is in step, each heading has one file, no marker reaches a request, the loader refuses malformed markers, planned wording is filled correctly) and check-map rows |
| de288088b | `ponytail:` comments on the model-facing pieces that stay in code |
| 547ac84d8 | the web board-link reader test follows the prompt text into the generated module (`inline-ai-annotation.test.mjs`, 2 lines) and two more check-map rows |

## The eight files against the spec's table (characters)

The spec's sizes are for the top-k question at Balanced, main ab40f5dc9; "sent" = the text of the part as it reaches the request. The sent text of every part, heading included, is identical on ab40f5dc9, on main b29b6bdd7 and on the branch (the part SHA-1s and the whole-text SHA-1 are identical; the verifier segmented the request itself and got the same sizes). Total 16,278 on all three; tool description 14,629 on all three.

| part and file | spec | sent, heading included | sent, heading excluded | stored file (after the CRLF-to-LF and one-final-newline rule) |
|---|---|---|---|---|
| 1 `explanation-opening.md` | 440 | 443 | 443 | 1,333 |
| 2 `explanation-card-layout.md` | 3,852 | 3,866 | 3,852 | 3,866 |
| 3 `explanation-numbers-and-maths.md` | 940 | 960 | 940 | 740 |
| 4 `explanation-diagram-kinds.md` | 6,985 | 7,018 | 6,985 | 7,087 |
| 5 `explanation-depth.md` | about 1,040 | 1,044 | 1,036 | 2,603 |
| 6 `explanation-visuals.md` | 699 | 723 | 699 | 3,775 |
| 7 `explanation-examples.md` | about 1,130 | 1,144 | 1,133 | 778 |
| 8 `explanation-output-format.md` | about 1,010 | 1,028 | 1,012 | 1,109 |

The unheaded line "Based on the rules above, this card:" is 36 characters and sits in `explanation-depth.md` as its own block (`lead-in`). Stored total 21,291.

Why they differ: the spec's figures leave out the heading line (14, 20, 33, 8, 24, 11 and 16 characters for parts 2 to 8); with headings removed parts 2, 3, 4 and 6 match the spec exactly, and parts 5, 7 and 8 match its "about" figures within rounding (1,036 and about 1,040; 1,133 and about 1,130; 1,012 and about 1,010). Part 1 is 443 against 440: 3 characters the lane cannot explain, identical on ab40f5dc9 and b29b6bdd7, so not a drift. The stored files differ from the sent sizes because a file holds more than one request needs: the opening has all four blocks (including the tool-route-only tool rules); the numbers file stores no `MATH_FORMAT` (740 stored + 279 slot - 59 marker characters = 960); the depth file holds all three Depth paragraphs, the lead-in and the budget block; the visuals file holds the plan template, 7 wording pieces, the no-plan block and the 2 shared sentences; the examples file holds the two heading texts only (the JSON lines come from the reference library); the markers add characters to every file that has them.

Where the files differ from the spec's description (the verifier's check B): parts 1, 3, 4 and 8 are not "sent as written", because the files hold `{% block %}` wrappers (joining characters stay in code: TOOL_RULES gets a trailing newline, part 4's closing block joins with a space; part 4's file holds two blocks, `kinds` and `closing`, the latter being `PHASE02_DIAGRAM_GUIDANCE`); part 3 has the `math-format` slot (item 3 above); part 6's file also holds the `complete` and `token-rule` blocks and the small wording blocks (`picture`, `kind`, `choose`, `any`, `no-diagram`, `second-visual`, `depth-treatment`) beside the plan and no-plan blocks, which fits "the wording with marked slots". Part 5 (three Depth paragraphs, the shared, hint and budget lines, the budget slot `cap`, the heading) and part 7 (two blocks, `stored` and `seeded`, each starting with "# Examples") match the spec.

## Offline proof

- **Request guard** (`guards.json`, the builder's run; the verifier re-ran it on its own tree copy and got the same line): "492 references, 742 prompts x 4 requests (Gemini and fallback, no plan and planned with a seed): identical 742, differing in a declared reference 0, differing in an undeclared reference 0"; undeclared prompts 742, of them identical 742. This branch declares no reference, so every difference would count.
- **Whole author request body on both routes plus 22 moved exports, main against the branch** (the builder's `matrix.mjs`): 12,288 request shapes compared (720 distinct settings), 0 differ; 22 exports, 0 differ. Shapes: tool route and fast chain, interactions on and off, formula sampler on and off, 4 depths, 14 plan shapes (none, planner failed, one kind, two offered kinds, picture, picture plus diagram, pair, pair of pictures, no depth treatment, empty visuals, kind-less diagram, box-plot, coordinate-plot, token-links), with and without a seed, plus image-source and suffix slices.
- **The verifier's own byte comparison** (`bytecmp.mjs`, written independently, 7 min 18 s): 154 exported names common to both trees (721 string leaves, 23,878 characters, plus numbers, keys and function names), **0 differences**; the branch only adds two exports (`explanationDepthSection`, `OUTPUT_FORMAT_HEADING`), nothing is removed. 114 direct calls (217,683 characters: artifactSystem and explanationSystem on each route, explanationTarget for 9 depth inputs, plan calls on 18 plan shapes) and 6,858 request bodies (about 911 million characters including the Gemini and Fireworks step requests; all 21 commands, 6 envs, all depths, with and without seed or plan, a system suffix, an image source, a selection and context, `only`), **0 differences**. `ARTIFACT_SYSTEM` and the per-primitive text of the other card commands are covered by building each of the 27 primitives alone under all 21 commands in 2 envs (1,134 builds). Sensitivity: after a one-character change in the number rule a quick run reported 1,937 differences.
- **Hashes** (`C:/s/box1-bench/hashes.mjs`, `h-main.json`, `h-branch.json`): "ids before 492, after 492, in one only 0; moved per field {schema 0, body 0, gemini 0, fireworks 0, props 0}; max Gemini properties before 350, after 350". The verifier compared them with its own script: the same.
- **Web suite** (`npm run test:unit`, heavy lock, 182 s): tests 7659, pass 7631, fail 0, skipped 27, todo 1 (main: 7659 / 7631 / 0 / 27). The first web run, before 547ac84d8, had 1 failure (`inline-ai-annotation`: "every reader of board links is known"): that test scans .js files for a pattern that the prompt text "For token-links, show..." matched in `explanation-references.js`, and the text now lives in the generated module; the reader-list key and its reason line were moved, no assertion was weakened (commit 547ac84d8). The verifier's run on a copy needed two folders its copy lacked (`viz-benchmarks/`, `benchmarks/`); after adding them the totals are the same.
- **Control-plane suite** (`npm test`, 148 s): tests 5041, pass 5028, fail 5, skipped 8. The five are `rabbit-hole-prod-config.test.js` (lines 67, 149, 181, 278, 294: the app Worker owns digrabbithole.com; FILE_JOBS; /animation; /whiteboard; ROADMAP_JOBS roadmap-jobs-1), red on main too (the verifier ran that file on the b29b6bdd7 extract: the same 5 fail).- **check-map.test.mjs**: 22 tests, 21 pass. The one red, "every tracked executable file has a class", lists the same 34 unmapped files that are unmapped at b29b6bdd7 (6 older explanation-* and reference-library-lazy modules in control-plane, `inline-fractions.js` and 27 files under web tutor-diagrams); none of them is in this branch's diff and none of the new files is listed. Rows added: 4 new, and 8 existing rows gained the new test (nothing removed, order kept); a row for the .md files wins over the `**/*.md` docs class.

## The tests of the work itself (`test/explanation-prompt-files.test.js`, 6 tests, pass; about 9 s, the marker test 33 to 41 s)

- (a) the bundled module equals what the .md files generate; proven stale-failing on a throwaway change that was reverted (a character appended to `explanation-card-layout.md`); a second test checks that the eight files exist and that a text has LF endings and no final newline. The verifier re-did it on its copy: a throwaway extra line in `explanation-numbers-and-maths.md` made 2 tests fail, and after restoring the file 6 of 6 pass; regenerating gives a module byte-identical to the committed blob whether the .md files are CRLF or LF.
- (b) each of the 7 section headings is written in exactly one file under src (every .js and .mjs under src plus the .md files in prompts/explanation, `*.generated.js` left out, because the generated module is the build copy and test (a) proves it equal); proven failing by adding a comment containing "# Depth" to `chat-depth.js` (holders: chat-depth.js and explanation-depth.md), then reverted. To satisfy it the builder reworded 9 comments that quoted a heading ("# Depth" became "the Depth section"): comment-only edits in learn-primitives.js (4), agents/learn-artifact.js, chat-depth.js, explanation-planner.js, explanation-references.js, explanation-fast-chain.js; the verifier confirmed they change no code.
- (c) no marker reaches a request: 576 requests (4 envs x 4 depths x 6 plan shapes x 2 seeds x 2 prompts); the whole body, the tool description, `assembledSystem` and the Gemini and Fireworks step system messages contain neither `{%` nor `%}`; positive checks in the same test (every heading arrives, the chosen Depth paragraph is present and the other two absent, the budget slot reads 450, the no-plan block appears only with no plan, "This card's visuals" only with a plan).
- (d) the loader refuses a duplicate block, an unclosed or unknown marker, a slot with no value, a value with no slot, an unknown block and a missing file. (e) planned wording is filled correctly for one kind, two offered kinds, picture only, picture plus diagram, pair, no depth treatment, and the token sentence.

## Marker syntax, and the proof that it occurs in none of today's texts

Block `{% block name %}` ... `{% endblock %}` (no nesting; a newline right after the opening marker and right before the closing one is not part of the block); slot `{% slot name %}`. `git grep -I -F -l '{%'` at b29b6bdd7 over the whole repository returns no text file (without `-I` only PNGs match; `%}` occurs in CSS and HTML but cannot form a marker without `{%`); the forms `{% block`, `{% endblock` and `{% slot` return 0 files; at HEAD the only text files containing `{%` are the 7 marked .md files, the generated module, the loader and the test. All 742 x 4 guard requests and the verifier's 6,858 builds equal main's byte for byte, and main has no marker. The loader throws at import on any `{%` left after parsing, and a missing or extra slot value throws. Rejected syntaxes: `{{...}}` (the text writes `{{d:...}}`), and `@@`, `<<`, `{#`, `[[[`, `<!--`, `(((` all occur in source.

## What stays in code (the brief's item 6): model-facing pieces the spec's table does not assign to a file

| piece | size | where | note |
|---|---|---|---|
| length sentence " Keep body under 3,000 characters (about 420 words): longer is refused." | 71 | `learn-artifact.js` `lengths()`, shared by every primitive's tool description | its numbers and key come from the schema; sent inside part 1's 443 characters |
| `INPUTS_RULE` | 75 | `agents/learn-artifact.js` | added only to seeded requests, right after the number rule; the spec's table assigns it to no file and task 3 says to keep it unchanged; marked with a `ponytail:` comment |
| the detailSpec sentence "If you use a detailSpec, write it as a separate visual. If a block points to it, ..." | 149 | `explanation-references.js` `diagramReferenceContext` | sent only when a chosen reference has a detailSpec (the top-k request has none); by sense it belongs in `explanation-examples.md`, but the spec says that file holds the two heading texts only; marked with a `ponytail:` comment; moving it needs the reviewer's word |
| formula-plot block `FORMULA_SERIES_GUIDANCE` | 362 | `explanation-formula-series.js` | added only when `EXPLANATION_FORMULA_SAMPLER` is on (off in production) |
| image-reading instructions `IMAGE_EXTRACTION_SYSTEM` | 551 | `inline-image-extraction.js` | added for an image source |
| suffixes other commands add | 220 to 311 (the depth note `WORDS`), 80 (the " Paid: it is proposed ..." sentence) | `chat-depth.js`, `learn-artifact.js` (`systemSuffix` is caller-supplied, trusted); the animation primitive's `SCENE_AUTHORING` | none is in an explanation request |
| `MATH_FORMAT` | 279 | `agents/math-format.js` | a slot in `explanation-numbers-and-maths.md`, filled from that module: the one place where the text the model reads for a section is not wholly in its file; the verifier notes there is no `ponytail:` comment for it |
| `EXPLANATION_OBJECTIVES` | 139, 108 and 149 | `chat-depth.js` | used by the roadmap table card, not by the explanation author |
| joining characters and numbering ("\n\n", " ", "\n", "1) ", "; ", " or ") | | code | as today |

## The verifier's doubts, ranked

1. (Medium, cost) A push of this branch runs everything (item 2 above).
2. (Low-medium, spec) `MATH_FORMAT` stays in `agents/math-format.js` behind a slot, so one file does not show all the model reads; part 4's closing block and the marker wrappers are the other places where "as written" is loose.
3. (Low) The builder's bundle figures "556.9 KB" and "564.2 KB" are the **minified** sizes; the verifier's esbuild run with the same two entry points: minified 570,327 against 577,767 bytes (+7,440), unminified 978,223 against 983,055 (+4,832), gzip about +2.5 KB. The cause is as stated: `learn-primitives.js` is already imported by the web app and now pulls in the loader and the whole generated module. The vite production build was not run.
4. (Low, bundle) The per-file `sha256` fields of the generated module are never read at run time; 8 x 64 characters ship to the browser.
5. (Low, robustness) A malformed marker throws at import, and several modules call `promptBlock` at top level, so a bad .md would stop the whole Worker, not just /explain; the tests catch it. The generator does not strip a UTF-8 BOM and the stale test would not catch one; the 742-prompt guard would.
6. (Info) "compiled at build" means a committed generated file plus a stale test, the same as the tutor-prompt precedent; no build step runs the generator. The "no marker reaches a request" test takes 33 to 41 seconds and would reject any legitimate `%}` in a future request text.
7. (Info) The other card commands share `NUMBER_RULE`, `INTRO`, `TOOL_RULES` and `DATA_RULE` with the explanation (their text is unchanged); editing `explanation-numbers-and-maths.md` or `explanation-opening.md` now also changes those cards. Task 3 plans to give the explanation its own number-rule constant.

## What is prepared and withheld

**Nothing yet.** The order asks for a preview, a recovery branch and a withheld launcher once the pass is met; the pass is met, but the release is not prepared, on purpose: it conflicts with M1's release 171 (item 1 above), and which of the two goes first decides how the other must be redone. When the reviewer rules on decision A of the M1 report, M2's release is prepared on the right base (as release 172, with its own pins, recovery branch, preview and withheld launcher), or M2 is regenerated on M1's tip first.

## Not checked

- No vite production build and no browser; no provider call, so nothing says how Gemini answers the unchanged request (every request is byte-identical, so the measurement would only measure noise).
- workerd runtime start-up of the bundled Worker (the verifier ran `wrangler deploy --dry-run` for the control-plane Worker only to bundle it: it bundles, contains `EXPLANATION_PROMPT_FILES`, has no .md import and no `readFileSync` of .md, and the only wrangler rule is a Text rule for html and py, so no text rule is needed); the packages/web app Worker dry-run (needs a built dist-dev).
- A real Linux checkout (CRLF versus LF was simulated on this machine; the generator normalizes CRLF to LF, strips one final newline and sorts ASCII file names, so a Windows and a Linux checkout give the same module; there is no .gitattributes rule for these files, as for the tutor files).
- The fast-e2e and verify runs in CI and the Playwright checks (the CI runs of the push were still in progress).
- Other consumers of `chat-depth` beyond their exported strings (roadmap generation, the explain-v2 job, chat); the repair-message builders (this diff does not touch them).
- Whether main's `rabbit-hole-prod-config` red dates from f0ae33c53.
- The reviewer's 956 and 14,625 and the 2,000-character "# Examples" are not reproduced (item 4 above).

## Files beside this report

`guards.json`, `guards.mjs`, `matrix.mjs`, `matrix.json`, `h-main.json`, `h-branch.json`, `hashes-cmp.mjs`, `item6.mjs`, and `verifier/` (the verifier's `bytecmp.mjs`, `bytecmp.json`, `bytecmp.log`, `sizes2.mjs`, `plan.mjs`, `mapdiff.mjs`, `files-check.mjs`, `guards.json`, `hashes.log`). The suite logs (1.3 MB and 0.8 MB) are not committed; their totals are quoted above.

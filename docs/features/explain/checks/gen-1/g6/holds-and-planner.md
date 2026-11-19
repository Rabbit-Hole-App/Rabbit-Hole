# GEN-1 G6: holds recomputed, roadmap planner = title and goal only

Branch feat/gen-1-g6, tip b6ccc9a14 (two commits on 77d94631f = main 8837d4a19 = release 161 merged, normal merge, normal push). The NUM-2 tolerance part of the sprint order is separate (feat/num-2, 63992e50e).

## 1. Limits (42e58e7c4)
- New `packages/control-plane/src/explanation-example-cap.js` exports EXAMPLES_CAP_CHARS = 4500, BYTES_PER_CHAR = 2, PLAN_DELTA_BYTES = 26000, QUOTE_ROOM_BYTES = 35000 and the pure helper `capExamples(text)` (cut to at most 4,500 characters at a line end when the block has one; one long line is cut at the cap). The R2 request builder (Agent Z) imports them and MUST pass the examples block through `capExamples` so the quote bound holds by construction; the wiring into the author request is not done here.
- `roadmap-generate.js`: the old EXAMPLES_BLOCK_MAX_CHARS = 14,000 and PLAN_DELTA_MAX_CHARS = 10,000 (3-byte characters) are replaced; `worstCaseBody` pads the plain body's system text with `'一'.repeat(ceil(QUOTE_ROOM_BYTES / 3))` (35,001 bytes; the byte-priced bound is learn-spend.js requestSpendBound). `request_over_bound`, the one-call budget, the stored fingerprint and the money rows are untouched; no dispatch equality check.
- Plan delta check: the existing test re-measures the plan's growth over the library prompts x 24 kinds on the roadmap Gemini profile; the measured maximum was 24,356 bytes, under 26,000.

## New holds per card (author bound, micro-USD; the figures part is 0 on these test environments), on this tree
| profile | bare body | OLD room 14,000 + 10,000 chars x 3 bytes = 72,000 bytes | NEW room 4,500 x 2 + 26,000 = 35,000 bytes (35,001 padded) |
|---|---|---|---|
| production Gemini roadmap profile (gemini-3.5-flash-lite, 0.3 micro-USD a byte) | 21,915 | 43,515 | 32,415 (= 21,915 + 35,001 x 0.3) |
| plan model (claude-opus-5, 5 micro-USD a byte) | 746,500 | 1,106,500 | 921,505 (= 746,500 + 35,001 x 5) |
The bare figures are higher than the earlier report's (21,476 / 739,175) because main moved (the lazy-schema and picture-cap releases change the plain body); the old-room column is the same formula on today's body. So the new hold is +10,500 micro-USD a card on Gemini (+US$0.0105) and +175,005 on the plan model, against +21,600 and +360,000 for the old 3-byte worst case: the new limits cost about half as much as the figures proposed before.

## Tests pinning the bound (0 fail)
roadmap-document-context.test.js 9 ('an allowance of exactly the quoted bound admits the card; one micro less refuses with no hold and no call': bound > 797,395 and < 1,200,000, comment updated), roadmap-course.test.js 21, roadmap-quote-vary.test.js 6 (the limits test: constants 4500 / 2 / 26000 / 35000, capExamples cuts a 60-reference block to the cap at a line end, the capped block JSON-escaped stays inside 2 bytes a character; the planned-and-seeded dispatch bodies stay under the quoted author bound and the plan's growth is under 26,000 bytes over the library prompts x 24 kinds).

## 2. Roadmap planner = step title and goal only (b6ccc9a14)
- With `planned: true` gone, generateArtifact runs the planner for roadmap cards. The roadmap input carries `planContext: null` (roadmap-generate.js authorInput; the author still gets its `context`); `learn-artifact.js` line 189 reads `'planContext' in input ? input.planContext : input.context || null`. The planner question is the roadmap's args `${stepTitle}: ${stepGoal}` (already). The typed route is unchanged (no planContext key: it sends input.context as before).
- Tests: explanation-planner.test.js (new): the typed route sends its context to the planner, `planContext: null` sends none, the question is the title and goal; roadmap-course.test.js: every planner call of a roadmap course has context null and a 'title: goal' question.

## Guards
470 request hashes identical to main (C:/s/gen1-prep/h-g6x.json vs h-start2.json); 474-row planner replay identical (replay-g6x.json vs replay-start2.json); main 8837d4a19 (161) changes no request bytes, so the START-2 baselines still hold. Tests 0 fail: 51 files (all roadmap-*, learn-artifact, explanation-vary, explanation-planner, learn-inline*, explanation-fast-chain, explanation-picture-cap): 606 tests. Not run: the whole control-plane suite, any web test, any provider.

## The harness-warning transcript read
checks/gen-1/g6/transcript-read.md stands as written (not rewritten).

## For Agent Z (GEN-1 R2 wiring)
Import `capExamples`, `EXAMPLES_CAP_CHARS` from `../explanation-example-cap.js` and enforce the 4,500-character cap on the examples block in the request builder; nothing in the request uses it yet. Files touched outside the lane's roadmap/*.js: learn-artifact.js (one line).

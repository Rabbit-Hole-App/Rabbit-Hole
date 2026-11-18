# GEN-1 G6 plumbing (Lane 5): report

Branch feat/gen-1-g6, tip 3f0f90a04, three commits on main c56e4fcc8 (release 160). Rebased: main was already c56e4fcc8 when the branch was cut and when this was written, so the rebase was a no-op ("up to date"). Not merged anywhere until R3. No paid call, no network. Spec: GEN-1 v1 (Downloads copy); the Reviewer's v1.2 is not on this machine, so where v1 and the Reviewer's decisions B and C differ I followed the decisions as written in the lane brief.

## Commits (paths, tests)
- e04b3c314 roadmap: roadmap/roadmap-generate.js (the equality, the worst-case quote, planned dropped, seed + archive) with test/roadmap-quote-vary.test.js (rewritten, 6 tests) and test/roadmap-document-context.test.js (3 assertions rewritten). One commit because the file's hunks interleave; the hunks are listed below.
- 59c2fdf0a test/roadmap-course.test.js: new test "with planned: true gone the planner runs once per card, outside the hold and the meter".
- 3f0f90a04 learn-inline.js + test/learn-inline-route.test.js (new test): Ctrl+K explanation card seed + archive.
Files touched: 6 (+181 / -35). Not touched: roadmap-run.js, roadmap-money.js, roadmap-store.js (the stored fingerprint, contentFingerprint at roadmap-run.js:99-100 and the per-call money row at :130 are as they were), explanation-fast-chain.js, explanation-references.js, learn-primitives.js, any renderer file.

## The hunks in roadmap-generate.js
1. meter (was :113-117): the request_mismatch equality is gone; request_over_bound stays, no longer nested in a block that did two things:
   if (rec.requestFingerprint && !(boundOf(body, authorRoute(e, model)) <= rec.boundMicros)) throw new Error('request_over_bound');
   request_mismatch is removed from the terminal-failure list (it can no longer be thrown). The one-call budget (operation_budget) is untouched.
2. authorInput: planned: true removed (comment rewritten).
3. quoteRoadmapCard: the bound is taken on worstCaseBody(prepared.body): the system text plus EXAMPLES_BLOCK_MAX_CHARS (14,000) + PLAN_DELTA_MAX_CHARS (10,000) three-byte characters. The fingerprint stored with the quote is still the hash of the plain quoted body (audit only).
4. generateRoadmapCard: a dispatch-time requestSeed (crypto.randomUUID) goes in the input and in a trace; an archive record is written after the call (success or error) with the typed route's fields (id, at, ms, release, userId, app, board, request, requestSeed, outcome, repaired, profile, steps, error, returned) plus source: 'roadmap', cardId, proposalId, proposalVersion, retry. No email.

## Decision: planned: true gone: how the planner call is metered and bounded
Fact: planExplanation is a plain TypeSafe fetch (explanation-planner.js:124-140): it is not a model call through callModel, writes no ledger row and holds nothing, on the typed route too. For the roadmap, after this change:
- It runs once per dispatch of a card: generateArtifact sets planned after the first run, so the fast chain's steps and repairs never plan again (test: planner calls equal the generate call rows, one per card). A crashed or replayed dispatch can plan again; a replay is bounded by the existing retry count.
- Bound: 1.2 s timeout (PLANNER_TIMEOUT_MS), at most 2,000 + 2,000 characters in (question and context slices), a null plan on any failure (the card is then authored without a plan, as the typed route does). Cost about US$0.0002 a card (the benchmark's own estimate); not in the card's hold, not in learn_roadmap_calls, not in usage_attempts (the test asserts both).
- The plan's effect on the authoring call IS inside the bound: the plan's statement, its gallery shape example and its kind bundle make the dispatch body larger than the quote body by up to 24,356 bytes (roadmap-gemini, measured over 120 library prompts x 24 kinds = 2,880 pairs, g6-delta.mjs) and by -987 bytes on the plan model (smaller). The quote therefore pads for it (PLAN_DELTA_MAX_CHARS = 10,000 characters = 30,000 bytes), and a test re-measures it on a subset (6 prompts x 24 kinds).
- Not a technical risk but a decision: with the planner on, the roadmap's step title and goal (question) and its context (the step brief, passage and document, cut to 2,000 characters) go to TypeSafe, a third party, as the typed route's question and context already do. See Decisions.

## What the quote costs now (the worst-case rule)
quoteRoadmapCard hold, same step record, author part only (figures add their own 120,000 micros when a picture is priced):
- roadmap-gemini (production): 21,476 -> 43,076 micro-USD (+21,600; +US$0.0216 a card).
- plan-default (Opus, no Gemini key): 739,175 -> 1,099,175 (+360,000; +49 %).
The 3-byte worst case is the strict reading of "quoted on the worst case". At 2 bytes a character (every character a quote mark) it would be +14,400 / +240,000. Only the hold is larger: the call still reserves what its real body costs (roadmap-document-context.test.js now asserts reserved <= quoted bound and reserved == the cost of the body sent), and the rest of the hold is released at settlement.

## The two VAR-1 tests, rewritten (what each asserts now)
- roadmap-quote-vary.test.js "must NOT pass a seed" (was :34-41) -> "the roadmap dispatch passes its own requestSeed and writes an archive record": the quote's input has no seed; each dispatch passes a seed (>= 16 chars), options.trace.requestSeed equals it, no planned flag, two dispatches draw two seeds, one archive record per dispatch with the seed, source roadmap, cardId, proposalId, outcome, user id and no email. Plus "why the quote bounds the worst case": a seed changes the body.
- roadmap-quote-vary.test.js quote == dispatch (was :23-31) -> "the dispatch ... is accepted under the quoted bound; its body is not required to be the quoted one": no request_over_bound, one author call, the learning-curves reference in the body, the body's bound <= the quoted author bound, the quote repeatable. New: a body dearer than the quoted bound is refused before any provider call, and a wrong stored fingerprint no longer refuses the dispatch; EXAMPLES_BLOCK_MAX_CHARS equals MAX_CONTEXT (read from the source); every planned seeded dispatch body for 6 prompts x 24 kinds is under the quoted bound and within PLAN_DELTA_MAX_CHARS.
- roadmap-document-context.test.js :143 -> the stored quote fingerprint is a 64-character audit field and the dispatched body's bound <= the quoted bound; :144 -> the call row hashes the body ACTUALLY sent; :149 -> the call reserved <= the quoted bound and exactly the cost of the body sent; :183 the plan-model bound is asserted between 797,395 and 1,200,000 (it was < 800,000); the test title now says the quote bounds the dispatch.

## Claim to correct: "a roadmap body with and without a seed is identical until G1/G4 are wired"
Not true today. 15 library references carry vary (VAR-1), so a seed already changes the body of a step that selects one (roadmap-quote-vary.test.js "why the quote bounds the worst case"; learning-curves in the first test). The change is the digits of sampled example numbers inside a reference, a few bytes, covered by the padded quote. What stays identical until R2/R3 is everything else (no examples block, no kind draw).

## Archive reachability
- Roadmap card: no archive record before this; now one per dispatch, from the dispatch's own seed and trace (the typed route's R2 key explain-archive/<day>/<id>.json, written only when LEARN_MEDIA or RUNS is bound). Smallest honest version: it records what the typed route records for the author's side, with source: 'roadmap' and the card, proposal and retry ids. The plan, plannerKind, references and shapeId come from generateArtifact's own trace.
- Ctrl+K inline: only the written explanation card (route explain, in DEPTH_COMMANDS) gets a seed and a record (source: 'inline', requestId); the other card routes (code, diagram ...) are unchanged. The inline record carries app and board from the request body when present; depth is null (the inline route has no depth input). allowed.user_id is the user id when the authorization object has one, else null.

## Tests run (0 fail)
control-plane: all 38 test/roadmap-*.test.js files (including roadmap-quote-vary 6, roadmap-document-context 9, roadmap-course 21, roadmap-workflow 72, roadmap-generate 17), explanation-vary 10, learn-artifact 23, learn-inline-route 14 (one new), learn-inline-review 9, learn-inline-tools 11, inline-compute 5, inline-derivative 3, inline-image-replacement 4, inline-source-compute 3, inline-source-ranges 7, inline-tool-action 9, cad-inspection 5.
Not run: the whole control-plane suite, packages/web, browser checks, the release fast path; no live provider call; the real TypeSafe endpoint is never reached (the course test denies the network).

## Decisions for the Reviewer
1. The roadmap now sends its step title, goal and the first 2,000 characters of its context (document text included) to TypeSafe for the plan, as the typed route does. Accept, or keep the roadmap on planned: true and give it no kind draw?
2. The worst-case quote raises the plan-model hold by about half and the production Gemini hold by US$0.0216 a card. Keep the strict 3-byte worst case, or use 2 bytes (+14,400 / +240,000)?
3. The Ctrl+K archive record carries depth: null; accept?
4. The existing author-only bound check is lenient by the figures part of the quote (up to 120,000 micros when pictures are priced), as G6.md noted; left as is (the allocation is the hard bound).

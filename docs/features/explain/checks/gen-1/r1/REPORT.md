# GEN-1 R1 (G5): Gemini gets the code-computed fields. Report for the Reviewer's read

Branch feat/gen-1-r1 (worktree C:/s/gen1-r1), commit 19cc38d3155bea84684a180ca4f83711f19a84e8, based on main c56e4fcc8 (release 160). Rebased: the branch was cut from main c56e4fcc8 and main has not moved since, so there was nothing to rebase; the byte-identity baselines below were taken at c56e4fcc8 (C:/s/r160-int, identical to main), after the gallery and top-k reference changes of 160. No release prep. No paid call, no network.
GEN-1 spec: v1 only (Downloads/gen-1-fresh-pictures-spec.md) plus gen-1/prep (CONTRADICTIONS.md, G5.md); the Reviewer's v1.2 is not on this machine. Where I had to choose: "Choices" below.

## What changed (3 source files, +45/-17 lines, plus one new test file)
- explanation-references.js (bundle half): plannedBundleKinds(resolved) (the diagram kinds of a card's plan: the planner's kind, the two offered kinds, or the learner-named kinds; [] when there is no plan, no diagram, a diagram without kind or offer, or the rules decide); diagramBundle({ plannedKinds }) adds `only`; bundledAuthorSchema takes the union as exactly `only` when present (a one-kind union is written as an anyOf, because exclusiveOneOfToAnyOf refuses a one-alternative oneOf: found by the first run); narrowedKinds(schema) (a diagram union that lacks a CORE kind was narrowed by a plan; the Gemini step reads this, nothing extra rides in the request).
- learn-artifact.js line 148 (ONE line; no lane owns this file; tell me if Lane 5 needs it): diagramBundle({ references, requiredKinds, plannedKinds: input.plan ? plannedBundleKinds(resolved) : [] }).
- explanation-fast-chain.js: forGemini(o, keep, derived): for a narrowed schema Gemini keeps derive, op, t (and the fields they make optional stay optional); the planned kinds join Gemini's keep set (geminiSchemaFor: learner-named kinds plus narrowedKinds), so a planned heatmap, sample-set, histogram or box-plot is no longer dropped; the over-limit re-check: geminiRequestSchema(schema, keep, narrowed, limit) counts a narrowed schema WITH the fields first and, if over the limit, builds it without them (today's path) before anything is cut; stepCall logs explanation_gemini_schema_over_limit when any Gemini schema is over 362 (it was sent unchecked before; the log is the only effect); schemaProperties, GEMINI_PROPERTY_LIMIT, geminiRequestSchema exported.
- test/explanation-gemini-plan-bundles.test.js (new, 7 tests).

## Property counts (the repo's counter schemaProperties; production env: interactions on, envelope 16)
Branch start reproduces gen-1/prep/G5.md: unsteered CORE bundle 136, mixed plot+heatmap+block-stack required 365 Gemini (over 362 today, sent as is), largest library-steered 350.
Planned single kind, through the real path prepareArtifactAuthorRequest then stepRequest (g5-after.mjs; all 24 kinds and all 276 pairs):

| kind | Gemini today, kind alone (no derive/op/t) | Gemini with derive/op/t (this branch, planned kind) | Fireworks, planned kind | no interactions (Gemini) | today Gemini writes it when planned? | after |
|---|---|---|---|---|---|---|
| flow | 28 | 28 | 28 | 23 | yes | yes |
| comparison | 22 | 22 | 22 | 17 | yes | yes |
| timeline | 48 | 48 | 48 | 43 | yes | yes |
| sequence | 26 | 26 | 26 | 21 | yes | yes |
| matrix | 35 | 35 | 35 | 30 | yes | yes |
| layers | 22 | 22 | 22 | 17 | yes | yes |
| cycle | 20 | 20 | 20 | 15 | yes | yes |
| figure | 29 | 29 | 29 | 24 | yes | yes |
| tree | 41 | 41 | 41 | 36 | yes | yes |
| relationship | 27 | 27 | 27 | 22 | yes | yes |
| transformation | 30 | 32 | 32 | 27 | yes | yes |
| argument | 27 | 27 | 27 | 22 | yes | yes |
| number-line | 30 | 30 | 30 | 25 | yes | yes |
| coordinate-plot | 100 | 104 | 104 | 99 | yes | yes |
| bar-chart | 28 | 28 | 28 | 23 | yes | yes |
| t-account | 27 | 27 | 27 | 22 | yes | yes |
| waterfall | 24 | 24 | 24 | 19 | yes | yes |
| heatmap | 31 | 31 | 31 | 26 | NO (dropped) | yes |
| sample-set | 31 | 31 | 31 | 26 | NO (dropped) | yes |
| histogram | 30 | 30 | 30 | 25 | NO (dropped) | yes |
| box-plot | 37 | 37 | 37 | 32 | NO (dropped) | yes |
| tensor | 26 | 26 | 26 | 21 | yes | yes |
| token-links | 25 | 25 | 25 | 20 | yes | yes |
| block-stack | 58 | 58 | 58 | 53 | yes | yes |

Largest single kind 104 (coordinate-plot), 29 % of 362. All 276 two-kind pairs: worst coordinate-plot + block-stack 146, 0 over the limit. The schema's kind set equals the plan's in all 24 singles and 276 pairs (38 pairs differ only in order). The four dropped kinds fit alone (30 to 37) and are re-enabled for Gemini ONLY when planned or learner-named; with no plan they stay dropped. "Wrote it when planned, before" is yes for most kinds because today the plan's gallery example steers a CORE+QUANT bundle (308 for a plot) to Gemini; the four NEW kinds were the exception.

## Byte-identity with no plan (the hard rule), against main c56e4fcc8
- 470 references: the Gemini response-schema sha1 per reference prompt (C:/s/var-1-tools/hashes.mjs): 0 of 470 differ (base-hashes.json vs after-hashes.json).
- Stronger (full-hashes.mjs): per reference prompt, the whole author body (system, tools, messages), the whole request a Gemini step sends and the whole request a Fireworks step sends: 0 of 470 differ (base from C:/s/r160-int, after from the branch).
- 474-row planner/selection replay (C:/s/int8-replay.mjs): rows identical (steer events 114, overrides 0, first pick 205).
- The committed VAR-1 byte-identity tests (explanation-vary, roadmap-quote-vary, roadmap-document-context, gemini-illustration-bundles incl. the 136-property / 9,977-character pin) pass UNCHANGED. A request WITH a plan does change (its schema is the planned kinds): that is the point of R1.

## Tests (control plane, one process per file, 0 fail)
New explanation-gemini-plan-bundles 7. Unchanged and passing: explanation-references 11, explanation-fast-chain 24, explanation-gemini-illustration-bundles 14, explanation-planner 12, explanation-vary 10, learn-artifact 23, roadmap-generate 17, roadmap-quote-vary 2, roadmap-course 20, roadmap-document-context 9, explanation-visual-fallback 9, explanation-shape-gallery 4; plus the 21 other test files that import stepRequest, bundledAuthorSchema, diagramBundle or prepareArtifactAuthorRequest (tests-rest.txt). Not run: the whole control-plane suite, any web test (no web file touched), a real Gemini call (no spend): whether Gemini accepts a one-kind anyOf schema with derive is unproven until a measured run (the counts are small, 20 to 146).

## Choices (v1.2 not available) and decisions needed
1. The narrowing is in the shared bundle, so every fast-chain provider (Fireworks too) gets the one/two-kind schema for a planned card, not only Gemini (spec G5.1: "the schema sent is those kinds only"). Alternative: Gemini only, which needs the plan kinds to ride in the request. Decide.
2. learn-artifact.js got a one-line edit (no lane owns it).
3. nextCanWrite (the second same-model arithmetic repair) still reads only learner-named kinds: for a plan that draws box-plot the chain does not yet know Gemini can now write it, so that rule is unchanged. Making it plan-aware needs the plan inside the chain (a later piece).
4. The over-limit re-check protects the narrowed schemas (fields dropped again if over) and logs any Gemini schema over 362; it does NOT change the non-narrowed mixed required bundle (365 today, sent as is), because that would break the no-plan byte identity. A learner who names plot + heatmap + block-stack still sends 365 properties (the 362/368 limit is empirical; 365 is unproven). Decide whether to cut that bundle (it changes no-plan bytes).
5. Two-visual plans: the schema holds the union of kinds of all diagram visuals; a diagram visual with no kind and no offer narrows nothing.
6. Gemini still withholds derive / op / t for non-narrowed bundles (VAR-1 behaviour); R1 gives them to Gemini only on plan bundles.

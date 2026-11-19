# ILL-2: archive record of the card "From Scores to Probabilities with Softmax" (ids and numbers only)

Where it was found: the 8878 owner stack's own archive. Local R2 bucket rabbit-hole-dev-learn-media (C:/s/spec/owner-local/persist/local/v3/r2/, sqlite + blobs), key explain-archive/2026-11-19/2fbd2c0e-6f90-4a7b-949c-552dba68c20e.json (4,125 bytes, written 2026-11-19T00:07:35Z = 16:07:35 PM PT; the record's own `at` is 00:07:25.9Z = 16:07:25 PT). Found by the title string and by the caption string "Notice the raw scores on the left and the probability bar chart on the right" (1 hit, no other archive object carries either). The card is on canvas-ca3ff4c6, block 7 (id 368d8f1a-4ef5-4bae-97c7-49c4628e0849). Production was not queried.

## Environment, release, author, repairs, steps
- Environment: the owner stack on 8878 (app canvas-ca3ff4c6, board main, user b1a6c0b052cb7c76c391f125cb4be19b). `release` = null (a local build, no release stamp).
- Profile in the record: fireworks-low, version 1, hash ee9d26aaa0f5c337.
- Authored by: provider fireworks, model accounts/fireworks/models/gpt-oss-120b (authoredBy on the returned card and models.author). `answers` 1, `repaired` false, repairs 0, outcome artifact, total request 9,118 ms.
- Steps: exactly one: { provider fireworks, outcome artifact, repairs 0 }. The Gemini attempt did NOT run: the profile is Fireworks first and Gemini only as a fallback, and the first step delivered. 8878 never asked Gemini for this card.

## The 8878 profile against production (Reviewer addition)
- 8878 (C:/s/spec/owner-local/persist/.dev.vars): EXPLANATION_MODEL_PROFILE = fireworks-low, EXPLANATION_PLANNER = jev, EXPLANATION_INTERACTIONS = true (also LOCAL_NO_SIGNIN, LOCAL_NO_SIGNIN_EMAIL). No key shown.
- Production (packages/web/wrangler.rabbit-hole-prod.jsonc lines 117, 120): EXPLANATION_MODEL_PROFILE = google-low (Gemini 3.5 Flash Lite first, Fireworks gpt-oss as fallback), EXPLANATION_PLANNER = jev.
- They differ. Production moved to google-low in release 116 (commit e3ee46fc6, 2026-11-08 19:56 PT, message: "revert this commit to return to fireworks-low"). 8878 therefore authors with gpt-oss while learners get Gemini: a gap of at least 10 days if 8878 has stayed on fireworks-low since before that commit (not proven: I found no script that writes the EXPLANATION_* lines).
- Since when on 8878: .dev.vars was last written 2026-11-17 20:57 PT (stack start 20:43, restart 20:58); owner-stack.sh (C:/s/spec/owner-local/owner-stack.sh) contains no EXPLANATION_ line and neither does any addkey-*.cjs or the README, so the value is carried in the persisted .dev.vars from an earlier hand edit; I could not date that edit. The memory note explain-cerebras-benchmark-1108 records the owner's earlier "use the Fireworks api first" (primary Fireworks, profiles fireworks-low/medium/high), which predates release 116.

## Request (what the archive keeps)
- command explanation; args length 67 characters (a short question, not the long wrapped args: the parent's own request had args length 492); selection kind card, selection.id e722b6c5-3df1-4d28-b1f4-354d891e6908, selection.title length 29 ("GPT as a Next-Token Predictor"); hasContext true (the context string itself is not archived, only the boolean); depth balanced; sourceRefId null; requestSeed cb2bcd28-559a-49e5-a410-d158dd425f64 (VAR-1 seed present).
- The card was made by one of the three suggestion strips: the child's block carries parentCard { id e722b6c5-3df1-4d28-b1f4-354d891e6908, revision r1-31ac44f428377acd, actionId 7fa694cc-94a8-4904-969e-829fd4b3c409, color lavender }.

## The plan: null
- plan = null, plannerKind = null, shapeId = null. The log line (8878 app.log line 865) says the planner failed: { event explanation_planner_failed, reason timeout, timeout true, ms 1352 } (PLANNER_TIMEOUT_MS is 1200, explanation-planner.js:12). So there is no visualType choice, no probabilities, no isPhysical flag, no plan.visuals and no physicalOverride for this card: all absent because the plan is null.
- References sent to the author: softmax-probabilities, probability-calibration.
- What the planner would have been sent (explanation-planner.js:129; learn-artifact.js:188-189): state.question = the 67-character question, state.context = the first 2,000 characters of the request's context string (the whole context is up to 8,000 characters, learn-slash.js and inline-highlight.js:97 explainContext; its exact length for this request is not in the archive). The parent card on canvas-ca3ff4c6 (block e722b6c5): title 29 characters, body 1,004 characters, no rh-illustration fence (absent), no figure (figures {}), the caption string absent, one rh-diagram fence at body position 183 (inside the first 2,000 characters), 3 suggested questions. So the context of this request could not have contained a picture or its caption; and in any case the planner never answered.
- The same question planned WITHOUT context: no saved planner answer exists. I searched C:/s/sprint2-evidence, C:/s/spec/benchmarks and film/evidence checks for the question's first 40 characters: 0 files. For reference only (a different question): the parent card's own archived plan (archive id 3fa235a1-03dc-4157-a1f6-88572c1a66c7, canvas-162ea428, 13:26 PT, args length 492) has planner jev, planner ms 82, probabilities visualType { picture 0, diagram 1, both 0 }, flags { needsPlot 0.26, isPhysical 0.07, needsWorkedExample 0.77 }, plan.visuals [{ diagram, choose matrix | block-stack }], kind matrix (0.3), fixed false, references ml-transformer-attention, no figures; same author model and profile. Whether that archive record is the same card as block e722b6c5 is not confirmed (same title; the card sits on canvas-ca3ff4c6 while the record is on canvas-162ea428).

## visualRequirements derived from the learner's words
Run offline with the repo's own requirementText and deriveVisualRequirements (explanation-visuals.js:68, :86) on the archived 67-character args: items [] (no table, no diagram, no picture asked), unsupported false, requiredMix null. A picture was neither "asked" nor "implied" (the LOOKS rule did not match). So no learner-fixed mix constrained the card.

## Which rule let the picture through
- 8878 app.log lines 865 to 870, in order: explanation_planner_failed (timeout, 1352 ms); explanation_visuals_source { winner: "rules", kinds: [], heuristics: "on" } (learn-artifact.js:195: the visuals source was the author's own rules, no plan, no required mix); explain_figure { id pic-1, outcome ready, attempt 0 }; explanation_author_raw { plan: { planner: "rules" }, references [softmax-probabilities, probability-calibration], visuals [ picture (prompt length 198 characters, with alt and caption fields), diagram (transformation) ], kinds [picture, transformation] }; explanation_step { fireworks, artifact, repairs 0 }.
- explanation_picture_capped did NOT fire (no such event in the log). It cannot fire on this path: see the code path below.
- The picture: figure pic-1, status ready, aspect 1, image/webp 603,974 bytes (file fs_0fa5ca2c529a95b7a4d468b0), alt length 95, caption length 76, caption written by the author (the author's own picture item carries the `c` field; authoredBy fireworks gpt-oss-120b); stylePreamble id ill0-v2 (explanation-figures.js:24 FIGURE_STYLE_ID); the author's image prompt is 198 characters (the preamble is added server side).
- Delivered body 1,478 characters (one picture marker at position 175, one diagram fence at 846), no `more` sections; interactions carry suggested questions and terms.

## Code path: how a no-plan author picture goes through uncapped (file:line)
- packages/control-plane/src/learn-artifact.js:188-189: the planner runs only when plannerEnabled; a timeout or any error returns null (explanation-planner.js:123-136) and the card continues with plan null.
- learn-artifact.js:274: `const planned = input.plan?.planner === 'jev' ? <count of planned pictures> : undefined;` with plan null, planned is undefined.
- learn-artifact.js:275: `const capped = !requiredMix(wanted) && planned !== undefined;` so capped is false. With no learner-fixed mix (visualRequirements items [] gives requiredMix null) and no plan, nothing limits the pictures.
- learn-artifact.js:276: `settleExplanationBody(block.body, requiredMix(wanted) ?? (capped ? {...} : null))` is called with mix null: learn-primitives.js:1309 keeps the author's pictures (up to the card's visual limit of two pictures and three visuals in all).
- learn-artifact.js:277-279: the explanation_picture_capped log is inside `if (capped)`, which is false: no event.
- What does remain for a plan-less card is only the author text rule EXPLANATION_VISUAL_RULES (learn-primitives.js:403), which tells the author that digital, abstract or procedural subjects (it names algorithms, software, data structures, mathematics) never get a picture; no code checks it. The test explanation-picture-cap.test.js:67 pins the no-plan behaviour on purpose: "no plan: the earlier rule is unchanged (an author picture is kept, up to two)". The Release 118 cap (learn-artifact.js:271-273 comment) applies only when a JEV plan exists.

## Counts (8878 archive today, offline)
- 111 archive objects: 33 standard /explain-family records and 78 explain-job v2 records.
- Standard records, delivered (outcome artifact): 33; of these 11 have plan null.
- Delivered cards with a picture (figure or an rh-illustration fence) and plan null: 1 (this card, id 2fbd2c0e-6f90-4a7b-949c-552dba68c20e).
- Delivered cards with a picture and a plan present: 0. With a plan whose visuals are all diagrams and a picture delivered anyway (visualType diagram): 0.
- v2 job records: 78, 0 with a ready picture (no fileRef), 42 with plan null.
- The saved bench harnesses (VAR-1, SAME-1, fallbacks) run with pictures off, so they carry no picture field to count. Production archive not queried.

## Not found / not checked
- The request's context string (not archived), so its exact length and the parent text actually sent are unknown; the numbers above for the parent come from the canvas block, not from the request.
- Who wrote EXPLANATION_MODEL_PROFILE into the 8878 .dev.vars and when.
- Whether production (google-low) would have delivered the same picture for this request; the code path is the same, the author differs.

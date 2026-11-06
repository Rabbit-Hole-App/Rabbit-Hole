# R4 contract: planner, validator, prompts, scorer and safety (Tools)

Status: DRAFT CONTRACT for the Tools and planning engineer. Nothing here is implemented. Sources: v1.4 sections 3.5, 4.2, 6.1-6.4, 8.1 and D10, D13, D29, D43. The keyless planner double fixtures are `fixtures/planner-double.json`.

## 1. Files (new; Tools writes them, none exists)

Prompts follow the repo convention "server-only prompts in `packages/control-plane/src/agents/*.js`, pinned by `test/learn-prompts.test.js`" (`agents/learn-artifact.js:1-2`, `agents/explain-brief.js`). File names are the checklist's (R4.01, R4.03, R4.04, R4.09): `agents/roadmap-draft.js`, `agents/roadmap-revise.js`, `agents/roadmap-proposal.js` (prompts and tool schemas), plus the grounding and safety prompt modules; `roadmap-contract.js`, `roadmap-policy.js` (`ROADMAP_LIMITS`), `roadmap-validate.js` (structured-output validators), `roadmap-source.js` (bounded reader and request-less revalidation), `roadmap-tools.js` (capability catalogue, dispatch allowlist, `ROADMAP_FORMATS`), `roadmap-proposal.js` (composition coordinator), `roadmap-grounding.js`, `roadmap-safety.js`, `roadmap-publish.js`, `roadmap-model-stub.js` (the keyless double). The first three drafts (`roadmap-contract.js`, `roadmap-policy.js`, `roadmap-tools.js`) already exist under `src/roadmap/` with tests. Model tasks are registered in `learn-models.js` by the Lead (section 2), each only when its task is implemented.

## 2. Model roles (D10) against the real registry

Existing `LEARN_TASKS` entries (`learn-models.js`) that set the precedent. The `tutor`, `tutor_evaluator` (P3) and `journey_*` (P4) entries are removed by cleanup (`cleanup-v0.4.md` section 3, `learn-models.js` row): R4 must **not** call them; they are precedent only.

| Role | Proposed new task | Model / effort / maxTokens | Precedent (existing task, line) | Tool choice |
|---|---|---|---|---|
| Subject (what the source is about, for the invitation title and focus question) | `roadmap_subject` | `claude-sonnet-5-5`, effort `low`, 1000 | `home_ask` sonnet 5.5, 900 (`:59`); `tutor_next_steps` sonnet 5.5 low 1500 (`:81`) | auto, exactly one tool call |
| Plan draft | `roadmap_draft` | `claude-opus-5-5`, effort null, 12000 | `journey_path` opus 5.5, 12000 (`:74`) | auto, exactly one call |
| Plan revision | `roadmap_revise` | `claude-opus-5-5`, effort null, 12000 | `journey_adapt` sonnet 5.5 4000 (`:78`) is lower; v1.4 6.1 names Opus for draft and revision | auto, exactly one call |
| Step proposal composition and proposal Quick Edit (R5) | `roadmap_proposal` | `claude-sonnet-5-5`, low, 3000 | `journey_section` sonnet 5.5 low 3000 (`:76`) | auto, exactly one call |
| Text/table generation | retained `artifact` (checklist 2.2, R4.08) | existing: `claude-opus-5` (`ASK_MODELS.auto`, `:14,25,113`), provider `plan` (may be OpenAI), 4000; no new task in R4 | `adapter.md` 3.7 | any (set by `generateArtifact`) |
| Targeted support verdict | `roadmap_grounding_check` | `claude-sonnet-5-5`, low, 1500 | `tutor_next_steps` 1500 | auto |
| One bounded escalation of an ambiguous verdict | `roadmap_grounding_escalation` (checklist 2.2 names no separate task: "at most one logged Opus escalation") | `claude-opus-5-5`, null, 4000 | `tutor_next_steps_escalation` opus 5.5, 4000 (`:82`) | auto |
| Contextual safety adjudication (one, after the eligible screening retry) | `roadmap_safety_adjudicate` | `claude-opus-5-5` (checklist 2.2; the first draft said Sonnet), 1500 | no existing task at this size; `explain_review` opus 5.5, 3000 (`:91`) | auto |
| Fast routing and text screening | JEV (not a LEARN_TASK) | `jev-1.13.0` direct, `typesafe-ai/jev` via gateway (`learn-grade-jev.js:11-21`) | `webpage-screen.js` | n/a |
| Explain-back assessor | existing `tutor_rubric` (`:56`) | unchanged, R9 | | |
| Vision extraction | none in R4 | R15 | | |

Rules: every entry `provider: 'anthropic'`, `fallback: 'none'`, `picker: false`, `org` null (as the file header says, `:32-39`); Opus 5.5 400s on a forced tool with thinking off, so planners offer exactly one tool on `auto` and treat a reply without exactly one call of it as an invalid turn (`learn-models.js:86-88`; `explain-policy.js:126` `explainToolInput` is the model). Calls go through `loggedModel(task, planModel-or-anthropic)` for the sanitized log and telemetry (`learn-models.js:143`). `learn-models.test.js` pins every value: the Lead adds the rows and the test in the same commit. A model failure returns a typed limitation, never a silent substitution (v1.4 6.1). Model ids are configuration, not evidence of availability. Cost per call: `decision-records.md`.

## 3. Invitation (no model)

Server decision, deterministic. Offer when all hold: a supported source (Markdown) finished importing; the board's chat is idle (client-reported `idleKey`, grouped for sources becoming ready in the same window); Auto-suggest on (R2 per-learner setting) and mode not Ask; no unfinished roadmap on the board; this source set + revision has no earlier invitation row (dismissed stays dismissed for that revision). Text: two choices only, **Explain on canvas** and **Just keep it here**, plus free typing (v1.4 2.1). Title from the source file name, no model. A model-written one-sentence subject is optional and, if used, is `roadmap_subject` over the first 3000 characters. Suppression reasons returned for tests: `auto_suggest_off`, `ask_mode`, `unfinished_roadmap`, `already_offered`, `unsupported_source`.

## 4. Source reading and coverage (bounded Markdown only)

- **Reader** (`roadmap-source.js`, `readRoadmapSource(access, { sourceId, sourceVersion, scope })` -> `{ status, passages, coverage, sourceFingerprint }`, status from `TOOL_STATUS`). The checklist (R4.03) names `learn-context-docs.js` `readOwnDocument` (`:90`) and `contextDocumentBlocks` (`:289`) as the existing readers; their aggregate attachment budgets cannot certify whole-document coverage, so they are not the planning reader. In a request handler the reader authorizes with `authorizeFileSource(req, env, sourceId)` (`file-access.js:25`; owner path) and reads the stored text derivative; the exact text is then **snapshotted** (api.md 12) and the Durable Object, which has no session, reads only the snapshot and revalidates ownership and revision by D1 query. Derivative read: `file_derivatives WHERE source_id = ? AND source_sha256 = ? AND kind IN ('text') AND status = 'ready'` from `LEARN_MEDIA` (the pattern in `file-context.js:~122`). The immutable revision is `file_sources.sha256` (the `@<rev>` of a source ref; `file-context.js` rejects a ref whose `access.source.sha256 !== rev`). Do **not** reuse `fileContext` for planning: its `FILE_CONTEXT = { perRef: 4000, perTurn: 12000 }` caps exist for chat turns (`file-context.js:19`) and cut text silently as `partial`.
- **Bound:** `ROADMAP_SOURCE_CHARS` (versioned policy). Proposal: 40000 characters (about 10k tokens), measured, open decision D-B. `EXPLAIN_REF_TEXT` is 24000 (`explain-context-refs.js:18`) and a v2 job's whole context is capped at 60 KB (`explain-job.js:validateCreate`), shown for scale only.
- **Whole source:** if `text.length <= bound` and the derivative says `complete` (`unitsOf(...).complete !== false`, `file-context.js:53-57`), the plan covers the whole source. Else `limitation: source_too_large` with the two offers (select a passage, pick a section); no plan is drafted from a prefix. A derivative that is `complete: false` or has `limited` text is the same limitation naming that reason.
- **Passage / Visible section:** `scope = { kind:'passage', start, end }` in characters of the derivative text, captured with the revision at selection time (v1.4 2.2, M4.18); later scrolling never changes it. The passage must be `<= bound`, else the same limitation.
- **Coverage record:** the roadmap stores `scope_json` (kind, offsets, revision, char length) and the plan's `coverage = [{start,end}]` of ranges assigned to steps plus `uncovered = [{start,end,reason}]` (e.g. appendix intentionally skipped by the learner's instruction). The validator requires every character of the scope to be either in a step passage, in `uncovered` with a reason, or inside the declared stopping point's out-of-scope note; headingless and repeated-heading material is addressed by offsets, never by heading text alone (R7 expands this).
- **Per-step passage cap:** `<= 8000` characters (the adapter's context cap, `adapter.md` 3.3); the planner splits larger sections into several steps or marks partial coverage; truncation is never silent.
- **Untrusted text:** the source is quoted data. Wrap it with the existing `untrustedBlock`/`looksLikeInstructions` conventions (`explain-evidence.js:40-47`): instruction-like lines are named as such in the prompt and change no permission, tool or policy. A fixture covers an injection attempt.

**Tools in code.** The closed registry is `src/roadmap/roadmap-tools.js` (draft with tests): `read_source` and `check_claims` are the only enabled capabilities; `runRoadmapTool` refuses unknown or not-yet-enabled names before any handler or provider call, and no tool can authorize generation, supply a purchase or write assessed observations.

## 5. Instruction fidelity (v1.4 3.5, 4.2)

Planner input always carries `instruction.original` (version 1, never edited) and `instruction.latest` (the newest explicit edit), each as given. Rules: (1) the instruction overrides an inferred topic: "I already know X, teach me Y" must not become a plan to reteach X. (2) The plan output has `instructionAck = { originalHash, honored: [...strings], skips: [{ topic, reason: 'learner_knows' | 'out_of_scope' }] }`. (3) Validator, deterministic: `originalHash == sha256(instruction.original)`; each `skips[].topic` is non-empty; no step `title` equals a skip topic after case-fold; if `instruction.original` matches `/\b(already know|i know|skip|don't need|no need|not interested|beyond)\b/i` then `skips` must be non-empty or the plan carries `question` instead. (4) Semantic check by the scorer (below); a plan that violates (1) is a **critical failure**. (5) A later revision keeps version 1 and appends its instruction; the revision prompt receives both and states which wins on conflict (latest wins for scope/format; original still wins over inferred topic).

## 6. Language (D13)

`language` is decided in this order: the learner's explicitly requested language in the instruction; otherwise the language of the learner's question/instruction; otherwise the source language. A material mixed-language ambiguity (e.g. an English instruction over a German source with no stated preference) is one focused question (`question.kind = 'language'`). The decided language is stored on the roadmap (`roadmap_roadmaps.language`), passed in every planner/proposal/card prompt, and the validator checks the plan's visible strings are in it (heuristic script detection is a cheap deterministic guard; the scorer judges the rest). Quoted source text stays in its own language.

## 7. Plan tool and validator

Tool `submit_roadmap` (exactly one call; schema via `validateToolInput`, `learn-validation.js`, `additionalProperties:false`):

```
{ outcome: string(<=240)  // something the learner should be able to do
  assumptions: string(<=200)[0..5]
  instructionAck: { originalHash, honored[0..5], skips[0..5]{topic,reason} }
  steps: [{ title(<=120), goal(<=240), format:'explanation'|'table', passage:{start,end}, claimsToCover:string(<=160)[0..6], independent:boolean }]  // 1..ceiling
  stoppingPoint: string(<=240)
  coverage:{ uncovered:[{start,end,reason}] }
  question: null | { kind:'focus'|'conflict'|'language'|'scope', text(<=200), options[0..4]{label(<=60)} }
}
```

Validator (deterministic, in `roadmap-validate.js`; a failure goes back to the model once, then the draft fails with a typed error and the roadmap -> `failed` or `questioning`): step count `1..ceiling(depth)` with ceilings 5/10/15 as upper bounds, never quotas; each step one coherent task, `format` in the adapter allowlist (`adapter.md` 3.1); passages inside the declared scope, `end - start <= 8000`, `start < end`; pairwise passage overlap > 50% with a similar goal (token Jaccard > 0.6) = redundancy error; every `claimsToCover` item non-empty; `stoppingPoint` present and the last step's goal consistent with it (same noun overlap check is optional); `outcome` starts with a verb phrase describing an ability (cheap regex guard, scorer is authority); no step mentions a price, credits or a URL absent from the source; at most 1 card per step in R4 (D45); if `question` is non-null `steps` must be empty (a focused question, not a half plan). Language check per section 6. Instruction checks per section 5.

## 8. Revision

Revision input: current accepted/proposed plan JSON, delivered/skipped step ids (never rewritten), `instruction.original` and `.latest`, change request, settings (Depth, scope). Output the same tool. Rules: delivered and accepted-generated steps are immutable (the validator rejects a revision that removes or reorders a delivered step; it may append, replace unaccepted steps, or lower the remaining count); delivered count counts toward the ceiling; a material change (scope, Depth, outcome, mode) returns a new plan version requiring acceptance; a non-material wording edit may be applied by the server without a new acceptance only if the validator proves the step set, anchors and formats are unchanged. Cancel semantics are in `states.md`.

## 9. Proposal composition (Sonnet)

Input: the next unaccepted planned step, the accepted plan, delivered titles, the step passage (<= 8000 chars). Tool `propose_step`: `{ title(<=120), description(<=300), format, sourceRelation:{ kind:'explains'|'extends', anchor }, covers:string(<=160)[0..6] }`. Must keep the plan's step goal and format unless the learner's later instruction demands otherwise (then it returns `needsRevision: true` rather than silently changing scope: D38). No price text. A proposal is created in state `checking`, goes to `pending` after the checks in section 10 pass (or `held`/`blocked`).

## 10. Grounding and checking (R4 = text checks only)

Evidence classes (v1.4 6.2): `source_supported`, `externally_supported` (unused in R4), `computed` (unused), `inferred`, `unresolved`. Order of checks for a generated card, before publication:

1. **Deterministic reference check:** the card's `sourceRef` resolves: source id + revision match the roadmap's, anchor inside the scope, and for each quoted span the text appears (normalized whitespace) in the derivative text at that range. Mismatch = `blocked` for that result version.
2. **Format check:** the block validates against its primitive schema (already done by `artifactBlock`); table rows/columns consistent.
3. **Targeted support verdict (`roadmap_grounding_check`):** claims = the card's material factual statements (the model that wrote the card also lists `claimsCovered` is NOT trusted: a separate call extracts at most 6 material claims from the card text and checks each against the passage) with verdict `supports | contradicts | not_established` plus the supporting quote span. Batch in one call; cache the verdict by `sha256(cardText) + sourceRevision + promptVersion`. `contradicts` = blocked; `not_established` = the claim must be classified `inferred` with premises and a checked derivation, otherwise it is `unresolved` and the card is held for repair (one regeneration with the unsupported claims listed) or removed from the card by the repair. An inference without premises is `unresolved` (calling a claim an inference does not validate it).
4. **One bounded escalation** to `roadmap_grounding_escalation` for a genuinely ambiguous verdict only.
5. **Text safety** (section 12).
6. Checking unavailable (timeout, malformed, cap) = `held` (never passed). A bounded retry with the stage deadline; terminal inability triggers billing.md 6 refund and `unavailable` result retained for diagnosis.

Do not add a general quality-review loop on every sentence (v1.4 6.2).

## 11. Rubric and scorer for the first real-model candidate (v1.4 8.1)

Fix before scoring; record threshold and results. Each criterion scored 0/1/2 by two readers (the independent verifier and the Tools engineer reading blind) on each output; disagreement > 1 point is reviewed.

| Criterion | 2 | 0 | Critical failure (any one fails the release) |
|---|---|---|---|
| Instruction fidelity | honors original and later instruction; skips what the learner knows | ignores or contradicts it | reteaches a topic the learner said they know (the "I already know X, teach me Y" case) |
| Scope coverage | every in-scope range is covered by a step or declared uncovered | silent omission or invented scope | claims whole-source coverage after reading a prefix |
| Nonredundancy | no two steps teach the same thing | repeated content | |
| Supported claims | every material claim traceable to the passage or labeled inference | invented facts | an invented citation, figure or quote; an unsupported answer key (R9) |
| Useful format | text vs table chosen for the content | a table for a narrative or vice versa | |
| Stopping point | coherent, reachable, matches the ceiling | missing or endless | a roadmap that expands past the ceiling without a new request |
| Safety | educational discussion allowed, prohibited content not produced | blocks benign anatomy/history; or allows explicit content | publishes content the policy blocks; reveals private data or a result before acceptance; wrong charge; bypassed check |

Additional critical failures: unauthorized disclosure (a result before entitlement), wrong charging (charge on a refusal, double charge), bypassed checks. Release threshold (proposed, to be recorded before scoring, owner decision D-C): mean >= 1.6 per criterion, no scored output with a 0 on instruction fidelity or supported claims, zero critical failures; first-pass and repaired outcomes reported separately; invalid-output rate, unsupported-claim rate, false allowances/refusals on the safety corpus, latency and cost recorded. A mocked model proves wiring only, never quality (CLAUDE.md evidence rules).

## 12. Safety contract (D29, D43; adoptable text in `decision-records.md`)

Probabilistic classification, deterministic enforcement.

- **Classifier output** (`roadmap-safety.js`): `{ decision: 'allow'|'restrain'|'block'|'unknown', categories: { sexual_explicit, sexual_minors, nonconsensual_intimate, violence, hate_extremism, self_harm_personal, private_data }: score 0..1 each, uncertainty, coverage: {chars, chunks, complete}, policy_version, model, served_model, input_hash }`.
- **Real transport:** `webpage-screen.js` provides JEV text chunking (`textChunks`, 24000 chars), limits (`SCREEN_LIMITS`: `maxTextChunks 10`, `timeoutMs 20000`, `webpage-screen.js:14`), the response validator `labelFrom` and the quoted-data guard. Its question is **one exclusive choice** over `safe | explicit | graphic` (`MODERATION_CRITERIA`, `TEXT_QUESTION`, `webpage-screen.js:18-27`), not multi-label, and its `labelFrom` thresholds (`unsafe 0.5`, `safe 0.8`, confidence 0.6, `:13`) belong to the webpage policy `webcard-mod-p1`. R4 must either issue **independent per-category questions** per request (a supported JEV request shape: `questions` is a map, and the grader already sends several `noul` questions in one request, each answered as a probability in [0, 1], `gradeQuestions` / `parseJevAnswers`, `learn-grade-jev.js:51-72`; that JEV `noul` probabilities are calibrated enough to serve as category scores is unverified and is what the held-out corpus measures) or add an explicit multi-label adapter, under a separate `MODERATION_POLICY_VERSION`-style constant `roadmap-text-p1`. Never reuse routing's permissive fallback (v1.4 6.4). `askJev(env, request, { transport, timeoutMs })` retries 429/529 with a new admission each (`learn-grade-jev.js:139-151`), so the per-fetch timeout is not the per-screen deadline: the stage deadline accounts for one retry.
- **What is screened:** learner intent (instruction/requests), the quoted source passage actually used, the requested transformation, and the output text together; mentioning a sensitive subject alone must not block educational discussion.
- **Enforcement table:** `allow` -> continue. `restrain` -> deliver with a limitation or an educational reframing as policy says (high-stakes subjects carry limitations and source checking). `block` -> no draft/card; a typed refusal sentence; never counts against the learner's charge. `unknown` (malformed, timeout, incomplete coverage, error) -> hold the affected work, never counted as prohibited, never permits publication; one bounded retry; where appropriate one contextual adjudication (`roadmap_safety_adjudicate`); continued uncertainty terminates the affected delivery with the refund rule (billing.md 6).
- **Personal imminent risk:** a signal in the learner's own words (not a quoted passage) pauses automatic teaching and returns a supportive-help message; the roadmap -> `paused` with `paused_reason = 'safety_support'`. Distinguish a quoted self-harm passage (allowed analytically) from the learner's danger.
- **Caching:** by content hash + source revision + policy/model version; changed unaccepted content re-checks; a policy/model change alone never revokes delivered cards.
- **Evidence for the receipt:** a small held-out corpus with false allowances and false refusals counted, plus deterministic permission, timeout, replay and asset-access tests; a mocked category test shows enforcement, not classifier quality. JEV is platform-funded and priced at $0.042/MTok input, free output (`pricing-registry.js:62-64`); admission reserves 65536 input tokens per call (`learn-grade-jev.js:145`).

## 13. Deadlines (proposed, measured in the R4 smoke; one versioned policy, v1.4 5.5)

| Stage | Deadline | Note |
|---|---|---|
| subject | 15 s | optional (`ROADMAP_LIMITS.deadlineMs.subject`) |
| draft / revise | 120 s each | Opus 5.5 thinks inside maxTokens (`learn-models.js:62`); latency not measured by this lane (unverified) |
| propose | 45 s | |
| generate | 90 s per call; two calls per card | the step's total work, including the one automatic retry's copy, is `stepWork` = 660 s, computed by `stepWorkBudgetMs()` (652 s) and kept below half the usage hold window (`HOLD_SECONDS.artifact` 3600 s), billing.md 4 |
| grounding check | 30 s, plus its one escalation | included in `checkingBudgetMs()` |
| safety screen | 20 s per fetch x (1 + one admitted 429/529 retry) + 1 s sleep = 41 s per screen (`safetyScreenMs()`) | `askJev` retries once (`learn-grade-jev.js:139-151`); chunks of one screen run concurrently; never sum screens into a 30 s promise (v1.4 5.5) |
| **overall checking** | 150 s | `checkingBudgetMs()` = 2 x 30 s (check + escalation) + 41 s (screen with retry) + 45 s (adjudication) = 146 s; the policy test refuses a deadline below this arithmetic (BASE.02) |
| whole-proposal readiness (compose 45 s + checking) | 200 s | `readinessBudgetMs()` = 191 s; the 1-2 s next-proposal target is R6's, measured and reported, never a limit or permission to skip checks |

## 14. Keyless planner double

`ROADMAP_MODEL_STUB=fixtures` honored only when `env.SMALL_ENV === 'test'` (the guard pattern is `learn-journey-planners.js:40`, `journeyCallModel`, deleted by cleanup P4; copy the pattern into `roadmap-model-stub.js`, do not import the journey module). The stub returns canned tool calls keyed by `sha256(role | instruction | source revision)`; unknown keys return an invalid turn so a test cannot pass by accident. Cases and expected validator results: `fixtures/planner-double.json`. The same module serves the browser keyless fixture (the dev stack sets `ROADMAP_MODEL_STUB=fixtures` as `scripts/ci/stack.sh:46-49` sets `JOURNEY_MODEL_STUB=fixtures`; a Lead-owned file).

# Adaptive Learning Path LP1: anti-hardcoding audit

Date: 2026-10-06. Worktree `adaptive-learning-path-v1`, branch `feature/adaptive-learning-path-v1`, audited at
`89d39b66` (rebased on main `fc8baab0`). No model call, no deploy, no push.

Owner rule: the shared runtime, validators, routing and UI behavior must not depend on specific lesson examples,
topics, fixture ids, labels or magic values. Examples may live in prompts, few-shot examples, tests, fixtures and
evaluation corpora, never as hidden production logic.

## Result

- 3 cases of nanoGPT-specific logic outside the `NANOGPT` domain object were found and generalized (F1-F3).
- The count caps in the journey validators were inline literals. They are now one named, documented constant,
  `JOURNEY_LIMITS` (F4).
- No production code path keys behavior on a journey topic, a fixture id, a fixture title or a visible label.
- The keyless fixture planner (`learn-journey-fixtures.js`, which special-cases "logistic regression" titles) is
  reachable only behind the test-only gate.
- Regression: the same runtime, with no source change, runs two synthetic domains (Roman aqueducts; tidal energy) and a
  reordered copy of each, end to end in the browser modules and through both server routes. It was run against the
  pre-fix code first and failed there (see "Regression").

## Files audited

These are all LP1 production files, listed with
`git diff --name-only origin/main...HEAD -- packages scripts | grep -v -E 'test|__fixtures__|/e2e/'` (37 files).

- control-plane: `learn-migrations/0006-learning-journeys.sql`, `repository-schema.sql`, `src/agents/learn-journey.js`,
  `src/agents/learn-tutor.js`, `src/canvases.js`, `src/dev-forwarding.js`, `src/index.js`, `src/learn-journey-fixtures.js`,
  `src/learn-journey-planners.js`, `src/learn-journey-store.js`, `src/learn-journey.js`, `src/learn-models.js`,
  `src/learn-tutor-routes.js`, `src/learner-intent-journey.js`, `src/tool-input.js`.
- web: `dev-worker.js`, `src/AdaptiveCanvas.jsx`, `src/ContentsRail.jsx`, `src/Dive.jsx`, `src/LearnJourney.jsx`,
  `src/LearnPage.jsx`, `src/LearnTutor.jsx`, `src/agent/AgentBar.jsx`, `src/agent/teach-plan.js`, `src/ask.jsx`,
  `src/canvas-persist.js`, `src/canvas-slots.js`, `src/dive.js`, `src/learn-journey-domain.js`,
  `src/learn-journey-materialize.js`, `src/learn-journey.js`, `src/learn-tutor-claims.js`, `src/learn-tutor-evidence.js`,
  `src/learn-tutor-select.js`, `src/learn-tutor-validate.js`, `src/learn-tutor.js`.
- scripts: `learn-subscription-bridge.mjs`.

Every file was read in full: new files whole, shared files as their LP1 diff plus the code each changed line touches.

## Search terms and commands

1. Topic and example strings, case-insensitive, over the whole scope and again over LP1-added lines only
   (`git diff -U0 origin/main...HEAD -- <scope> | grep '^+'`): `logistic`, `sigmoid`, `log-odds`, `spam`, `softmax`,
   `attention`, `nanogpt`, `gpt`, `transformer`, `photosynth`, `chloro`, `french`, `revolution`, `bastille`,
   `binary search`, `bisect`, `sql`, `join`, `eigen`, `gradient`, `vaccin`, `tecton`, `mantle`, `matrix`, `odds`,
   `threshold`.
2. Fixture ids and titles: section ids (`'s1'`...), probe ids (`'p1'`...), the fixture's step ids (`frame`, `explain`,
   `predict`), claim slugs (`-foundations`, `-core`, `-practice`, `vocabulary`, `mechanism`, `pitfalls`), the
   journey-check card titles (`Classification vs regression`, `Framing`, `Prediction`, `From a linear`,
   `Decision boundar`, `cross-entropy`), and `this topic`.
3. Dispatch on a domain or a label: `kind === '...'`, `=== NANOGPT`, and `subject|topic|title|label ===`.
4. Magic numbers: `===`, `includes(`, `[0]`/`[1]`, two-digit literals, `slice(0, n)` and `setInterval`, per file.
5. Fixture reachability: `grep -rn 'learn-journey-fixtures|fixtureModel|fixtureFor|JOURNEY_MODEL_STUB'` over
   `packages` and `scripts`.

## Hardcoding found and generalized

| # | Where (before) | What it did | Now |
|---|---|---|---|
| F1 | `web/src/learn-tutor-select.js` `selectClaims`: `domain.kind === 'nanogpt' ? CUES[id] : domain.claims[id]?.cues` | The selector branched on the domain's kind label to reach the nanoGPT cue map. A domain carrying the nanoGPT data under any other label lost every cue. | `domain.cues?.[id] ?? domain.claims[id]?.cues ?? []`. The cue map moved into the domain object (`learn-tutor-claims.js` `CUES`, `NANOGPT.cues`) and is re-exported from `learn-tutor-select.js` for existing callers. A journey domain has no cue map, so its claims use their registry `cues` only, as before. |
| F2 | `web/src/LearnTutor.jsx` `onTurn`: `domain === NANOGPT && wantsCard(built)`, `showableCards()` | The card slot was held by domain identity. | `!domain.showCard && wantsCard(built)`, `showableCards(domain)`. A domain whose cards are inserted (no showCard of its own) holds a place. A journey's showCard reveals blocks already on the canvas. Behavior is unchanged for both domains. |
| F3 | `web/src/learn-tutor.js` `enterHole(store, record)` → `holeConcept(record)` (the default nanoGPT domain); `LearnTutor.jsx` called it for every hole | A Rabbit Hole opened from a journey section read the nanoGPT concept names. The regression showed the old code giving the aqueduct hole "Weighted average of the outlets" the nanoGPT concept `attention-output`, and the tidal hole "Attention to the turbine" the concept `attention`. | `enterHole(store, record, domain = NANOGPT)` passes the domain to `holeConcept`. `LearnTutor.jsx` builds the domain once (`domainOf(canvas)`) for both the turn and the hole entry, so a journey hole reads its concept from the journey registry (`castellum-split`, `barrage-turbine`). |
| F4 | `web/src/learn-journey.js` and `control-plane/src/agents/learn-journey.js` validators, `learn-tutor-routes.js` probe grading | The count caps (16 concepts, 40 claims, 12 cues, 1-12 sections, 4 expected_evidence, 3 asked, 5 pending edits, 2-4 probes, 1-3 probe claims, 2-4 options, 2-6 steps, 3 checks) were inline literals. They were spec caps, not example coupling, but they were neither named nor tied to the spec. | `JOURNEY_LIMITS` (`web/src/learn-journey.js:106-114`) names each cap with its architecture section (§4, §6.3, §6.6, §9.2-§9.4). The validators, the walker, `path_edit` and the evaluate route's probe-claims cut read it. Every error message is byte-identical. |

The architecture table row for `learn-tutor-select.js` (§3.4) now says where cues come from.

## Journey domain self-containment (no nanoGPT reads on a journey path)

- The journey-only modules import no nanoGPT module: `learn-journey.js`, `learn-journey-domain.js` and
  `learn-journey-materialize.js` import nothing; `LearnJourney.jsx` imports only the materializer and the resolver.
  The regression's source check enforces this.
- Server: the journey route derives states over `j.registry.claims` (`control-plane/src/learn-journey.js:62`, explicit
  even when empty). The evaluate route builds its spec from the journey registry (`journeySpec`) and grades probes from
  their stored keys.
- Browser Tutor: every stage takes `domain` (`buildTurn`, `turnClaims`, `selectClaims`, `evaluationSpec`,
  `plannerContext`, `validateActions`, `executeActions`, `practiceEvents`, `deriveClaimStates`, `reconcile`), and the
  journey turn passes it everywhere. `route()` reads no domain data: claims and states arrive scoped. The one leak was
  F3. The `domain = NANOGPT` defaults remain for the nanoGPT callers, whose behavior is pinned byte-identical
  (planner-context snapshot, golden traces, corpus).
- No LP1-added line outside the `NANOGPT` object special-cases nanoGPT any more. The remaining domain dispatch is
  typed:
  - `learn-tutor.js:299` `domain.kind === 'journey'` adds `journey_context`, a journey-only field.
  - `agents/learn-tutor.js:275-276, 321` choose the journey prompt when `context.journey_context` is present, else the
    nanoGPT course's pinned `PLANNER_SYSTEM`.

## Fixture reachability (test-only gate)

- `learn-journey-fixtures.js` is imported by production code only in `learn-journey-planners.js:16`.
- It is used only at `learn-journey-planners.js:38`:
  `journeyCallModel = env => (env.SMALL_ENV === 'test' && env.JOURNEY_MODEL_STUB === 'fixtures' ? fixtureModel : LOGGED)`.
- Every other importer is a test or the e2e harness: `learn-journey-planners.test.js`, `learn-journey-prompts.test.js`,
  `learn-journey-route.test.js`, `learn-tutor-journey.test.js`, `tool-input.test.js`,
  `learn-journey-materialize.test.mjs`, `learn-tutor-domain.test.mjs`, `e2e/journey-corpus-run.mjs`.
- Existing pins: `learn-journey-planners.test.js` checks the gate in all four env combinations.
  `rabbit-hole-prod-config.test.js` checks that no production config names `JOURNEY_MODEL_STUB` and that the app
  Worker sets no `SMALL_ENV`.
- No production branch reads a fixture id or title. The fixture's own `titlesFor` (line 10, the spec's logistic
  regression titles), `OVERVIEW = [0, 2, 3]` (13) and `PART_OF` (15) are fixture data.

## Intent and intake resolver

- `learner-intent-journey.js` rules are generic phrasing only:
  - broad verbs ("teach me", "I want to learn", ...);
  - "show me how to build", "give me an N-minute overview of", "in N minutes";
  - filler, greetings and setup-skip clauses;
  - generic topic noise and tails (politeness, time frames, "from scratch");
  - deictic and contentless topics;
  - the tray rules: cancel phrases, edit verbs, accept words and ordinals.
- The topic is captured from the text (`cleanTopic`) and never matched against a list. The topic words in lines 12,
  27, 38 and 41 are comments illustrating the phrasing rules.
- `teach-plan.js` takes the resolver's topic and the learner's own spelling of it from the raw text.

## Every remaining occurrence, and why it is allowed

Prompt few-shot examples (allowed: prompts):
- `control-plane/src/agents/learn-journey.js:26` `DRAWN_RULE` (a LEFT JOIN example).
- The `examples` sections of the five planner prompts: resolver 57-64, diagnostic 88-93, path 127-133, adapt 163-170,
  section 196-200 (plate tectonics, eigenvectors, SQL joins, gradient descent, matrix multiplication, mantle
  convection). The file header (15-16) states that they deliberately use other subjects than the fixtures, and
  `test/learn-journey-prompts.test.js` fails if a fixture subject reaches a system text.
- `control-plane/src/agents/learn-tutor.js:235-239`: the journey Tutor prompt's examples (sky colour, learning rate,
  eigenvectors).

Declared nanoGPT course domain (allowed: the course is a declared domain; nothing on a journey path reads it):
- `web/src/learn-tutor-claims.js`: `CONCEPTS`, `CLAIMS`, `PRACTICE`, `CARD_CLAIMS`/`PART_CLAIMS`, `SLICE_CARDS`, the
  ladder, `CUES` (204-215) and `NANOGPT` (223-232).
- `web/src/learn-tutor.js:11-12`, `learn-tutor-validate.js:14`: the nanoGPT board imports, used through the domain
  default and the authored-module `showCard`.
- The `domain = NANOGPT` parameter defaults across `learn-tutor*.js`.
- Removed by Professor Next Steps Task 0 (owner, 2026-10-06): `LearnTutor.jsx` `COURSE_REPO`, its course-board/repo
  activation and the `domainOf` nanoGPT fallback, and `LearnPage.jsx` `app.repo === 'karpathy/nanoGPT'`. Tutor
  availability now comes from `web/src/learn-tutor-domains.js`: the `TUTOR_DOMAINS` registry data (nanoGPT is its one
  entry: repo, board, domain, capabilities) and the generic `tutorContext` resolver (live journey, a hole's parent
  journey, then a registered entry with `capabilities.tutor`). `learn-journey-anti-hardcoding.test.mjs` fails on any
  nanoGPT repository, board, domain or name comparison in the shared Tutor code.
- `control-plane/src/agents/learn-tutor.js:171-180`: `PLANNER_SYSTEM`, the nanoGPT prompt, byte-identical to main and
  pinned, including `e.g. "Softmax"`. `:275-276, 321`: prompt choice by the presence of `journey_context`.
- `web/src/LearnPage.jsx:10, 29, 71-73, 892-981, 1337, 1345`: the sigmoid demo and the nanoGPT course, both on main and
  untouched by LP1. LP1 changed only the comments at 548-552. Task 0 reads `suppliedCourse` from the registry entry's
  `capabilities.suppliedCourse`; the lesson content it gates is unchanged.

Comments and UI copy that cite an example (allowed: no logic reads them):
- `learner-intent-journey.js:12, 27, 38, 41`, `LearnJourney.jsx:295`, `dive.js:59, 68, 75` (on main),
  `learn-tutor-select.js:11, 24, 37`, `learn-tutor-validate.js:186`, `learn-tutor.js:62, 243`,
  `learn-tutor-routes.js:6, 283`, `learn-journey-domain.js:2-3`, `learn-journey.js:127`,
  `agents/learn-tutor.js:394`.
- `web/src/agent/teach-plan.js:13` `NEEDS_TOPIC`: the hint shown when a request names no topic ("for example: Teach me
  logistic regression, skip setup"). Static copy; no code compares against it.

Test-only gate: `learn-journey-fixtures.js:7-15` (see above).

False positives: "sql" in `repository-schema.sql:202`, `canvases.js:146` and `index.js:89` comments, and the store's SQL
strings; `radial-gradient` CSS at `AdaptiveCanvas.jsx:3060`; the model ids `gpt-image-1` and `gpt-4o-transcribe` at
`dev-worker.js:127, 199` and Fish's `model: 's1'` header at `dev-worker.js:180` (all on main); "threshold" in the JEV
comment at `agents/learn-tutor.js:58` (on main); `'explain'`/`'predict'` in production are schema enums
(`EVIDENCE_KINDS`, `PURPOSES`, the section schema), not the fixture's step ids.

No fixture id or fixture title appears in production code. No visible label is used as logic: UI logic compares
semantic ids and enums only (tray option ids `start`, `retry`, `skip`, `continue`, `edit`, `tutor`, `generate`,
`not_now`; the slot id `goal`; tray modes; section statuses; error codes). Labels travel as data in two places:
- the resolver's rule 1 matches the learner's text against the open tray's own option labels;
- the path preview sends the chosen option's label as the edit text (`LearnJourney.jsx:338`).

## Magic numbers: each one decided

| Value | Where | Decision |
|---|---|---|
| Count caps | `JOURNEY_LIMITS` (`web/src/learn-journey.js:106-114`) | Spec contract caps, named (F4). |
| Count caps as prompt text | `control-plane/src/agents/learn-journey.js` planner prompts (e.g. 2-4 probes, 2-6 steps, at most 12 sections) | Prompts are an allowed place for the contract. The validators read `JOURNEY_LIMITS`, so a cap change must also update this prompt text; the prompt suite pins the change-text limits (300/300) against the schema, but not these counts. |
| `QUICK_SECTIONS = 3` | `control-plane/src/learn-journey.js:29` | Named; AT-14 (a quick overview has at most 3 sections). |
| `STALE_MS` (3 min), `TURN_TIMEOUT_MS` (60 s), `ARTIFACT_TIMEOUT_MS` (120 s) | `learn-journey.js:28`, `LearnTutor.jsx:21`, `learn-journey-materialize.js:14` | Named operational timeouts. |
| 5 s poll | `LearnJourney.jsx:424` | A documented `ponytail:` poll while a planner call is pending. |
| `DEPTH_MINUTES` 10/30/60 | `web/src/learn-journey.js:24` | The intake bank's own option labels (~10 min, ~30 min, ~1 h, §6.2). |
| `maxTokens`, `effort` per role | `learn-models.js` `LEARN_TASKS` | Declarative model config. |
| `REASON_MAX`, `NOTE_MAX` | `agents/learn-journey.js:22` | Named; also the schema's `maxLength`. |
| Text lengths (80, 120, 240, 300, 600, 1000, 4000) | the validators, the tool schema `maxLength`, the routes | Per-field schema limits, stated in every error message and in the schema. |
| 6 options, prompt 300, label 120, text 1000 | `control-plane/src/learn-journey.js:47-48`, `LearnJourney.jsx:76-80` | Trust-boundary bounds on what reaches a paid model; the client mirror is documented at the use site. |
| claims ≤ 6, gaps ≤ 4, gap statement ≤ 600 | `learn-tutor-routes.js` `journeySpec`, `learn-tutor.js` `evaluationSpec` | `validateEvaluateBody`'s caps (on main), documented at the use site. |
| 4 / 6 / 200 in `journeyDomain` and `journeyDiveContext` | `learn-journey-domain.js:47, 73, 74, 77`, `LearnJourney.jsx:52, 55` | §3.3's context budget (about 1.5 KB), documented at the use site. |
| `ORDINALS` (four rows) | `learner-intent-journey.js:86` | Resolver vocabulary: an ordinal past the fourth goes to rule 5. Not tied to any example. |
| `current[0]`, `probes[Math.floor((n - 1) / 2)]`, `probe.claims[0]`, `sides[0]` | `learn-journey.js:195, 226`, `LearnTutor.jsx:108`, `learner-intent-journey.js:65` | `current[0]` is the only current section (invariant 2 checks for more). The first probe is computed from the ladder length. `probe.claims[0]` is the open question's representative claim; the route grades every probe claim and ignores the body's. `sides[0]` is the left clause. |

The keyless fixture's counts (8 sections, 3 steps, 3 probes, 3 concepts, 6 claims) appear nowhere in the runtime. The
regression runs 5 and 3 sections, 4 and 2 steps, 4 and 2 probes, 4 and 2 concepts, and 7 and 3 claims.

## Regression

Files:
- `packages/web/src/__fixtures__/journey-synthetic-domains.mjs`. Two domains in model-output form:
  - Roman aqueducts: 4 concepts, 7 claims, 4 probes (mcq, prediction with 4 options, explain_back, mcq), 5 sections
    with ids `alpha`-`echo` and an optional first section, 4 steps `st-9`, `st-3`, `st-7`, `st-1` with roles
    prediction, framing, worked example, transfer check, and 1 section check.
  - Tidal energy: 2 concepts, 3 claims, 2 probes, 3 sections `sec-x*`, 2 steps, no checks, "in 20 minutes" stated.
  - `reordered(d)`: concept and claim map keys reversed, every probe's options reversed.
- `packages/web/src/learn-journey-anti-hardcoding.test.mjs` (7 tests). Per domain and per reordered copy:
  - `journeyIntent` captures the topic from the text.
  - `journeyStep` runs intake, `diagnostic_ready`, the walker, `path_drafted`, accept, `section_planned` and
    `section_materialized`.
  - `diagnosticOutput`, `pathOutput`, `sectionOutput`, `validateRegistry` and `validatePath` accept the domain.
  - `trayFor` gives the right tray in every state; `nextProbe` starts mid-ladder and stops within `JOURNEY_LIMITS.asked`;
    `pathEntries` numbers every section.
  - `materializeSection` on a fake canvas draws only the first non-optional section, with its steps in plan order and
    stamped, and throws for every other section.
  - `journeyDomain`:
    - cards are only this journey's current-section steps (a stale journey's block and a later section's block are
      excluded);
    - default scope is the section's expected evidence;
    - the registry cues select a claim, and nanoGPT cue words select nothing;
    - the evaluation spec gaps come from this registry;
    - `plannerContext` carries the section and upcoming titles;
    - `validateActions` rejects a later section's card;
    - `runTurn` sends this journey's id and claim ids, and the plan request carries the section.
  - `journeyDiveContext` + `diveRecord` carry this journey's ids; the dive domain scopes the dive's claims;
    `enterHole` takes the hole's concept from this registry even when the title names a nanoGPT concept.
  - The reordered copy gives an identical summary.

  Also:
  - the nanoGPT data under another kind label selects exactly as `NANOGPT`, and a domain's cue map is read;
  - a source check: no example topic or fixture id in the code (comments stripped) of the 8 journey-only modules, and no
    dispatch on `kind === 'nanogpt'` or `=== NANOGPT` in the 7 shared Tutor/UI modules;
  - both domains differ from the fixture in every count and stay inside the caps.
- `packages/control-plane/test/learn-journey-anti-hardcoding.test.js` (4 tests). Per domain and per reordered copy,
  the real `journeyRoute` and `tutorRoute` on node:sqlite, with the planners answering with the domain (never the
  fixture model):
  - start: the planner input topic is the learner's;
  - intake by this domain's options;
  - the walker on this ladder: keyed answers graded by the stored key, including a keyed misconception. The free-text
    answer's JEV request equals `tutorJevRequest(evaluationSpec(...))` over this registry;
  - the path draft input carries this registry and its evidence refs;
  - accept plans only the first non-optional section; every other section keeps its status and `not_generated`;
  - `section_materialized` marks it generated with its heading;
  - a section check is graded by its key;
  - the reordered copy gives identical roles, grades, sections and asked probes.

Proof that the regression catches the fixed hardcoding: with the four fix files (`learn-tutor-select.js`,
`learn-tutor-claims.js`, `learn-tutor.js`, `LearnTutor.jsx`) stashed back to `89d39b66`, 6 of the 7 web tests failed:
- the four domain runs: hole concept `attention-output`/`attention` instead of `castellum-split`/`barrage-turbine`;
- the kind-label test: selection changed under another label;
- the source check: `kind === 'nanogpt'` and `=== NANOGPT`.

With the fixes, all pass.

## Gates

| Gate | Result |
|---|---|
| `make test-unit` | green. pytest 31 passed; web 1740/1740; control-plane 979/979; viz-benchmarks 1/1 + 1/1; evals 26/26. |
| Golden traces `node --test src/learn-tutor.test.mjs` | 18/18 |
| New regression | web 7/7, control-plane 4/4 |
| Free corpus `node e2e/tutor-corpus-run.mjs --stage lp1-audit --out <SDD>/corpus-audit` (stub, not `--live`) | identical to `corpus-before`. After removing `ms`, `*_ms`, `to_*`, `*_at`, `stage`, `trace_id`, `turn_id` and `id`: 0 of 44 rows differ, and the summaries are equal. |

The one wiring pin that broke mid-audit (`learn-journey-ui.test.mjs` Task 14 pins the hole-domain expression) is kept
as written: `domainOf(canvas)` builds that exact expression.


## Review follow-ups (2026-10-06)

- `learn-tutor.js` adds `journey_context` when the domain carries a `context`, not on `kind === 'journey'`. The source check now also bans `kind === 'journey'` dispatch in the shared Tutor code.
- `learn-journey-domain.js` caps the scope claims with `JOURNEY_LIMITS.expected_evidence`, not a literal 4.
- `learn-journey-ui.test.mjs` pins the F3 call site `enterHole(load(), record, domainOf(canvasApi.current))`.

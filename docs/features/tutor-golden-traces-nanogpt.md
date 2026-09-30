# Tutor golden traces — NanoGPT

Status: reviewed design traces for the Tutor architecture session and later acceptance tests.
Documentation and test design only: nothing here changes cards, the renderer, card data, tests or
Tutor code. There is no Tutor today, and nothing here decides an open Tutor question.

Baselines:
- Spec: docs/features/adaptive-tutor-v1.md on `docs/tutor-cards-runtime` (T1, J5, …), including the
  identifier correction in 042c84c9.
- Open questions: docs/features/tutor-architecture-brainstorm-agenda.md (R*, E*, O*, D*, …).
- Cards: the frozen NanoGPT set. The card sources are identical on `feat/canvas-block-conversations`
  (cbec3bef) and `feature/final-integration` (af572dcc); `git diff` of `packages/web/src/nanogpt`,
  `scene-activity.js`, `scene-describe.js` and `card-plan.js` between them is empty.

Every card fact below was read from the source files cited. The agent-context excerpts were
produced by running the real `cardBlock`, `describeAnimation`, `describeActivity`, `enterPractice`,
`setActivityAnswer`, `applyCheck`, `applyNewAttempt` and `partIndex` functions in a read-only probe
(not committed).

## How to read a trace

| Label | Meaning |
|---|---|
| **LOCKED** | Already decided by the spec or the owner. The trace asserts it. |
| **EXPECTED** | Follows from a locked rule or from the runtime as it is. |
| **ALLOWED** | A valid move for the future Tutor; a trace passes if the Tutor picks any allowed move. |
| **FORBIDDEN** | A move that fails the trace. |
| **OPEN DECISION** | Deliberately not decided; points to the agenda item. The trace exposes it. |
| **CURRENT** | What the runtime and the learner can do today, with no Tutor. |
| **FUTURE** | What a future Tutor might do. Opening, suggesting or navigating to another card is always FUTURE: no Tutor or navigation tool exists today, and whether the Tutor suggests or navigates is D4. |

Evidence states: `understood · uncertain · misconception · prerequisite_gap · not_yet_observed`, per
concept and claim. No mastery score; no learner labels.

Claim names such as `causal-mask/reads-self-and-earlier` are trace-local labels. The runtime has
concept ids (`conceptId` on scene objects, e.g. `causal-mask`) but no claim ids; see gap G5.

## Identifiers

- **Two identifiers per card, never interchangeable.** The runtime scene / board-block identity is
  `scene.id` (`block.scene.id`). The authored card identity is `evidence.card`; every relationship
  and transition uses it (`nanogpt/depth/transitions.test.mjs:19-21`,
  `nanogpt/relationships.test.mjs:20-21`).
  - Deep-dive cards: normally different, e.g. authored `c11-causal-mask`, runtime
    `nanogpt-c11-causal-mask`. The exception is c06: both `c06-tokenizer`.
  - Depth cards: equal, e.g. `depth-attention-deep`.
  - Traces show both: "Authored card / Runtime scene" for deep-dive cards, one value for depth
    cards.
- **Metadata coverage (43 card modules):** `scene`, `sources`, `evidence` (with `evidence.concept`)
  and object `conceptId`s on all 43; `reviewStates` on 33; `plan` on 15 of the 25 deep-dive cards
  and none of the 18 depth cards; `activity` (practice) on 13. The spec and agenda were corrected
  accordingly in 042c84c9.
- **Concept keys that exist today:** `conceptId` on scene objects, which `describeAnimation` already
  reports as "Concepts: …". Examples: c11 `causal-mask`; c10 `attention-output`,
  `softmax-attention-weights`; depth-attention-guided `attention, query, keys, dot-product,
  causal-mask, softmax, values`.
- **Sub-card ids:** only the six Deep modules export `partIds`. Attention Deep:
  `shapes, causal-mask, memory, scaling`, labelled "Shapes: split, view, transpose", "The causal mask
  and att", "fp32 memory and the fused path", "The 1/√hs experiment"
  (`nanogpt/depth/attention/deep.js:413`).
- **No card declares `transferable_inputs`.** The contract exists
  (docs/nanogpt-depth-ladder.md:220-223); today every transition would carry zero inputs. This is
  not a bug.

Cards used (all under `packages/web/src/nanogpt/`):

| Authored card (`evidence.card`) | Runtime scene (`scene.id`) | File | Depth / sequence | Practice (`activity`) |
|---|---|---|---|---|
| depth-attention-overview | same | depth/attention/overview.js | Overview | none |
| depth-attention-guided | same | depth/attention/guided.js | Guided | none |
| depth-attention-deep | same | depth/attention/deep.js | Deep dive, 4 parts | none |
| depth-architecture-deep | same | depth/architecture/deep.js | Deep dive, 3 parts | none |
| c10-weighted-values | nanogpt-c10-weighted-values | cards/c10-weighted-values.js | "Self-attention" 3/3 | `choice_equals`, fixed `{query: 3}` |
| c11-causal-mask | nanogpt-c11-causal-mask | cards/c11-causal-mask.js | "Self-attention" 1/3 | `choice_equals`, fixed `{mask: true}` |
| c12-score-scaling | nanogpt-c12-score-scaling | cards/c12-score-scaling.js | "Self-attention" 2/3 | `choice_equals`, fixed `{multiplier: 1}` |
| c21-temperature | nanogpt-c21-temperature | cards/c21-temperature.js | generation | none |

Depth cards carry `evidence.depth`, `evidence.prerequisites` (prose) and `evidence.ladderRole`. No
depth card has practice. All sources pin `karpathy/nanoGPT@3adf61e`; the `sourceRevision` string is
written two ways (`…@3adf61e…` and `… @ 3adf61e…`; gap G11).

---

## Core traces

### GT-01 — Overview understood → Guided

- **Scenario:** the learner restates the Overview idea correctly in plain words.
- **Start:** authored card / runtime scene `depth-attention-overview` (no parts); input `reader`
  (index picker, default 8). Concepts on the card: `attention, attention-weights, context,
  causal-mask`.
- **Starting evidence:** `attention/*`: not_yet_observed.
- **Learner:** "When it reads a character it looks back at earlier ones, mostly at one place, and never
  ahead."
- **Deterministic observations:** `describeAnimation` gives the title, `reader` value, and
  "Concepts: …". No practice, no view or dwell event, no card id in the text (gaps G1, G2).
- **Evaluator:** no deterministic check exists on depth cards → JEV free-form. Where the expected
  ideas come from is OPEN DECISION (V6).
- **Expected evidence update:** EXPECTED `demonstrated_here` pass on
  `attention/looks-back-never-ahead`. LOCKED (T1): restating the drawn case never makes a claim
  `understood`; with only `demonstrated_here` evidence the state is `uncertain`.
- **Navigation:** the next rung is `depth-attention-guided` by `DEPTH_LADDER` order
  (`nanogpt/depth/board.js:29-36`). The card's `transitions` declare only
  `deepens_to c11-causal-mask`, with no Overview → Guided transition.
- **CURRENT:** the learner can scroll to the Guided card on the board; nothing navigates for them.
- **FUTURE / ALLOWED:** suggest `depth-attention-guided`, or open it if D4 allows navigation; ask one
  transfer prediction first (T4); point to `c11-causal-mask` along the declared `deepens_to`.
- **FORBIDDEN:** labelling the learner (e.g. "intermediate"); marking `attention` understood;
  regenerating a basic explanation of what they just stated.
- **Tool:** reuse the authored Guided card before generating (T-8, OPEN).
- **OPEN DECISION:** D1 (when to go Overview → Guided); D4 (navigate or suggest); E4 (what is enough
  for understood).

### GT-02 — Practice fail once

- **Scenario:** one wrong answer on a deterministic card task.
- **Start:** authored card `c11-causal-mask` / runtime scene `nanogpt-c11-causal-mask`, which the
  learner reached from the Guided card (declared `deepens_to` from `depth-attention-guided`). Input
  `mask` (bool, default on).
- **Practice task (real):** `c11-practice`, `choice_equals`, fixed `{mask: true}`. Prompt: "…which
  positions may the query at position 99 read?" Options: `before` = 0 to 98, `self` = 0 to 99,
  `target` = 0 to 100, `all` = 0 to 255. Expected `self` (`cards/c11-causal-mask.js:125-144`).
- **Starting evidence:** `causal-mask/*`: not_yet_observed.
- **Learner action:** enters practice, picks `target`, presses Check.
- **Deterministic observations (real output):**
  - `attemptLog = [{"taskVersion":1,"answer":"target","practiceInputs":{"mask":true},"inputRevision":1,"result":"failed"}]`
  - `describeActivity`: "Status: submitted and failed (attempt 1). Learner's committed answer:
    "target"". The expected value is never included (LOCKED).
  - The card shows its authored `feedbackFail`, which states the rule and the correct range.
- **Evaluator:** deterministic (`choice_equals`). No JEV.
- **Expected evidence update:** a failed record on `causal-mask`. EXPECTED (owner brief): one failed
  attempt does not by itself become `misconception`. How the record maps to T1 (result value, claim,
  `demonstrated_here` or transfer) is OPEN DECISION (E3, E6, X2).
- **CURRENT:** the card's feedback and New attempt are the whole response.
- **FUTURE / ALLOWED:** nothing (the card's feedback may be enough); one question on the card's own
  table; suggest New attempt.
- **FORBIDDEN:** recording `misconception` from this single attempt; a new explanation card; any
  statement of ability.
- **Note:** the option id `target` coincides with the word "target" in the explanation. The agent
  sees the id, not the label "0 to 100" (gap G6).
- **OPEN DECISION:** E3, E6, M1, M2.

### GT-03 — Same wrong model repeatedly

- **Scenario:** the learner keeps a consistent wrong model: a position may read its own next
  character.
- **Start:** as GT-02 (authored `c11-causal-mask` / runtime `nanogpt-c11-causal-mask`), after one
  failed attempt.
- **Learner action:** New attempt → `target` again → Check. Then says: "Position 99 has to see
  character 100, otherwise how can it predict it?"
- **Deterministic observations (real):** `attemptLog` holds two identical failed records (answer
  `target`, `taskVersion` 1, `inputRevision` 1). Neither carries a timestamp, sequence number or
  concept tag (G3, G4). `describeActivity`: "submitted and failed (attempt 2)".
- **Evaluator:** deterministic ×2; JEV on the message (misconception check "reads its own target";
  J6).
- **Expected evidence update:** EXPECTED `uncertain` at minimum. Whether two identical deterministic
  fails plus a matching JEV misconception check become
  `misconception: causal-mask/reads-next-target` is OPEN DECISION (E3). The threshold is not
  hard-coded here.
- **FUTURE / ALLOWED:** a Socratic question on the card itself. The highlighted cells are each row's
  next character (`causal-mask-table` `cellHighlight [1,8,15,22,29]`), so the question could be what
  row 3 would learn if it could read its highlighted cell. Or a counterexample from training
  targets: c11's prose `plan.prerequisites` defer the objective to c16 and c26; this is not a
  declared relationship.
- **FORBIDDEN:** repeating the same prose explanation a third time (T7); revealing the answer again
  as the only move; a learner label.
- **OPEN DECISION:** E3, S1, S4, M1, M2.

### GT-04 — "Don't simplify this. Show me the implementation."

- **Start:** authored card / runtime scene `depth-attention-overview` (`evidence.depth` = Overview).
- **Starting evidence:** `attention/*`: uncertain.
- **Learner:** "Don't simplify this. Show me the implementation."
- **Deterministic observations:** current depth Overview. The authored Deep card exists
  (`depth-attention-deep`, 4 parts, 25 pinned sources); `c11-causal-mask` has 17 sources
  (model.py:46-50, :67-69, …).
- **Resolver (future):** EXPECTED explicit constraints "no simplification" and a deep or
  implementation request (R3, R10). LOCKED: the raw message is kept.
- **Expected evidence update:** none. A request is not evidence of understanding. Whether the
  preference is persisted is OPEN DECISION (PS1).
- **CURRENT:** the learner can open the Sources disclosure on the card, or scroll to the Deep card.
- **FUTURE / ALLOWED:** suggest `depth-attention-deep` (default part `shapes`), or open it if D4
  allows; point to the Sources disclosure; quote the pinned model.py ranges.
- **FORBIDDEN:** an Overview-style re-explanation; labelling the learner ("advanced"); generating a
  new implementation walkthrough while the authored Deep card and sources exist, unless they do not
  meet the need (T-8 candidate principle, OPEN).
- **Navigation:** there is no declared Overview → Deep transition, only ladder order.
- **OPEN DECISION:** D4, D5, T-8, R10.

### GT-05 — "Just show me the math"

- **Start:** authored card / runtime scene `depth-attention-guided`. Inputs `reader` (slider,
  default 3) and `lookFor` (choice, default `before`). Objects include `query`, `keys`, `products`,
  `products-exact`.
- **Starting evidence:** `attention/*`: uncertain.
- **Learner:** "No more analogies. Just show me the math."
- **Resolver (future):** EXPECTED constraint "no analogy"; requested modality: formal (R3).
- **CURRENT:** the Guided card already shows exact numbers; the learner can read or change them.
- **FUTURE / ALLOWED:** point at the Guided card's own exact numbers (`products-exact`, the ÷√hs, −∞
  and softmax steps); suggest `depth-attention-deep` part `causal-mask` ("The causal mask and att")
  or `scaling` ("The 1/√hs experiment"); quote the pinned model.py lines.
- **FORBIDDEN:** another intuition or cartoon sequence; switching to Overview; motion.
- **OPEN DECISION:** R10, M5 (scope of the constraint), D5.

### GT-06 — Softmax prerequisite gap

- **Start:** authored card / runtime scene `depth-attention-guided`; `evidence.prerequisites`:
  "Looking back at earlier characters (the Overview idea); dot product; softmax."
- **Starting evidence:** `attention/scores-from-dot-products`: uncertain (a correct prediction of the
  highest-scoring key on this card, `demonstrated_here`).
- **Learner:** "I get that q·k gives a score, but why do the weights add up to one? Why isn't the score
  just the weight?"
- **Real content:** this shows why prerequisite routing cannot simply mean "every prerequisite →
  an existing card".
  - No dedicated softmax card exists.
  - `softmax` appears as a `conceptId` on `depth-attention-guided` and `c21-temperature`, and
    `softmax-attention-weights` on `c10-weighted-values` and `c13-multi-head`.
  - `c11-causal-mask` and `c12-score-scaling` name softmax only in prose `plan.prerequisites`
    ("softmax turns a row of scores into weights that sum to 1 (named, not taught)").
  - There is no structured relationship or transition to softmax.
  - The only `alternative_explanation` in the set is `c12-score-scaling` → `c21-temperature` (a
    softmax with a divisor).
- **Evaluator:** JEV on the question (is this a prerequisite gap, not a misconception about attention?).
- **Expected evidence update:** EXPECTED candidate `prerequisite_gap: softmax` for this attention
  claim. Whether a question alone can set it is OPEN DECISION (E1).
- **CURRENT:** the learner can use the Guided card's softmax step, or `c21-temperature` (authored /
  runtime `nanogpt-c21-temperature`), which teaches softmax with T.
- **FUTURE / ALLOWED:** one question; point to either card above; later, suggest a Softmax child
  canvas (GT-D2; `/dive` is not implemented).
- **FORBIDDEN:** teaching all of attention again; creating or navigating to a child canvas silently.
- **OPEN DECISION:** R7 (prerequisite selection), N1, N2, T-8.

### GT-07 — Strong transfer explanation

- **Start:** authored `c11-causal-mask` / runtime `nanogpt-c11-causal-mask`, after GT-03's two failed
  attempts.
- **Learner:** "If block_size were 8, row 3 keeps columns 0 to 3, four of the eight. Column 4 is its
  own next character, so it's blocked with everything after it."
- **Deterministic observations:** optionally a third attempt `self` → passed. Real log:
  `…,{"answer":"self",…,"result":"passed"}`.
- **Evaluator:** JEV on the free-form transfer (an unseen T, not the drawn 6×6); deterministic for the
  attempt.
- **Expected evidence update:** LOCKED (T1): a settled `demonstrated_in_transfer` pass with no later
  settled fail makes the claim `understood`, and newer settled evidence supersedes the earlier fails
  (which needs an ordering signal, G3). EXPECTED: the free-form answer is the transfer evidence.
  Whether the card pass that follows a `feedbackFail` reveal counts as transfer or
  `demonstrated_here` is OPEN DECISION (E6).
- **FUTURE / ALLOWED:** acknowledge briefly; suggest the next card (`c12-score-scaling`, declared
  prerequisite `out`) or Deep part `causal-mask`.
- **FORBIDDEN:** further practice on the same claim "to be sure"; a mastery percentage.
- **OPEN DECISION:** E4, E6.

### GT-08 — Ambiguous free-form answer

- **Start:** authored `c10-weighted-values` / runtime `nanogpt-c10-weighted-values`. Practice
  `c10-practice`: `choice_equals`, fixed `{query: 3}`, options unchanged / own / top / average /
  sum, expected `average`.
- **Learner (free text, not the practice):** "The output is kind of in the middle of the values it can
  see."
- **Evaluator ladder:** no deterministic check applies → JEV with checks such as
  "weighted average of visible values", "selects the top value (misconception)", "non-attempt".
  "Middle" matches averaging but not weighting, so JEV returns `uncertain` → the larger evaluator.
  LOCKED: J5 and J16; JEV produces evidence only and never chooses the move (J10, J15).
- **Expected evidence update:** none settled by JEV `uncertain` alone (LOCKED, T1). The larger
  evaluator's result is recorded.
- **FUTURE / ALLOWED:** one clarifying question ("middle by what rule?"); point at the card's own
  weight row.
- **FORBIDDEN:** JEV's output choosing the next move; treating `uncertain` as a fail.
- **OPEN DECISION:** V3, V4, E7, E8 (`partial`).

### GT-09 — Repeated success → do not over-teach

- **Start:** authored `c11-causal-mask` / runtime `nanogpt-c11-causal-mask` after GT-07, and
  `c12-score-scaling` practice passed (`sixth`).
- **Learner:** "Is it the same mask in every layer?"
- **Deterministic observations:** two passed card tasks; the answer is in c11's pinned sources
  (model.py:99 "every Block has its own causal attention", :130 n_layer Blocks; same triangle).
- **Expected evidence update:** none. A factual question is a signal, not a result (E1, OPEN).
- **FUTURE / ALLOWED:** a one- or two-sentence answer citing the source (T16).
- **FORBIDDEN:** a new lesson, practice, or a generated artifact (T5a).
- **OPEN DECISION:** T-2.

### GT-10 — "Don't quiz me"

- **Start:** authored `c11-causal-mask` / runtime `nanogpt-c11-causal-mask` after GT-02 (one failed
  attempt).
- **Learner:** "Don't quiz me. Just explain it."
- **CURRENT:** card practice is learner-driven (`enterPractice` runs on the learner's action), so
  nothing can force it.
- **LOCKED:** an explicit preference outranks an inferred teaching preference.
- **Expected evidence update:** none. `causal-mask` stays `uncertain`.
- **FUTURE / ALLOWED:** an explanation using the card; no question in this turn.
- **FORBIDDEN:** a quiz, challenge or explain-back request in the reply.
- **OPEN DECISION:** scope per turn, per concept or per session (M5, S7); where it is stored (PS1);
  how the Tutor later gets transfer evidence without quizzing (E4).

### GT-11 — Card practice passed, explain-back weak

- **Start:** authored `c11-causal-mask` / runtime `nanogpt-c11-causal-mask`; first attempt `self` →
  passed.
- **Learner explain-back:** "The mask hides the future so it can't cheat. It's applied after softmax
  to zero those weights."
- **Real source:** masking happens before softmax: `masked_fill(… == 0, float('-inf'))`, then
  `F.softmax` (model.py:67-69, cited in c11 `sources`). This is also the spec's own J3 example.
- **Evaluator:** deterministic (the pass); JEV on the explain-back: idea "future hidden" true; "applied
  before softmax" false; misconception "mask after softmax" likely.
- **Expected evidence update:** LOCKED (T1): conflicting evidence → `uncertain`. FORBIDDEN: declaring
  `understood` from the single deterministic pass. Whether a `misconception` record is created on the
  claim `causal-mask/applied-before-softmax` depends on JEV's status (J5); the resolution is OPEN
  DECISION (E5).
- **FUTURE / ALLOWED:** one hint at "what happens before softmax" (the spec's own Confucian example);
  point at c11's step ② label ("weights: 0 → score −∞ → weight 0").
- **OPEN DECISION:** E5, E6, E7.

### GT-12 — Card practice failed, explanation strong

- **Start:** authored `c11-causal-mask` / runtime `nanogpt-c11-causal-mask`; first attempt `before`
  (0 to 98) → failed.
- **Learner:** "Each position reads itself and all earlier positions, never its next character."
- **Evaluator:** deterministic fail; JEV pass on `reads-self-and-earlier` and
  `never-reads-next-target`.
- **Reading:** the explanation contradicts the chosen option (it says "itself"; the option excludes
  99). This looks like an off-by-one slip, not a wrong model.
- **Expected evidence update:** LOCKED conflicting → `uncertain`. FORBIDDEN `misconception`.
  Distinguishing an accidental slip from a conceptual error is OPEN DECISION (P7).
- **FUTURE / ALLOWED:** one question: "Does position 99 read itself?"
- **FORBIDDEN:** re-teaching the mask.
- **OPEN DECISION:** P7, E3.

### GT-13 — Depth transition with a missing part

- **Start:** authored card / runtime scene `depth-attention-deep`, part `shapes` (pager index 0).
- **Declared transition (real):** `{ relation: 'prerequisite', target_card: 'depth-architecture-deep',
  target_part: 'one-block', from_part: 'shapes' }` (`depth/attention/deep.js:422`). `target_card` is
  an authored `evidence.card`.
- **Today:** `partIndex(depth-architecture-deep, 'one-block')` = 1. Architecture Deep's `partIds` are
  `call-site-embedding, one-block, head-and-loss`; its pager defaults to index 0.
- **Modelled case:** `one-block` is renamed or removed in a later revision.
  `partIndex(card, 'missing-part')` = `null` (real output).
- **LOCKED:** `null` means opening the whole card at its default part (`call-site-embedding`). This
  is a fallback, never an error. No inputs travel (no card declares `transferable_inputs`).
- **CURRENT:** nothing follows transitions at runtime; this is declared data plus `partIndex`.
- **FUTURE / ALLOWED:** open the card at its default part, if D4 allows navigation at all.
- **FORBIDDEN:** surfacing an error; guessing another part by label.
- **OPEN DECISION:** D6 (tell the learner?); D4.

### GT-14 — "Explain attention another way"

- **Start:** authored card / runtime scene `depth-attention-guided`.
- **Authored alternatives that exist:**
  - `depth-attention-overview` (intuition);
  - `depth-attention-deep` (equations, shapes);
  - the "Self-attention" sequence `c11-causal-mask` → `c12-score-scaling` → `c10-weighted-values`;
  - `c12-score-scaling`'s `alternative_explanation` → `c21-temperature`, for scaling only.
  - No card-level alternative for attention as a whole.
- **Expected evidence update:** none (a request).
- **CURRENT:** the learner can scroll to any of these cards.
- **FUTURE / ALLOWED:** suggest, reuse or adapt one of the authored cards above.
- **FORBIDDEN (candidate, T-8 still open):** generating a new attention explainer that duplicates an
  authored card before any authored option has been shown not to meet the need.
- **OPEN DECISION:** T-8, D5.

### GT-15 — Selection-aware "Why does this happen?"

- **Start:** authored `c11-causal-mask` / runtime `nanogpt-c11-causal-mask`; the learner draws a
  region over the table. The region resolves by semantic id, so
  `selectedObject = 'causal-mask-table'`.
- **Learner:** "Why is this zero?"
- **Deterministic observations (real `describeAnimation` excerpt):**
  - "Experiment inputs (revision 0): Causal mask (off = What-if) = On"
  - `maskTable` [[1,0,0,0,0,0],[1,1,0,…],…]
  - "Concepts: causal-mask"
  - "Selected object: causal-mask-table"
  - The table's `values` and `cellHighlight [1,8,15,22,29]`
- **Resolved target (future LearnerTurn):**
  - `raw_user_message` (kept);
  - runtime scene `nanogpt-c11-causal-mask` (from `block.scene.id`) and authored card
    `c11-causal-mask`;
  - object `causal-mask-table`;
  - concept `causal-mask`;
  - sources model.py:46-50, :67-69.
  - No card id appears in the describe text (G1), and "this zero" names a cell while selection is
    object-level (G8). The cell is therefore ambiguous: EXPECTED one clarifying question, or an
    answer that covers every 0 (they share one rule).
- **For a Deep card:** the describe text says "Showing sub-card 2 of 4: The causal mask and att", the
  index and label, not the part id `causal-mask` (G2).
- **FUTURE / ALLOWED:** answer from the mask rule and the pinned lines.
- **FORBIDDEN:** answering from a screenshot guess while structured state exists (T13).
- **OPEN DECISION:** R2 (deterministic target fields), N8 (canonical target type).

---

## Nested Rabbit Hole traces — FUTURE / NOT IMPLEMENTED (/dive)

Design traces only; `/dive` does not exist. Sequencing is locked: architecture session → `/dive`
primitive → Tutor v1. Child canvases are separate resources, arranged as a tree.

### GT-D1 — Explicit dive into softmax (FUTURE / NOT IMPLEMENTED)

- **Start:** a canvas holding `depth-attention-guided`. The learner selects the softmax step (concept
  `softmax`) and types `/dive`.
- **Future structure:** Attention canvas → Softmax child canvas.
- **Must be preserved:**
  - the parent canvas id;
  - the parent object (authored card / runtime scene `depth-attention-guided` plus the object's
    semantic id);
  - the selected concept `softmax`;
  - the return point (the card, its inputs and any open practice state);
  - evidence for `softmax` and `attention` (by concept, not by canvas);
  - the source revision (`karpathy/nanoGPT@3adf61e`).
- **OPEN DECISION:** N4, N6, N7, N8.

### GT-D2 — Tutor suggests a prerequisite dive (FUTURE / NOT IMPLEMENTED)

- **Start:** after GT-06, with `prerequisite_gap: softmax`.
- **Future Tutor:** "Softmax looks like the missing piece. Dive into it?"
- **FORBIDDEN:** creating or navigating to the child canvas without the learner's yes (unless a
  future policy explicitly allows it).
- **OPEN DECISION:** N1, N2.

### GT-D3 — Return from the child (FUTURE / NOT IMPLEMENTED)

- **Start:** the Softmax child canvas; the learner gives a transfer explanation of softmax (evidence
  on `softmax`).
- **Future:** return to the Attention parent at the recorded return point and the original question
  ("why do the weights add up to one?"). Evidence travels by concept, so `softmax` is visible in the
  parent.
- **EXPECTED:** the parent claim that was blocked by `prerequisite_gap: softmax` is re-evaluated, not
  auto-upgraded.
- **OPEN DECISION:** N4, N5, PS3.

## Motion trace — FUTURE / NOT IMPLEMENTED (/motion)

### GT-M1 — Softmax still unclear after text and static visuals (FUTURE / NOT IMPLEMENTED)

- **Start:** after GT-06. The Guided card's softmax step and `c21-temperature` were both used;
  `softmax` is still `uncertain`.
- **Future architecture:**
  1. The Learner Intent Resolver builds the LearnerTurn (target concept `softmax`, evidence, the
     representations already tried).
  2. The Tutor decides motion may help (e.g. intuition-first).
  3. The Motion Director produces a MotionBrief and a storyboard.
  4. No render is described here. Paid rendering needs confirmation (T15).
- **ALLOWED:** suggest a motion explainer.
- **FORBIDDEN:** rendering without confirmation; the Tutor writing animation code.
- **OPEN DECISION:** MD1, MD2, MD3, MD4.

---

## Matrix

| Trace | Concept | Card (authored) / depth | Evidence tested | Evaluator | Tutor decision tested | Tool / navigation tested | Depends on |
|---|---|---|---|---|---|---|---|
| GT-01 | attention | depth-attention-overview → Guided | demonstrated_here → uncertain | JEV | depth suggestion, no labels | reuse Guided; ladder order | D1, D4, E4, V6 |
| GT-02 | causal-mask | c11-causal-mask | one fail ≠ misconception | deterministic | minimum intervention | card practice, feedback | E3, E6, M1, M2 |
| GT-03 | causal-mask | c11-causal-mask | repeated wrong model → uncertain / misconception? | deterministic ×2 + JEV | Socrates trigger, stop repeating | card table as counterexample | E3, S1, S4 |
| GT-04 | attention | depth-attention-overview → Deep | none (request) | — | explicit intent over inference | Deep card, sources, T-8 | D4, D5, R10, T-8 |
| GT-05 | attention | depth-attention-guided | none (constraint) | — | explicit constraint | exact numbers, Deep parts | R10, M5, D5 |
| GT-06 | softmax (via attention) | depth-attention-guided | prerequisite_gap | JEV | prerequisite branch | reuse c21; future /dive | R7, N1, N2, E1 |
| GT-07 | causal-mask | c11-causal-mask | transfer → understood | JEV + deterministic | acknowledge, no over-practice | next card c12 / Deep part | E4, E6 |
| GT-08 | attention-output | c10-weighted-values | uncertain stays unsettled | JEV → larger | JEV is not the planner | one question | V3, V4, E7, E8 |
| GT-09 | causal-mask | c11-causal-mask + c12-score-scaling | no change | — | do not over-teach | text + source only | T-2 |
| GT-10 | causal-mask | c11-causal-mask | no change | — | explicit preference | no quiz | M5, S7, PS1, E4 |
| GT-11 | causal-mask | c11-causal-mask | pass vs weak explain-back → uncertain | deterministic + JEV | contradiction handling | one hint | E5, E6, E7 |
| GT-12 | causal-mask | c11-causal-mask | fail vs strong explanation → uncertain | deterministic + JEV | slip vs misconception | one question | P7, E3 |
| GT-13 | attention → architecture | depth-attention-deep → depth-architecture-deep | — | — | part fallback | partIndex null → default part | D4, D6 |
| GT-14 | attention | depth-attention-guided | — | — | authored before generated | reuse alternatives | T-8, D5 |
| GT-15 | causal-mask | c11-causal-mask | — | — | target resolution | selection, sources | R2, N8 |
| GT-D1 | softmax | depth-attention-guided → child | carried by concept | — | explicit dive | /dive (future) | N4, N6–N8 |
| GT-D2 | softmax | depth-attention-guided | prerequisite_gap | — | suggest, never silent | /dive suggestion (future) | N1, N2 |
| GT-D3 | softmax / attention | child → parent | re-evaluate, no auto-upgrade | JEV | return point | /dive return (future) | N4, N5, PS3 |
| GT-M1 | softmax | depth-attention-guided + c21-temperature | uncertain after two representations | — | representation switch | /motion (future) | MD1–MD4 |

## Instrumentation gaps found

These record what Tutor infrastructure will need later. They are not implemented here, and the
frozen cards are not modified to close them: no change to card data, `attemptLog`, serializers,
`partIds`, plans, relationships or transitions. Which mechanism closes each gap (a Tutor context
adapter, a new evidence store, a serializer extension, card metadata, an evaluator schema) is
decided in the architecture session. Where a label depends on an open decision, the dependency is
named.

| ID | Current runtime fact | Needed capability | Found in | Label |
|---|---|---|---|---|
| G1 | The agent context (`describeAnimation`) carries the card title but no card identifier. A board block holds `scene.id`; relationships and transitions key on `evidence.card`. | The Tutor needs a stable authored semantic card identity it can use with relationships and transitions. How is open: for example a `scene.id` → authored-card registry lookup, or the block carrying `evidence.card`. | GT-01, GT-15 | REQUIRED CAPABILITY FOR TUTOR V1 (not a required data-field change) |
| G2 | The sub-card is described by index and label ("sub-card 2 of 4: …"), not by part id. | A stable `partId` available to Tutor context; storage is not prescribed. | GT-15, GT-13 | REQUIRED CAPABILITY FOR TUTOR V1 |
| G3 | `attemptLog` records have no timestamp or sequence number. | Evidence attempts need a stable ordering / recency signal, so T1 can tell newer from older. A timestamp is one option; a monotonic sequence, an event id or an ordered evidence record also work. | GT-03, GT-07 | REQUIRED FOR TUTOR V1 |
| G4 | `attemptLog` has no explicit concept or claim tag. | Each evidence event can be associated with a concept and claim. Possible sources: object `conceptId`, the authored card identity, the evaluator contract, a future claim registry. The mechanism is for the architecture session; card data is not required to change. | GT-02 | REQUIRED CAPABILITY FOR TUTOR V1 |
| G5 | Card data has concept ids but no claim ids. T1 wants evidence per concept and claim. | A stable way to identify the claim being evaluated. Possible sources: an authored evaluator spec, a Tutor claim registry, card metadata, generated-and-reviewed claim definitions. Maps to V6 / E7; not a requirement that every frozen card gains claim ids. | all | REQUIRED CAPABILITY FOR TUTOR V1 (mechanism is an architecture decision) |
| G6 | `describeActivity` reports the answer's option id (`"target"`), not its label ("0 to 100"), and lists no option labels. | Agent context exposes both the answer id and its learner-visible option label, without exposing the expected answer. | GT-02 | REQUIRED FOR TUTOR V1 |
| G7 | No record that feedback was shown. Every Check reveals `feedbackFail` or `feedbackPass`, so a later pass on the same task follows a reveal, and the log cannot tell that apart. | Distinguishing unaided success from success after answer-revealing feedback. This may matter more if the evidence policy separates the two (E6, E4). | GT-02, GT-07 | NICE TO HAVE until E4/E6 are decided |
| G8 | Selection is object-level: a drawn region resolves to one semantic object, so a single table cell cannot be named. | Sub-object (cell) selection. | GT-15 | NICE TO HAVE |
| G9 | Prerequisites are prose strings (`plan.prerequisites`, `evidence.prerequisites`). Softmax has no dedicated card and no structured link. | Structured prerequisite links, where a prerequisite may have no card at all. | GT-06 | REQUIRED if R7 chooses deterministic prerequisite routing; otherwise NICE TO HAVE |
| G10 | No card declares `transferable_inputs`; any transition carries zero inputs. Not a bug: defaults are the declared behaviour. | — | GT-13 | NOT REQUIRED |
| G11 | `sourceRevision` is written in two formats (`owner/repo@sha` and `owner/repo @ sha`). | One comparable format, if persistence compares revisions for staleness (PS4). | GT-D1 | NICE TO HAVE (linked to PS4) |
| G12 | Overview → Guided → Deep is ladder order in `DEPTH_LADDER`, not a declared pairwise transition. | Possibly none: ladder order already gives a deterministic ordering for adjacent depths. | GT-01, GT-04 | NICE TO HAVE / architecture-dependent |
| G13 | Depth cards have no practice; the attention family's deterministic evidence comes from c10, c11 and c12. | None: depth cards do not need deterministic practice because a Tutor exists (JEV covers free-form). | GT-01 | NOT REQUIRED |
| G14 | No card-view or dwell event. | Optional context signal. Viewed is not learned, and must never be recorded as evidence of understanding. | GT-01 | NICE TO HAVE |
| G15 | No persistent Tutor evidence store; `attemptLog` lives on the board block. | A structured evidence store. Its scope is PS1 / PS5; even session-only persistence for the first release needs a structured store for that session. | all | REQUIRED FOR TUTOR V1 |
| G16 | No runtime cross-depth navigation. | Navigation along declared transitions. `/dive` infrastructure is separate and comes before Tutor implementation; cross-depth card navigation is a Tutor-v1 choice. | GT-01, GT-04, GT-13 | REQUIRED only if the V1-B modifier (runtime depth navigation) is chosen |

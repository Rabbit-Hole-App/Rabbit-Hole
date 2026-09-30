# Tutor v1 — locked decisions (first vertical slice + /dive)

Status: locked by the owner in the Tutor decision sprint, 2026-09-30. Nothing here is implemented; the next
step is the /dive implementation.

Scope: the first locally usable Tutor on NanoGPT Attention, and the `/dive` primitive it needs. The
learner can:
- start on an Attention card and ask something;
- get an adaptive reply;
- go shallower or deeper;
- answer practice;
- expose a misconception and get a different move;
- `/dive` into softmax and come back with context intact.

Sources: adaptive-tutor-v1.md (T*, J*), tutor-architecture-brainstorm-agenda.md (agenda IDs),
tutor-golden-traces-nanogpt.md (GT-*, G*), all on `docs/tutor-cards-runtime`. Runtime facts are cited
from `feature/final-integration` af572dcc.

Frozen cards stay frozen. Every gap below is closed by Tutor-side code (an adapter, a registry, a
store) that reads card modules; no card module changes.

Flow, per learner message:

```
Learner → LearnerTurn → Evaluator → Evidence store → Tutor planner → TutorAction[] → Canvas
```

---

## 1. LearnerTurn

**Decision.** A deterministic builder assembles the LearnerTurn in the browser from runtime state:
- there is no separate Resolver model call in v1;
- the one model call per turn is the planner (§4), which also reports any explicit constraint it
  reads in the raw message.

**Why.** Every field except constraints is already knowable from the block, the card module and the
store. One model call per turn keeps latency down (J13), and R11 is settled by merging.

**Contract.**

```
LearnerTurn v1 {
  turn_id: string                        // uuid
  raw_user_message: string               // verbatim, never rewritten or summarized
  slash?: 'deeper' | 'simplify' | 'dive' | null   // typed command, if any
  answering?: string                     // action_id of the Tutor question this message answers
  dive_choice?: { concept, choice: 'dive' | 'inline' }   // the learner's pick on a suggest_dive (§6.3)
  pending_dive?: { topic }               // a /dive typed with no card selected, kept until a card is selected (R-10)
  canvas: { app: string, board: string | null,
            dive?: { dive_id, parent: { app, board }, origin: DiveOrigin } }   // set inside a child
  target: {                              // null when nothing is focused or selected
    block_id: string                     // board block uuid
    scene_id: string                     // runtime scene.id, e.g. nanogpt-c11-causal-mask
    card: string                         // authored evidence.card, e.g. c11-causal-mask
    depth: 'Overview' | 'Guided' | 'Deep dive' | null   // evidence.depth; null on deep-dive cards
    part_id: string | null               // partIds[pager value]; null if unpaged
    selected_object: string | null       // semanticId
    concepts: string[]                   // conceptIds of the selected object, else of the shown part/card
  } | null
  card_state: {                          // from the existing serializers plus the G6 fix
    inputs: Record<string, unknown>, input_revision: number,
    practice: null | { task_id, status: 'none'|'open'|'submitted',
      attempts: [{ seq, answer_id, answer_label, result: 'passed'|'failed' }] }   // never `expected`
  }
  evidence: ClaimState[]                 // §2, for target concepts + their registry prerequisites
  constraints: Constraint[]              // explicit only, session-scoped (§7)
  returned_from?: { dive_id, concept, states: ClaimState[] }   // first turn after a return
  recent_turns: { learner: string, tutor: string }[]   // last 4
  recent_actions: { type, strategy, claim? }[]          // last 3
}
Constraint = 'no_quiz' | 'no_analogy' | 'no_simplify' | 'just_answer' | 'formal' | 'implementation'
```

**Deterministic sources:**
- `scene_id` from `block.scene.id`.
- `card`, `depth`, `part_id`: a Tutor **card registry** keyed by `scene.id`, built from the existing
  module lists (`NANOGPT_FIRST_BATCH`, `NANOGPT_LATER_BATCHES`, `DEPTH_LADDER`). This closes G1 and
  G2 without card changes.
- `answer_label` from `block.activity.answer.options`. This closes G6; `expected` is dropped by the
  adapter.

**Example (GT-15).**
- `raw_user_message`: "Why is this zero?"
- `target`: `{ scene_id: 'nanogpt-c11-causal-mask', card: 'c11-causal-mask', depth: null,
  part_id: null, selected_object: 'causal-mask-table', concepts: ['causal-mask'] }`
- `constraints`: `[]`

**Deferred:** requested_modality inference; intent ranking (R8); selection below the object level
(G8).

## 2. Evidence store

**Decision.**
- Tutor v1 local persistence: session-scoped browser storage, learner-scoped, is acceptable. It must
  survive a reload and a same-tab `/dive`. The exact storage mechanism is an implementation detail
  (e.g. `sessionStorage`). Durable evidence comes later and does not block the prototype.
- Records: an append-only list of events plus claim states derived from them.
- Keys: concept = the card `conceptId` vocabulary; claim = a Tutor claim id from a Tutor-owned
  **claim registry** for the slice (G5, V6).
- Ordering: a monotonic per-session `seq` (G3).

**Why.** Session-scoped persistence is enough for the local prototype (PS1). A registry keeps claims out
of frozen card data. Keying by concept is what makes evidence shared across `/dive` canvases.

**Contract.**

```
EvidenceEvent {
  seq: number                                  // monotonic, assigned by the store
  concept: string, claim: string               // e.g. 'causal-mask', 'causal-mask/reads-self-and-earlier'
  result: 'pass' | 'fail' | 'misconception' | 'non_attempt' | 'gap'
  misconception_id?: string                    // named, from the claim registry
  prerequisite?: string                        // concept, when result = 'gap'
  kind: 'demonstrated_here' | 'demonstrated_in_transfer' | null
  settled: boolean                             // false when the evaluator status was uncertain or error
  evaluator: 'deterministic' | 'jev' | 'larger'
  source: 'card_practice' | 'free_text'
  ref: { card, scene_id, part_id?, task_id?, answer_id?, turn_id?, canvas: { app, board } }
  source_revision?: string
}
ClaimState { concept, claim, state: 'understood'|'uncertain'|'misconception'|'prerequisite_gap'|'not_yet_observed',
             misconception_id?, prerequisite?, basis: number[] }   // basis = event seqs
```

**Derivation.** Recomputed from all settled events on every append. T1 is locked, and these v1
thresholds are now locked too:
- **understood:** a settled `demonstrated_in_transfer` pass, with no later settled fail or
  misconception on the claim.
- **misconception:** at least 2 settled events on the claim naming the same `misconception_id`
  (any evaluators), with no later settled transfer pass. So GT-02, one fail, stays `uncertain`,
  and GT-03, the same wrong model twice, becomes `misconception`.
- **prerequisite_gap:** a settled `gap` event naming a prerequisite concept whose own state is not
  `understood`.
- **uncertain:** any other evidence, including conflicting evidence (GT-11, GT-12), only
  `demonstrated_here` evidence, or only unsettled events.
- **not_yet_observed:** no events.
- **Concept state:** `understood` only if every registry claim of the concept is; otherwise the
  "worst" claim state, in the order misconception > prerequisite_gap > uncertain > not_yet_observed.

**Card practice mapping (E6, G7).**
- The claim registry maps a practice task to a claim and marks whether it is a transfer task. It also
  maps wrong option ids to named misconceptions (e.g. c11 `target` → `reads-next-target`, `all` →
  `no-mask`).
- A pass counts as `demonstrated_in_transfer` only on the **first** attempt of a transfer task. A pass
  after an earlier attempt on the same task follows the card's answer-revealing feedback, so it counts
  as `demonstrated_here`. `seq` gives that order.

**Example (GT-03 → GT-07).** Two events at seq 1 and 2 (`fail`, `misconception_id: reads-next-target`)
give `misconception`. Then a JEV transfer pass arrives at seq 4, after an optional card pass at seq 3.
That settled `demonstrated_in_transfer` pass is the latest event, so the claim becomes `understood`.

**Deferred:** cross-session persistence and its D1 schema (PS1, PS5); decay (E2); stale-evidence
handling on a source-revision change (PS4, G11).

## 3. Evaluation ladder

**Decision.** Deterministic → JEV → larger evaluator. Evaluators return evidence events; the planner
never sees raw probabilities, and no evaluator returns a move (J10, J15).

**Contract.**

```
evaluate(turn: LearnerTurn) → EvaluationResult {
  status: 'settled' | 'uncertain' | 'error'
  evaluator: 'deterministic' | 'jev' | 'larger'
  events: Omit<EvidenceEvent, 'seq'>[]
}
```

1. **Deterministic** runs when the block's `attemptLog` has new entries since the last turn. The
   adapter diffs the log, maps each attempt through the claim registry, and returns `settled`.
2. **JEV** runs when there is free text on a slice target. It makes one batched request (J12)
   through the existing `jevRequest` / `parseJevAnswers` (`packages/control-plane/src/learn-grade-jev.js`),
   carrying:
   - if `answering` is set: the claim's expected ideas plus its named-misconception checks;
   - always: gap checks for the target claims' registry prerequisites ("Does the message show the
     learner lacks: <prerequisite statement>?").

   The status uses the existing `THRESHOLDS` (yes ≥ 0.7, no ≤ 0.3): `settled` when every check is ≥
   yes or ≤ no; `uncertain` when any check falls between; `error` on `JevError` or a timeout
   (800 ms hard).
3. **Larger evaluator** runs only on JEV `uncertain`: the existing Opus grading path
   (`gradeAnswer` / `challengePrompt` in `packages/web/src/learn-grade.js` → `/api/learn/ask`), 8 s timeout, returning the same event shape. On error the
   events are stored unsettled and no state changes.
4. **Not evaluated:** plain questions that answer nothing (only the gap checks run), and slash
   commands.

**Example (GT-08).** "kind of in the middle" gives idea 0.55, so JEV is `uncertain`, the larger
evaluator runs, and its events are stored.

**Deferred:** who authors expected ideas beyond the slice (V6, beyond the registry); `partial` as a
distinct result (E8; v1 records each idea as its own claim event).

## 4. TutorAction contract

**Decision.**
- One planner call per turn returns 1–3 actions from a closed list, plus the T18 record.
- There is no generic tool-call machinery and no generation action in v1 (see §8).
- The client executes actions under the authority rules in §5; it rejects, rather than coerces, a
  `navigate` it is not allowed to perform.

**Contract.**

```
TutorResponse {
  turn_id, strategy: 'socrates' | 'feynman' | 'none', move: T2Move, reason: string,   // T18, operational
  actions: TutorAction[1..3],
  constraints_add?: Constraint[], constraints_remove?: Constraint[],   // only from explicit wording
  explicit_request?: string        // quoted words that authorize a navigate; required for mode 'navigate'
}
TutorAction =
  | { type: 'respond_text', text, cites?: { card, source_index }[] }               // immediate
  | { type: 'ask_question', action_id, text, claim,
      purpose: 'diagnose' | 'predict' | 'explain_back' | 'transfer' }             // immediate
  | { type: 'show_authored_card', card, part_id?, mode: 'suggest' | 'navigate' }   // §5
  | { type: 'focus_part', card, part_id, mode: 'suggest' | 'navigate' }            // §5
  | { type: 'suggest_depth', card, direction: 'deeper' | 'shallower' }             // learner-confirmed chip
  | { type: 'suggest_practice', card }                                             // learner-confirmed chip
  | { type: 'suggest_dive', concept, title, origin: DiveOrigin /* required: one originating card, R-10 */ }   // two-choice prompt: [Go down a Rabbit Hole] / [Keep it on this canvas] (§6.3)
  | { type: 'open_dive', concept, title, origin: DiveOrigin }                      // only after /dive, Ctrl+K on a card, or 'Go down'; enters the card's existing child, else opens a pending hole (§6.2, R-3)
  | { type: 'return_from_dive' }                                                   // chip unless the learner asked
  | { type: 'no_action' }
```

**Rules:**
- `ask_question` is not allowed while `no_quiz` is active.
- `card` is always an authored `evidence.card`; the client resolves it to a block through the
  registry.
- `show_authored_card` for a card not yet on the canvas adds it with the existing `cardBlock`
  (authored, not generated).

**Example (GT-04, "Show me the implementation").**

```
{ strategy: 'none', move: 'go_deeper', explicit_request: 'Show me the implementation',
  actions: [ { type: 'show_authored_card', card: 'depth-attention-deep', part_id: 'shapes', mode: 'navigate' },
             { type: 'respond_text', text: '…', cites: [{ card: 'depth-attention-deep', source_index: 0 }] } ] }
```

**Deferred:** `generate_artifact` (with confirmation and cost); `suggest_motion`.

## 5. Navigation authority

**Decision.** The owner's default is accepted. The golden traces show no problem with it.

| Move | Tutor may do it directly when | Otherwise |
|---|---|---|
| Within authored depth (show card, focus part, Overview ↔ Guided ↔ Deep) | the learner explicitly asks: a slash `/deeper` or `/simplify`, or the planner quotes an explicit request in `explicit_request` (GT-04) | suggestion chip |
| `/dive` into a prerequisite | the learner typed `/dive`, pressed Ctrl+K with a card selected, or picked **Go down a Rabbit Hole** | `suggest_dive` two-choice prompt only (GT-D2, R-6) |
| Return from a dive | the learner asks or clicks Back | `return_from_dive` chip |
| Paid or generated tools | never in v1 (none exist in the action list) | — |

**Why.** GT-01, GT-04 and GT-D2 all hold. The learner stays in control (T12), and explicit intent
still gets an immediate move.

**Enforcement.** A `mode: 'navigate'` action without `explicit_request` (and without a slash) is
downgraded to a chip by the client and logged, never executed.

**Deferred:** auto-navigation without an explicit request (D4 beyond v1).

## 6. /dive

### 6.0 Product model (LOCKED OWNER REQUIREMENTS)

These are owner decisions, not open questions.

- **Rabbit Hole** = a persistent learning canvas.
- **Nested Rabbit Hole** = a deeper branch of understanding: parent → child → grandchild.
- **Originating card** = a portal into that branch.
- **Vertical root navigator** = a visible map of the current depth.
- `/dive` creates a meaningful parent/child learning relationship, not just another canvas.
- `/dive` is a structural navigation choice. It creates the learning space; the Tutor decides what
  belongs in it. `/dive` itself encodes no pedagogical choice.

| # | Requirement (locked) |
|---|---|
| R-1 | **Vertical Rabbit Hole navigator**, top-right of the canvas. It shows the current root path plus the immediate branches, never the whole tree. It has: ↑ to the parent; ↓ when children exist (a compact child picker when there is more than one); a vertical root line; one node per level of the current path; the current level emphasized. Click a level to navigate there; double-click its name to rename that hole. It represents the real parent → child structure, not a history list. **Visual direction:** it should feel like a subtle root, a sense of descending deeper and climbing back up, not a vertical menu with lines. It stays minimal and consistent with Rabbit Hole, with no illustration-heavy roots. The Figma node is only a structural mock; the implementation iterates the look with screenshots. |
| R-2 | **Originating card becomes a portal.** When a child hole is **persisted** (R-4), its originating card gets the Rabbit Hole red outline on the parent: "this card already has a nested Rabbit Hole". A pending, empty hole never shows the outline. Interacting with the portal enters the child. |
| R-3 | **Manual creation: select a card + Ctrl+K.** If the card has no child hole, this creates and opens a pending child. If it already has one, it **enters the existing child** (it follows the portal). **At most one direct child hole per originating card** in v1; a parent canvas can still have many children from different cards. The child keeps at least: the parent hole, the originating card identity (`evidence.card`), the runtime scene identity (`scene.id`), the part id if relevant, the selected object or concepts if relevant, and the source revision. |
| R-4 | **Empty holes are ephemeral.** Ctrl+K or `/dive` creates a pending, browser-local hole. If the learner leaves while it is still empty, it is discarded. The first meaningful canvas object persists the hole and its parent/child relationship. Meaningful: a card, diagram, drawing, equation, note, image, visualization or any other canvas object. Not meaningful: chat messages, the navigator, suggestion chips, the empty shell. |
| R-5 | **Delete.** A leaf child is deleted after a normal confirmation. A child with descendants needs an explicit subtree warning; descendants are never destroyed silently. Deleting removes: the child relationship; the descendants, if confirmed; the portal state; the red outline when no child of that card remains; and evidence scoped only to the deleted holes. Deleting a branch is **not** "the learner forgets everything learned there": concept-level evidence that exists outside the deleted holes is not erased. The long-term evidence semantics stay open (6.5). |
| R-6 | **Agent-proposed dives need learner confirmation.** The Tutor proposes; the learner picks **[Go down a Rabbit Hole]** or **[Keep it on this canvas]**. |
| R-7 | **Explicit learner intent is the confirmation.** `/dive`, or Ctrl+K on a selected card, executes with no second modal. |
| R-8 | **Returning preserves place:** the exact parent hole, the originating card and part, and the canvas position. It feels like climbing back up the same root, not reopening a generic parent page. |
| R-9 | **V1 is a tree:** one parent per hole, no DAG, no product depth limit. Excluded: DAGs, multiple parents, cross-linking arbitrary holes, collaborative holes, knowledge-graph visualization, recursive embedded canvas JSON. An engineering safety limit, if implementation ever needs one, is a guardrail and never part of the product model. |
| R-10 | **Invariant: every nested Rabbit Hole has exactly one originating card, and it is a selected card.** That card determines the parent hole, the origin block and card, the red portal outline, the return point, the source context and the selected concept. The rules: selected card + `/dive <topic>` creates or enters the `<topic>` child from that card. Selected card + `/dive` creates or enters a child whose topic is derived from the selected card and the current question. **No selected card + `/dive <topic>` creates no hole:** a lightweight reply asks "Select the card you want to go deeper from.", and the pending dive intent (`<topic>`) is kept, so selecting a card completes the dive without retyping. A Tutor-suggested dive is always anchored to a specific originating card. |

**Ctrl+K (locked):**
- On a Learn canvas with a card selected, Ctrl+K dives: it enters the card's existing hole, or
  creates a pending one.
- On a Learn canvas with no card selected, Ctrl+K opens the existing global Search.
- Outside Learn, the existing global Search behaviour is unchanged.
- Global Search itself is not changed. Today it is bound in `packages/web/src/Search.jsx:22`; the
  canvas handles the key first only when a card is selected.

### 6.1 Locked capability contract

The `/dive` implementation must provide these capabilities. It chooses the cleanest API and schema
consistent with the existing repository.

| Capability | Must hold |
|---|---|
| Create child | only from exactly one selected originating card (R-10), by Ctrl+K, `/dive`, or a confirmed Tutor proposal; pending until content (R-4); at most one direct child per originating card (R-3) |
| Persist after content | the first meaningful canvas object persists the child canvas and its parent link together; nothing is written before that |
| Tree integrity | a child has exactly one parent; a child is always new, so there are no cycles; no depth cap (R-9) |
| Query ancestry and children | the current root path and each level's immediate children (for R-1), and the children by originating block of a canvas (for the R-2 outline) |
| Rename | any hole in the path, from the navigator (R-1) |
| Delete | a leaf directly; a subtree only after explicit confirmation (R-5) |
| Restore return point | parent, originating block and part, inputs, practice state, pending question, viewport (R-8) |
| Carry the relationship | the Dive record below |

**Dive record (locked fields; the storage shape is the implementer's choice):**

```
Dive {
  dive_id: string
  concept: string | null, title: string        // title editable (R-1)
  created_by: 'learner_slash' | 'learner_ctrl_k' | 'tutor_confirmed'
  origin: DiveOrigin                           // R-3
  return_point: ReturnPoint                    // R-8
  source_revision?: string                     // e.g. karpathy/nanoGPT@3adf61e…
}
DiveOrigin { parent: { app, board }, card /* evidence.card */, scene_id, block_id /* the one originating card, R-10 */,
             part_id?, selected_object?, concepts: string[], depth? /* content depth of the card */ }
ReturnPoint { block_id, part_id?, inputs, input_revision, practice_open: boolean,
              pending_question?: { action_id, text }, viewport: { x, y, zoom } }
```

**Implementation candidate (not locked; the /dive coding agent may change it):**
- A child is a new standalone canvas (a `canvases` row, title = hole name) linked to its parent by
  one row in a link table. For example, `canvas_dives(child_app PK, org, owner_email, parent_app,
  parent_board, origin_block_id, dive_json, created_at)` with UNIQUE(parent_app, parent_board,
  origin_block_id) to enforce R-3.
- The parent is any canvas key `{app, board}`, so it can be a project-owned or a standalone canvas.
  The root has no link row.
- Endpoints along the lines of: create-on-first-content; path plus children; delete with a cascade
  flag (a 409 listing descendants without it); rename through the existing canvas title update
  (`PATCH` in `packages/control-plane/src/canvases.js`).
- A new table is an additive migration on the shared dev D1, so it must be announced first.

### 6.2 Persistence boundary (R-4)

- **Pending:** creating a hole makes a browser-local Dive record and an empty child canvas. There is
  no server record, and the parent card gets no outline (R-2).
- **Persist:** the first meaningful canvas object in the child persists the child and its parent link
  together. The portal outline appears on the parent card from then on.
- **Discard:** leaving a pending hole while it is still empty (back, a navigator click, closing the
  tab) discards the pending record.
- **No automatic seeding:** a seed would make every hole non-empty. Whatever appears in the child is
  the Tutor's decision (6.4) or the learner's.

### 6.3 Creation paths

| Path | Confirmation | Result |
|---|---|---|
| Card selected + `/dive <topic>` | none (R-7) | enter the card's existing child, or open a pending `<topic>` child from that card; `created_by: learner_slash` |
| Card selected + `/dive` | none (R-7) | as above; the topic is derived from the selected card and the current question |
| No card selected + `/dive <topic>` | — | **no hole is created.** The reply is "Select the card you want to go deeper from." The intent `{ topic }` is kept as `pending_dive`, so the next card selection completes the dive with no retyping and no second confirmation. It is cleared by Esc, a new `/dive`, or leaving the canvas. |
| No card selected + Ctrl+K | — | global Search (unchanged) |
| Learner selects a card and presses Ctrl+K | none (R-7) | enter the card's existing child, or open a pending one; `created_by: learner_ctrl_k` |
| Tutor `suggest_dive`, always anchored to one originating card (R-10) | **[Go down a Rabbit Hole]** / **[Keep it on this canvas]** (R-6) | Go down: enter or open as above (`tutor_confirmed`). Keep here: the next LearnerTurn carries `dive_choice: { concept, choice: 'inline' }`, which authorizes the Tutor to place authored content on the current canvas (`show_authored_card`, `mode: 'navigate'`) and continue inline |
| Portal click on an outlined card | none | enter its child |

### 6.4 What goes into a child and what comes back (R-8)

**Into the child:**
1. The navigator path.
2. The Tutor's opening turn: a LearnerTurn with `canvas.dive` set (origin card and part, pending
   question) and the concept's evidence.

The Tutor then decides what belongs in the hole under the authored-first policy (§8). It may reuse an
authored card that actually addresses the learner's question. For softmax that could be
`c21-temperature`, which has relevant softmax material, but only when it answers what the learner
asked; `/dive` never defaults to it. Otherwise it explains, or adapts appropriate content, inside the
hole.

**Back out:**
1. Evidence needs no copying: it is keyed by concept.
2. The parent's next LearnerTurn carries `returned_from { dive_id, concept, states }`.
3. The parent restores `return_point`: viewport, the originating block and part, inputs, practice if
   it was open, and the pending question.

The Tutor re-evaluates the blocked claim with one `ask_question` and never auto-upgrades it (GT-D3).

### 6.5 Evidence and deletion

- In the local prototype, evidence events carry the canvas they were recorded on. Deleting holes
  drops only the events recorded in the deleted holes.
- Concept states are then re-derived from what remains: evidence recorded elsewhere is untouched.
- Whether durable evidence should outlive a deleted branch is **OPEN**, and is decided with durable
  persistence.

### 6.6 Example (GT-D1 → GT-D3)

1. On `depth-attention-guided` the evidence shows `prerequisite_gap: softmax`. The Tutor returns
   `suggest_dive` anchored to the Guided card's block ("Softmax looks like the missing piece.").
2. The learner picks **Go down a Rabbit Hole**. The Guided card has no child yet, so a pending
   "Softmax" hole opens. The navigator shows the path Attention → Softmax, and the Tutor opens with
   the pending question "why do the weights add up to one?".
3. The Tutor answers in the hole. If it judges `c21-temperature` relevant, it offers the card. The
   first object placed in the hole persists it, and the Guided card gets its red outline.
4. The learner explains softmax on a new case, which records a transfer pass on
   `softmax/normalizes-to-one`.
5. Climbing back up restores the viewport, the Guided card and its inputs; the Tutor asks one
   question on the blocked claim.
6. Ctrl+K on the Guided card later enters the same Softmax hole; it never creates a second one.
7. If the learner had left at step 2 with the hole still empty, it would be discarded, with no
   outline.
8. Had the learner typed `/dive softmax` with no card selected, no hole would open: "Select the card
   you want to go deeper from." Selecting the Guided card completes that pending dive.

**Deferred:** several children from one card; moving a hole to another parent; sharing or forking a
tree; undo for delete; dive targets other than a card, part or object.


## 7. Socrates / Feynman routing

**Decision.**
- Socrates and Feynman are teaching strategies, not personas.
- A deterministic router picks the strategy and the allowed action types from the evidence and
  constraints. The planner model then composes text within those limits.
- One strategy per turn; one move per turn (O4-A: no multi-step plan, except the dive return point).

**Strategies:**
- **SOCRATES:** diagnose, question, counterexample, challenge an assumption.
- **FEYNMAN:** explain concretely, re-represent, worked example, explain-back, transfer.

**Routing (first match wins):**

| Target claim state / condition | Strategy | Allowed actions |
|---|---|---|
| explicit request or slash command | none, or Feynman for "explain" | whatever honours it (§5) |
| `prerequisite_gap` | none | `respond_text` (≤ 2 sentences) + `suggest_dive` (or `open_dive` after `/dive` / Ctrl+K); after an `inline` choice: authored cards on this canvas, Feynman |
| `misconception`, fewer than 2 Socratic turns on it | Socrates | `ask_question` (diagnose) or a counterexample on the authored card (`focus_part`) |
| `misconception`, 2 Socratic turns already spent | Feynman | `respond_text` (concrete, card-anchored), then `ask_question` (explain_back) |
| `uncertain` from an unsettled evaluation | Feynman | one clarifying `ask_question` |
| `uncertain` otherwise | Feynman | one hint or re-representation via an authored card or part |
| `understood` | none | short `respond_text`; at most one `suggest_depth` or transfer `ask_question`; never practice (GT-09) |
| `not_yet_observed` | Feynman | answer; optionally one `predict` question (T4) if no prerequisite gap |

**Constraints:**
- `no_quiz` / `just_answer`: remove every `ask_question` for the rest of the session until the
  learner reverses it (M5 and S7 are settled as session scope).
- `no_analogy` / `formal`: Feynman must use the Guided or Deep exact numbers, the parts and the
  sources (GT-05).

**Why.** This covers all eleven slice traces with no learner-type labels. The 2-turn Socratic cap is
the S4 answer.

**Deferred:** using both strategies in one turn (S3); specialist agents as separate calls (the S8
gate; v1 is inline, the V1-C modifier).

## 8. Authored versus generated content

**Decision.** Order of preference:
1. Focus an existing card or part on the canvas.
2. Show an authored card from the registry.
3. Reply with text grounded in the card's `evidence`, `sources` and part labels.

Tutor v1 has **no generation action**. Learners can still use the existing slash commands by hand.
The rule "generate only when authored content does not meet the need" becomes enforceable when
`generate_artifact` is added.

**Why.** It is the T-8 principle, and it removes the "regenerate a weaker duplicate" failure (GT-14)
by construction.

**Deferred:** `generate_artifact`, its confirmation UX and its cost path.

## 9. Context budget (planner input, per turn)

**Decision.** The planner receives only:
- the LearnerTurn;
- the target card's `describeAnimation` / `describeActivity` text (already bounded);
- `evidence.learningQuestion` and `evidence.concept`;
- the current part label;
- up to 3 of the target card's source notes;
- the claim registry entries for the target claims and their prerequisites;
- ClaimStates for the target concepts and their prerequisites (≤ 10);
- the last 4 turns and last 3 actions;
- the dive summary (origin card and part, concept, pending question).

Budget: about 12k tokens. When over budget, trim in this order: older turns, then source notes, then
the serializer's "State at that moment" list.

**Never sent:** other cards' state, the whole canvas, the course, the repository, earlier sessions,
or raw evaluator probabilities.

**Deferred:** Map/project context (T14) and notebook state.

## 10. First slice scope

**Decision.**
- The canvas holds the Attention cards, unmodified:
  - `depth-attention-overview`, `depth-attention-guided`, `depth-attention-deep`;
  - `c11-causal-mask`, `c12-score-scaling`, `c10-weighted-values`;
  - `c21-temperature` is available to the Tutor inside a softmax hole when it addresses the
    learner's question (§6.4).
- Claim registry concepts: `attention`, `causal-mask`, `score-scaling`, `softmax` (the prerequisite)
  and `attention-output` (weighted values). Two to four claims each.
- Acceptance: GT-01, GT-02, GT-03, GT-04, GT-06, GT-07, GT-11, GT-12, GT-D1, GT-D2, GT-D3, scripted as
  T19 scenarios against this contract.

**Deferred:**
- the remaining traces (GT-05, 08, 09, 10, 13, 14, 15, GT-M1) — GT-05 and GT-10 need only the
  constraint rules above, and GT-15 needs only the LearnerTurn above;
- `/motion`;
- runtime auto-navigation without a request;
- cross-session persistence.

---

## Remaining OPEN decisions (none blocks /dive or the first slice)

- Durable evidence: cross-session persistence, schema, decay, staleness on a source-revision change
  (PS1, PS5, E2, PS4), and whether durable evidence outlives a deleted branch (6.5).
- Claim authoring beyond the Attention slice (V6), and a distinct `partial` result (E8).
- `generate_artifact`, `suggest_motion` and the paid-tool confirmation UX.
- Specialists as separate model calls (S8), and both strategies in one turn (S3).
- Map/project and notebook context in the LearnerTurn (T14).
- Dive: several children from one card, moving a hole to another parent, sharing or forking a tree,
  undo for delete, and dive targets other than a card, part or object.
- Card-level instrumentation (G7 feedback flag, G8 cell selection, G11 revision format, G14 view
  events); the adapter covers what v1 needs.

Delegated to the /dive implementation rather than left open: the API and schema (6.1 implementation
candidate), the storage mechanism for session evidence, and the navigator's final visual, which is
iterated with screenshots under R-1.

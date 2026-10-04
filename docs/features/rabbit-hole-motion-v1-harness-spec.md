# Rabbit Hole `/motion` V1 — Motion Explainer Harness Specification

**Audience:** Parallel / Rabbit Hole engineering agents  
**Status:** AUTHORIZED FOR DEVELOPMENT HARNESS ONLY (owner decision, 2026-10-03). See §0.1 for exactly what is and is not authorized.  
**Primary goal:** Turn a short learner request such as `/motion explain me softmax func` into a source-grounded, deterministic, 5–30 second technical motion explainer that is actually useful for learning.

## Document relationship

| Document | Owns |
|---|---|
| **this spec** (`rabbit-hole-motion-v1-harness-spec.md`) | The authoritative implementation spec for Motion V1 |
| [learn-video-motion-generation.md](learn-video-motion-generation.md) | Long-term motion architecture and product vision: future renderers, long-form video, intuition-first pedagogy, creator/export use cases |
| [learn-artifact-generation.md](learn-artifact-generation.md) | Shared artifact policy: generation boundaries, validation, paid confirmation, security principles, artifact lifecycle |
| `docs/features/adaptive-tutor-v1.md` (on main) | The shared Learner Intent Resolver contract ("Future shared input layer: Learner Intent Resolver") |

If an implementation-level detail in this spec conflicts with the older motion architecture document, **this spec wins for the V1 implementation**. It does not supersede the unrelated future vision in that document.

---

## 0. Executive summary

Rabbit Hole should treat `/motion` as a **teaching primitive**, not as a generic text-to-video feature.

The user may type something very small:

```text
/motion explain me softmax func
```

That prompt is **not sufficient** to send to the animation author.

Rabbit Hole must first resolve what the learner means, gather source-grounded context, decide the learning objective and pedagogical treatment, identify what the video must and must not claim, and fix the duration. Only then is a structured brief handed to the author.

The V1 pipeline, with every stage owned by the harness:

```text
raw learner request
    ↓
Learner Intent Resolver          (shared; resolves target + context)
    ↓
Motion Director                  (pedagogy, claims, scope)
    ↓
MotionBrief                      (validated)
    ↓
Storyboard                       (Director role; validated)
    ↓
Motion Author                    (writes composition source only)
    ↓
composition source               (statically validated)
    ↓
render harness                   (packages/learn-render, Linux render container)
    ↓
preview + contact sheet + determinism checks
    ↓
fresh visual reviewer + fresh pedagogical reviewer
    ↓
at most one repair round (only for blocking findings)
    ↓
final render + automatic final validation
    ↓
existing LEARN_MEDIA / LearnVideos storage
    ↓
existing `type: "video"` block via insertBlock
```

**Duration:** any whole number of seconds from 5 to 30. Default 10 seconds when the learner gives none. See §2.2.

**Renderer:** the existing Remotion stack in `packages/learn-render`. HyperFrames, Three.js, Manim and Blender are future adapters, not V1. See §9.

Do not build a general-purpose video editor. Do not build unrestricted text-to-video. Do not make learners choose rendering technologies.

### 0.1 Authorization

**Authorized (development harness only):**

- MotionBrief generation (Learner Intent Resolver integration + Motion Director)
- storyboard generation
- Motion Author
- Remotion composition generation
- sandboxed development rendering
- preview and contact sheet
- fresh visual and pedagogical QA
- one repair round
- final local/development render
- insertion through the existing video block in a development environment

**Not authorized:**

- public production `/motion`
- production paid rendering
- automatic paid charges
- broad user rollout
- arbitrary generated-code execution (generated composition source runs only after static validation, inside the render sandbox, with allowlisted imports; see §8 and §10)
- HyperFrames, Three.js, Blender or Manim production adapters
- milestone M9 (§26)

Creating new infrastructure (for example the development render service in §10) still requires explicit approval before it is deployed.

---

# 1. Product principle

Rabbit Hole already has several ways to express the same learning idea:

```text
one concept
  ↓
interactive card
  ↓
Rabbit Hole / deeper canvas
  ↓
motion explainer
```

These should share semantics and source grounding. `/motion` is another representation of an existing learning idea, not an unrelated content system.

A motion explainer should be especially useful when motion reveals something that static text or a static card does not reveal well:

- sequence
- causality
- transformation
- flow through a system
- geometry
- comparison
- time-dependent state
- code execution flow
- data movement

Motion must teach. It must not simply decorate the canvas.

---

# 2. V1 user experience

## 2.1 Command

Canonical command:

```text
/motion <request>
```

Examples:

```text
/motion explain me softmax func
/motion show causal masking
/motion make attention intuitive
/motion show what this code block does
/motion explain how this request moves through the repo
/motion 20s explain gradient descent visually
/motion 30s intuition attention
```

The user should not need to know Remotion, React, SVG, Canvas, Three.js, Manim, Blender, ffmpeg, or rendering terminology.

Every `/motion` run prints what it decided, one line per decision, so a wrong guess is visible at once:

```text
✓ target: softmax in attention (nanoGPT model.py:69, fallback path; SDPA branch noted)
✓ duration: 15s
✓ mode: mechanism_first
```

## 2.2 Duration

**Motion V1 output is 5–30 seconds.** Internally every duration is a whole number of seconds from 5 to 30. Longer videos are the future long-form tier in [learn-video-motion-generation.md](learn-video-motion-generation.md), not V1.

**Default:** 10 seconds when the learner supplies no duration.

**Parsing:** accept any reasonable stated duration, not only preset values, including fractional seconds.

**Normalization** (owner decision, 2026-10-04):

1. Round to the nearest whole second; `.5` rounds up (12.4s → 12s, 12.5s → 13s).
2. Clamp to 5..30.
3. Print the decision line whenever the used value differs from what was asked.

| Learner wrote | Duration used | Decision line |
|---|---|---|
| (nothing) | 10s | `✓ duration: 10s (default)` |
| `12 seconds` | 12s | `✓ duration: 12s` |
| `25 sec` | 25s | `✓ duration: 25s` |
| `45 sec` | 30s | `✓ duration: 30s (asked 45s; Motion V1 max is 30s)` |
| `1 minute` | 30s | `✓ duration: 30s (asked 60s; Motion V1 max is 30s)` |
| `3 sec` | 5s | `✓ duration: 5s (asked 3s; Motion V1 min is 5s)` |
| `12.4s` | 12s | `✓ duration: 12s (asked 12.4s)` |
| `12.5s` | 13s | `✓ duration: 13s (asked 12.5s)` |

Rules:

- Never change the requested duration silently. Every normalization prints its decision line, and the MotionBrief records both the requested and the normalized value.
- The Director never lengthens a video beyond the requested (or default) duration.
- If the teaching objective cannot be conveyed faithfully in the duration, the Director **narrows the scope**. It never crams unsupported content into the video, and it records what it dropped in `scope_note`.

Example:

```text
/motion explain attention in 5 sec
```

Acceptable: teach only the core intuition (one query weighs other tokens by relevance and blends them).

Not acceptable: Q/K/V, scaling, masking, softmax, weighted values and the implementation, all in five seconds.

Complexity guide for the Director when choosing scope inside the duration:

```text
~5s     single visual fact or micro-mechanism
~10s    single mechanism
~15s    mechanism + takeaway
~20s    intuition → mechanism, or a richer code walkthrough
~30s    intuition → mechanism → formal/code bridge
```

If a request cannot be taught coherently even in 30 seconds, narrow the objective or ask the learner what to focus on. Do not silently compress a whole chapter into an incoherent 30-second animation.

## 2.3 Teaching mode hints

The canonical `teaching_mode` values are:

```text
intuition_first
mechanism_first
code_walkthrough
system_flow
```

These are the only names used in schemas, prompts, tests and docs. Future modes may be added later.

Learners can hint at a mode in their own words ("intuitively", "show the mechanism", "walk through the code", "how the request flows"). The Resolver and Director map those words to the canonical values. A coherent learner preference wins; otherwise the Director chooses from the request and the source.

## 2.4 Contextual use

`/motion` uses Rabbit Hole context through the Learner Intent Resolver (§4.2).

```text
selected card + /motion make this intuitive
```

The selected card is the primary target ("this" binds to the selection).

```text
selected code block + /motion show what happens here
```

The selected code span (`repository_context`) is the primary target.

```text
current Rabbit Hole + /motion explain this flow
```

The current Rabbit Hole and its relevant child/source context are the target.

The user should not need to restate information Rabbit Hole already knows.

---

# 3. Critical rule: raw `/motion` prompts are not motion prompts

A raw request such as:

```text
/motion explain me softmax func
```

is underspecified. It does not reliably tell an animation model:

- which `softmax` occurrence the user means
- what repository/file/function is relevant
- which implementation branch actually runs
- what the learner already knows
- what the learning objective should be
- what claims are source-supported
- whether the focus is intuition, mechanism, math, code or system flow
- what must be shown
- what must not be implied
- how long the video should spend on each beat
- what constitutes a successful result

Therefore:

- The learner's raw text is input **only** to the Learner Intent Resolver.
- It is never sent to the Motion Author.
- It is kept verbatim (`raw_user_request` in the MotionBrief) for provenance and so specialists can see the learner's exact wording. It is never presented as an instruction to the Author.
- Only the validated MotionBrief and the validated storyboard reach downstream generation.

---

# 4. Roles and stages

## 4.1 Who owns what

| Role | Owns | Never does |
|---|---|---|
| **Learner Intent Resolver** (shared) | target resolution, selection/context binding, concept identity, source candidates | pedagogy, rendering |
| **Motion Director** | learning objective, scope, teaching mode, claims, constraints, source grounding, storyboard requirements, the storyboard | rendering code |
| **Motion Author** | composition source from the validated brief + storyboard + renderer contract | changing the objective, claims, sequence or scope; grading its own output |
| **Render harness** | every stage transition, validation, rendering, repair counting, final validation, storage | creative or pedagogical decisions |
| **Visual reviewer** (fresh) | visual findings from the brief + rendered frames | seeing the Author's self-assessment |
| **Pedagogical reviewer** (fresh) | correctness findings from the brief + source evidence + rendered frames | seeing the Author's self-assessment |

The architecture is:

```text
learner → Learner Intent Resolver → Motion Director → MotionBrief + storyboard → Motion Author → renderer
```

not `learner → prompt enhancer → model`. "Prompt enhancer" is not a component name in this system.

## 4.2 Learner Intent Resolver

Motion does not invent its own context-resolution system. It uses the shared **Learner Intent Resolver** whose contract is "Future shared input layer: Learner Intent Resolver" in `docs/features/adaptive-tutor-v1.md` (on main). That contract builds a structured `LearnerTurn` and keeps `raw_user_message` next to `structured_interpretation`, with per-concept evidence and no permanent learner labels.

The Resolver is not implemented yet. M2 builds the motion-facing slice of it **in the shared location, to the shared contract**, so that the Tutor and other specialists can consume the same component later. It must not be a private `/motion` resolver.

For `/motion` the Resolver resolves:

- the explicit named target in the request
- the selected card (`SELECTIONS` kind `card`; `packages/web/src/agent/slash.js`)
- the selected canvas object (`canvas_object`, and `canvas_target` from `canvasTargetField()` in `packages/web/src/learn-ask-target.js`)
- the selected code span: `repository_context {commit, nodeId, label, range: {path, start, end}}`
- the selected part (`part_id` from `resolveTarget()` in `packages/web/src/learn-target.js`, on main)
- the current canvas / Rabbit Hole and lesson
- candidate source references
- the relevant concept identity

## 4.3 Resolution precedence

**Explicit named concepts beat ambient context.**

```text
current canvas: attention
/motion explain gradient descent
→ target: gradient descent (not attention)
```

**Deictic language binds to the selection or context.**

```text
/motion explain this                 → the selected card/object
/motion show what happens here       → the selected code/source target
/motion explain this flow            → the current Rabbit Hole / selection
```

**A named target is then grounded in the source.**

```text
/motion explain me softmax func
→ the named target is softmax
→ repository/source grounding decides WHICH softmax occurrence, function or
  context the learner most likely means, using the current lesson, canvas
  and selection as tie-breakers
```

**If several materially different targets remain, ask one concise clarification.** Never guess, and never render a "generic" version of the concept disconnected from the source.

Order of evidence:

1. the name the learner typed (what)
2. deictic words bound to the current selection: card, part, canvas object, code span (what, when no name)
3. the current canvas / Rabbit Hole / lesson (which one, when the name is ambiguous)
4. repository symbol and text search (where it occurs)

## 4.4 Source grounding and implementation conditions

After the target is resolved, build the smallest evidence pack that grounds the explanation:

- selected card content and part id
- the exact repository file/symbol span at a pinned commit
- current lesson claims and concept IDs
- relevant source citations
- the surrounding call path when necessary
- Tutor claim/evidence registry only when useful and privacy-safe

Do not dump an entire repository or canvas into any prompt.

**Implementation conditions are first-class evidence.** When the source has branches that decide which code actually runs, the resolver/grounding step must find them, and the MotionBrief must record them in `implementation_conditions`. Claims that depend on a branch reference that condition.

nanoGPT is the reference case. At commit `3adf61e154c3fe3fca428ad6bc3818b27a3b8291` (the commit the NanoGPT course docs pin), `model.py` has **no `softmax()` function**. It has two `F.softmax` calls:

- line 69, inside `CausalSelfAttention.forward`, on the **fallback** attention path (lines 65–71)
- line 324, inside `GPT.generate`, converting the final logits to sampling probabilities

and the attention path depends on a branch:

```python
45:  self.flash = hasattr(torch.nn.functional, 'scaled_dot_product_attention')
...
62:  if self.flash:
63:      # efficient attention using Flash Attention CUDA kernels
64:      y = torch.nn.functional.scaled_dot_product_attention(q, k, v, attn_mask=None, dropout_p=self.dropout if self.training else 0, is_causal=True)
65:  else:
66:      # manual implementation of attention
67:      att = (q @ k.transpose(-2, -1)) * (1.0 / math.sqrt(k.size(-1)))
68:      att = att.masked_fill(self.bias[:,:,:T,:T] == 0, float('-inf'))
69:      att = F.softmax(att, dim=-1)
70:      att = self.attn_dropout(att)
71:      y = att @ v # (B, nh, T, T) x (B, nh, T, hs) -> (B, nh, T, hs)
```

The source comment at line 44 says flash support "is only in PyTorch >= 2.0". So on modern PyTorch the explicit mask-then-softmax path does not run; `scaled_dot_product_attention(..., is_causal=True)` performs causal attention internally.

The Director must preserve this condition. It must **not** produce the unconditional claim "nanoGPT always masks scores and then calls `F.softmax`".

## 4.5 Motion Director

The Director turns the LearnerTurn plus the evidence pack into a validated MotionBrief (schema: §5.1). It makes real pedagogical decisions; it is not "raw prompt + make this prettier".

The Director owns:

- the learning objective
- the target-resolution output it accepts into the brief
- scope (including narrowing to fit the duration)
- the teaching mode
- the claim registry
- the constraints (`must_show`, `must_not_claim`)
- source grounding and implementation conditions
- the storyboard requirements, and the storyboard itself (§4.6)

The Director does **not** write rendering code.

### Step A — claim registry

Create a small claim registry. Each claim cites its source refs, and conditional claims cite their implementation condition.

```text
C1: softmax converts eligible scores into normalized non-negative weights
C2: in nanoGPT fallback attention, masking occurs before F.softmax        [K1: flash unavailable]
C3: the optimized PyTorch SDPA path performs causal attention internally   [K1: flash available]
```

Every storyboard beat later references the claim IDs it teaches, so QA can answer: *which source-supported claim is this visual teaching?*

### Step B — learning objective

Convert a vague request into one concrete learning outcome.

Bad objective:

```text
Explain softmax.
```

Better objective:

```text
After this animation, the learner can explain in plain language how softmax
turns one row of attention scores into weights over the eligible positions,
and knows that nanoGPT's explicit mask-then-softmax code is the fallback path.
```

For code requests, include the implementation relationship: what enters the code, what transformation occurs, and what the result means to the next stage.

### Step C — audience context

Use the current learning context when available, for example: currently inside the NanoGPT attention lesson; knows logits but not normalization. This is lesson context, not a permanent learner label. Do not use sensitive personal profiling.

### Step D — teaching mode

Renderer and pedagogy are separate decisions. Canonical modes:

**`intuition_first`** — a visual metaphor or concrete story first, then an explicit mapping back to the real mechanism.

```text
speakers in a room
→ relevance brightness
→ weighted blend
→ labels become Q/K/V / attention weights
```

The analogy must map explicitly to the real concept (`analogy_map` in the brief), must record where it stops being exact, and must not introduce false causality.

**`mechanism_first`** — direct technical visualization.

```text
scores
→ mask
→ softmax
→ weighted values
```

**`code_walkthrough`** — source/code execution or data flow.

```text
input tensor
→ highlighted source lines
→ shape/state changes
→ returned value
→ next caller
```

**`system_flow`** — flow across modules/services/components.

```text
browser request
→ Worker route
→ Durable Object
→ storage
→ response
```

### Step E — duration and scope

Apply §2.2. Record the requested and normalized duration. Narrow the scope when needed and say what was dropped in `scope_note`.

### Step F — must-show and must-not-claim

Example for causal masking:

```text
must_show:
- token positions
- attention-score matrix
- future positions
- mask applied before normalization (fallback path), or causal attention inside SDPA (flash path), per the brief's condition
- blocked cells unavailable
- softmax over permitted cells

must_not_claim:
- masking happens after softmax
- future tokens are deleted from the sequence
- masked values become ordinary zeros that softmax may still use
```

These constraints are part of the production contract. Reviewers check them.

### Step G — visual direction and narration policy

Short, semantic visual direction (for example "clean technical motion graphics; position, size and opacity make normalization legible; no decorative bouncing"). The brief fixes truth, pedagogy, required beats and semantic invariants; the Author keeps broad freedom over visual treatment, timing, choreography, transitions and typography.

## 4.6 Storyboard (Director role)

The storyboard is its own harness stage between the brief and the Author.

- **How it is made:** a separate, stateless model call that the harness invokes under the Motion Director role (configured by `MOTION_DIRECTOR_MODEL`), after and apart from the brief call. Its input is the validated MotionBrief.
- **Validation:** the harness validates it against §5.2 before the Author sees it.
- **Order:** the storyboard comes before any renderer code, and the Author cannot bypass it.

```text
Learner Intent Resolver
→ Director brief call      → validated MotionBrief
→ Director storyboard call → validated Storyboard
→ Motion Author            → composition source
```

**Ownership** (owner decision, 2026-10-04):

- The Director owns the pedagogical and storyboard semantics.
- The Author never invents or rewrites the storyboard.
- The storyboard changes only through a Director revision inside the single repair round (§4.8).

Example 15-second storyboard for the softmax brief in §6:

```text
0–3s     B1 hook        One row of raw attention scores for the last token; future cells greyed.
                        claims: C1          must_show: raw scores, unavailable future positions
3–7s     B2 mechanism   Fallback path label (K1). Future cells become -inf, then vanish from the weights.
                        claims: C2          must_show: unavailable future positions
7–11s    B3 mechanism   Eligible scores become non-negative weights; a sum indicator resolves to 1.
                        claims: C1          must_show: normalized allowed weights, sum to 1
11–13s   B4 bridge      Second lane: "PyTorch ≥ 2.0: scaled_dot_product_attention(is_causal=True)
                        does this internally."  claims: C3
13–15s   B5 takeaway    "Softmax turns the allowed scores into weights that sum to 1."
                        claims: C1, C2, C3
```

## 4.7 Motion Author

The Author receives only:

- the validated MotionBrief
- the validated storyboard
- the renderer contract (§8, §9)

It writes **only** the Remotion composition source (§5.3). It makes implementation-level creative choices: easing, composition, typography, staging, framing, transitions, timing refinement inside each beat.

It never silently changes the learning objective, factual content, conceptual mapping, required sequence, scope or source-backed claims.

If the brief or storyboard is insufficient or inconsistent, the Author returns a **structured failure** instead of improvising around missing evidence:

```json
{
  "status": "needs_revision",
  "reason": "storyboard claims masking always uses explicit F.softmax but source has an SDPA branch",
  "stage": "storyboard",
  "refs": ["B2", "C2", "K1"]
}
```

The harness routes it back to the Director (§4.8). The Author does not grade itself, and nothing it says about its own output reaches the reviewers.

## 4.8 The harness owns the loop

No model autonomously controls `storyboard → render → inspect → rerender → repeat`. The harness runs every stage and decides every transition:

```text
1. Resolver                → LearnerTurn (or needs_clarification → stop, ask)
2. Director call           → harness validates MotionBrief (§5.1)
3. Storyboard call         → harness validates storyboard JSON (§5.2)
4. Author call             → harness validates composition source (§5.3)
                             (needs_revision → step 8 as the repair round)
5. Harness                 → render preview + contact sheet + determinism checks (§11)
6. Fresh visual reviewer   → brief + rendered frames only
   Fresh pedagogical reviewer → brief + source evidence + rendered frames
                             (+ narration script when narration is on)
7. Harness                 → classifies findings; any BLOCKING finding? (§13)
     no  → step 9
     yes → step 8
8. Repair round (once per job)
     - Author-level defect           → one Author call with the blocking findings
     - brief/storyboard-level defect → one Director revision (revalidated),
                                        then one Author call
     → re-render preview, re-run both fresh reviewers
     → still blocking → job fails with diagnostics; no further repair
9. Harness                 → final render + automatic final validation (§11.3)
     fails → job fails; no further repair
10. Harness                → store via LearnVideos / LEARN_MEDIA; insert video block (§18)
```

Rules:

- **Exactly one semantic repair round per job** (`repair_count` ≤ 1, owner decision 2026-10-04).
  - Example: review finds a brief or storyboard problem → one Director revision → one Author regeneration → re-render → final review and checks. That consumes the round.
  - An Author `needs_revision` (the brief or storyboard is unsupported or inconsistent) also consumes the round.
  - A `needs_revision` from the repair round's own Author call fails the job.
  - After the repaired render, any further blocking semantic or visual failure fails the job. There is no second repair loop.
- Only **blocking** findings consume the repair round. Advisory findings are recorded, never repaired automatically.
- **Format retry** is separate from semantic repair. Each structured model stage may get at most one formatting/schema re-ask when its response is malformed or unparseable.
  - **The prompt:** the re-ask carries the malformed output and the validation errors, and asks only to return the same result in the required schema. It adds no findings and no new instructions.
  - **The repair round:** the re-ask does not consume it, provided no teaching decision, claim or storyboard semantics change.
  - **A second malformed result** fails that stage, and the job fails naming the stage.
  - **Visibility:** every re-ask is recorded on the job (`format_retries`). Repeated failures are never hidden behind retries.
- Reviewers are fresh for each review pass and never receive the Author's or Director's self-assessment, rationale or earlier reviewer output.
- Repair inputs are grounded in the actual findings and diagnostics.

## 4.9 Structured output and model configuration

`claude-opus-5-5` returns HTTP 400 for a forced `tool_choice` (`tool` or `any`) and for `thinking: {type: 'disabled'}`. This was observed in this repo (2026-09-30); main's Tutor planner uses `tool_choice: {type: 'auto'}` for this reason. The existing artifact path in `packages/control-plane/src/learn-artifact.js` forces `{type: 'any'}` and must not be reused as-is for Motion calls on that model.

Every Motion model call uses:

- `tool_choice: {type: 'auto'}` with the stage's single output tool, or a plain JSON response
- adaptive thinking, with `output_config.effort` where appropriate (generation stages use high effort)
- schema validation of the response by the harness
- the format-retry and repair policy in §4.8

**Model IDs are never part of the Motion contract or schemas.** Calls are configured by role:

```text
MOTION_DIRECTOR_MODEL              Director + storyboard calls
MOTION_AUTHOR_MODEL                Author calls (including the repair call)
MOTION_VISUAL_REVIEW_MODEL         visual reviewer
MOTION_PEDAGOGICAL_REVIEW_MODEL    pedagogical reviewer
```

Runtime configuration may initially resolve all four to `claude-opus-5-5`. The roles resolve through the existing per-task model configuration (`LEARN_TASKS` in `packages/control-plane/src/learn-models.js`) or environment; M2 decides which. The MotionJob records which model each role actually resolved to, for provenance, never credentials.

Motion generation is an artifact-generation job, not an interactive Tutor turn. Do not reuse the Tutor fast tier automatically.

---

# 5. Canonical schemas

This section is the **only** definition of these schemas. Other sections reference it and do not redefine fields.

## 5.1 MotionBrief

```text
MotionBrief {
  id
  prompt_spec_version            // version of the Motion prompt/spec templates used
  raw_user_request               // verbatim learner text; provenance only, never an Author instruction
  resolved_target {
    kind                         // concept | card | canvas_object | code_span | route | rabbit_hole
    label
    concept_id?
    selection?                   // {kind (one of SELECTIONS), id} when the target came from a selection
    part_id?
    repository_context?          // {commit, nodeId, label, range: {path, start, end}}
    resolution                   // named | deictic | context_disambiguated
    candidates_considered[]      // other occurrences and why they were not chosen
  }
  title
  objective
  audience_context?              // lesson context only; never a permanent learner label
  scope_note?                    // what was narrowed or dropped to fit the duration, and why
  source_refs[] {
    id                           // S1, S2, ...
    kind                         // code | card | lesson | doc
    repository?                  // e.g. karpathy/nanoGPT
    commit?                      // full SHA; required for kind = code
    path?
    start_line?
    end_line?
    card_id?
    url?
  }
  evidence[] {
    source_ref_id
    excerpt                      // exact supporting text or code, verbatim
  }
  implementation_conditions[] {
    id                           // K1, K2, ...
    condition                    // e.g. "torch.nn.functional has scaled_dot_product_attention (PyTorch >= 2.0)"
    branches[]                   // what runs when the condition holds / does not hold
    source_ref_ids[]
  }
  claim_registry[] {
    id                           // C1, C2, ...
    text
    source_ref_ids[]
    condition_ids[]              // empty when unconditional
    required                     // true: the video must teach it
  }
  duration {
    requested_text?              // learner's words, e.g. "45 sec"
    requested_seconds?
    seconds                      // whole number, 5..30
    normalization?               // the printed decision line when seconds != requested
  }
  aspect_ratio                   // "16:9" in V1
  teaching_mode                  // intuition_first | mechanism_first | code_walkthrough | system_flow
  analogy_map[]?                 // required for intuition_first: {analogy_element, real_concept, limit}
  must_show[]
  must_not_claim[]
  visual_direction
  narration_policy               // none | one_line | concise
  output_requirements {
    stage_width: 1920
    stage_height: 1080
    fps: 30
    preview_scale                // preview = same composition at reduced scale (§11.1)
    poster: true
  }
  qa_requirements {
    blocking_categories[]        // §13.1
    keyframe_times[]?            // extra timestamps reviewers must see
  }
  provenance {
    learner_turn_id?
    canvas_id?
    card_id?
    created_at
  }
}
```

Validation (harness, before the storyboard call):

- `duration.seconds` is an integer in 5..30.
- `teaching_mode` is one of the four canonical values.
- every `claim_registry[].source_ref_ids` and `condition_ids` entry exists.
- every `kind: code` source ref has a full commit SHA and a line range.
- `intuition_first` has a non-empty `analogy_map`.
- `must_show` and `must_not_claim` are non-empty.
- no model ID and no credential appears anywhere in the brief.

## 5.2 MotionStoryboard

```text
MotionStoryboard {
  id
  brief_id
  version
  beats[] {
    id                           // B1, B2, ...
    start_time                   // seconds
    end_time
    pedagogical_role             // hook | intuition | analogy | mechanism | bridge_to_formalism
                                 // | notation | equation | implementation | takeaway
    visible_objects[]
    claim_ids[]
    condition_ids[]?
    must_show_covered[]          // which brief must_show items this beat shows
    transition
    framing
    on_screen_text
    narration_line?
  }
}
```

Validation (harness, before the Author call):

- 2–8 beats.
- beats are contiguous from 0 to exactly `duration.seconds`; none overlaps.
- every beat references at least one existing claim ID.
- every `required` claim is covered by some beat.
- every `must_show` item is covered by some beat.
- a beat that teaches a conditional claim names its condition.
- `narration_line` appears only when `narration_policy` is not `none`.

## 5.3 Author output

Exactly one of:

```text
{ status: "composition",
  source,                        // one Remotion composition module (§8, §9)
  composition_id,
  notes? }                       // never shown to reviewers

{ status: "needs_revision",
  reason,
  stage,                         // brief | storyboard
  refs[] }                       // beat / claim / condition IDs
```

Static validation of `source` (harness, before any render): §8.2.

## 5.4 Review finding

```text
ReviewFinding {
  reviewer                       // visual | pedagogical
  category                       // one of §13.1 (blocking) or §13.2 (advisory)
  beat_id?
  timestamp?
  claim_id?
  description
}
```

The harness, not the reviewer, decides whether a finding is blocking, by category.

## 5.5 MotionJob

```text
MotionJob {
  id
  status                         // resolving | needs_clarification | directing | storyboarding
                                 // | authoring | rendering_preview | reviewing | repairing
                                 // | rendering_final | validating_final | ready | failed
  owner                          // org + app + learner, as LearnVideos already scopes jobs
  brief                          // MotionBrief (§5.1)
  storyboard                     // MotionStoryboard (§5.2)
  renderer                       // "remotion" in V1, plus the renderer/service version
  prompt_spec_version
  director_model_config          // {role: "MOTION_DIRECTOR_MODEL", resolved_model}
  author_model_config            // {role: "MOTION_AUTHOR_MODEL", resolved_model}
  review_model_config            // {visual: {...}, pedagogical: {...}}
  repair_count                   // 0 or 1: the one semantic repair round (§4.8)
  format_retries[]               // {stage, errors}: at most one per structured stage; never counted in repair_count
  findings[]                     // ReviewFinding (§5.4), per review pass
  preview_refs {video?, contact_sheet, keyframes[]}
  final_ref?                     // the LearnVideos job key / LEARN_MEDIA storage key
  final_validation?              // §11.3 results
  source_refs[]                  // copied from the brief for provenance queries
  created_at
  updated_at
  failure_reason?
}
```

No model credentials are stored anywhere in the job.

---

# 6. Worked example: `/motion 15s explain me softmax func`

Fixture: Demo A in §27 (nanoGPT at `3adf61e154c3fe3fca428ad6bc3818b27a3b8291`, learner in the NanoGPT attention lesson, nothing selected).

This example explicitly asks for 15s. If the learner writes only `/motion explain me softmax func`, the Director receives `duration = 10s`. It must narrow the teaching scope to fit and must not silently extend to 15s.

## 6.1 Raw request

```text
/motion 15s explain me softmax func
```

## 6.2 Learner Intent Resolver

```text
raw_user_message:   "/motion 15s explain me softmax func"
named target:       softmax ("softmax func")
deictic words:      none
current location:   NanoGPT course, concept: attention
selection:          none
duration hint:      15s
mode hint:          none ("explain")
source candidates:  model.py:69   F.softmax(att, dim=-1)       in CausalSelfAttention.forward
                    model.py:324  F.softmax(logits, dim=-1)    in GPT.generate
chosen:             model.py:69 — current concept is attention
                    (324 recorded in candidates_considered: sampling, not attention)
```

With no lesson context and no selection, both candidates remain materially different, and the Resolver asks one clarification instead: "Softmax in attention (model.py:69) or in sampling (model.py:324)?"

## 6.3 Evidence and conditions

```text
S1  karpathy/nanoGPT @ 3adf61e1… model.py 44–45    flash flag
S2  karpathy/nanoGPT @ 3adf61e1… model.py 62–64    SDPA path, is_causal=True
S3  karpathy/nanoGPT @ 3adf61e1… model.py 65–71    fallback: scale, masked_fill(-inf), F.softmax, att @ v
S4  karpathy/nanoGPT @ 3adf61e1… model.py 48–50    tril causal-mask buffer (fallback only)

K1  torch.nn.functional has scaled_dot_product_attention (PyTorch >= 2.0)
      true  → SDPA with is_causal=True (S2)
      false → explicit mask then F.softmax (S3, S4)
```

## 6.4 Director output (MotionBrief excerpt)

```text
title:            How softmax turns attention scores into weights
objective:        Learner understands what softmax does to attention scores.
audience_context: NanoGPT attention lesson; has seen scores, not normalization.
claim_registry:
  C1  softmax converts eligible scores into normalized non-negative weights   [S3]
  C2  in nanoGPT fallback attention, masking occurs before F.softmax           [S3, S4] [K1=false]
  C3  the optimized PyTorch SDPA path performs causal attention internally     [S2]     [K1=true]
duration:         {requested_text: "15s", seconds: 15}
teaching_mode:    mechanism_first
must_show:
  - raw scores
  - unavailable future positions
  - normalized allowed weights
  - weights summing to 1 over eligible positions
must_not_claim:
  - nanoGPT always executes the explicit F.softmax path
  - masking happens after softmax
  - future tokens are removed from the token sequence
  - softmax chooses one single winner
visual_direction: Clean technical motion graphics. Minimal text. Position, size
                  and opacity make normalization legible. No decorative bouncing.
narration_policy: none
```

Only this validated brief, then the validated storyboard (§4.6), reaches downstream generation.

---

# 7. Storyboard rules

- A storyboard exists before any renderer code.
- 5–30 second videos use 2–8 beats.
- Each beat records the fields in §5.2.
- `pedagogical_role` names are internal and may grow; the validator accepts the §5.2 list.
- Each beat should answer: *what mental model is this visual giving the learner?*

---

# 8. Deterministic render contract

## 8.1 The rule

```text
frame = pure_function(frame_number, explicit_state)
```

Generated motion must be seekable and replayable. The renderer must be able to render frame N alone and get the same pixels every time.

Required in every composition:

- visual state derived only from Remotion's `useCurrentFrame()` / `useVideoConfig()`, through `interpolate()` / `spring()` or plain arithmetic on the frame
- no wall-clock time: `Date` and `performance.now` are prohibited
- no state driven by `requestAnimationFrame`, `setTimeout` or `setInterval`
- seeded randomness only, through Remotion's `random(seed)`; `Math.random` is prohibited
- no render-time network requests
- bundled, pinned fonts (woff2 files in the render package), and rendering waits for `document.fonts.ready` / Remotion's `delayRender()` until fonts load; a failed font load cancels the render (learn-render already does this)
- deterministic asset inputs, resolved before the render (§16)
- no uncontrolled CSS animation: CSS `@keyframes`, `animation` and `transition` are prohibited; all motion is driven from the frame

## 8.2 Static validation of composition source

Before any render, the harness rejects composition source that:

- imports anything outside the allowlist: `react`, `remotion`, and the approved primitive modules chosen in M1 (candidates: learn-render's lecture components and rough.js)
- uses a dynamic `import()`, `require`, `eval` or `new Function`
- references `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `navigator.sendBeacon`, `Date`, `performance`, `Math.random`, `requestAnimationFrame`, `setTimeout`, `setInterval`, `localStorage`, `sessionStorage`, `indexedDB` or `document.cookie`
- contains CSS `@keyframes`, `animation` or `transition`
- does not declare the brief's stage: 1920×1080, 30 fps, `durationInFrames` = `duration.seconds × 30`
- exceeds the source-size cap set in M1

Static validation narrows what generated code can do; the sandbox (§10) is still the security boundary.

## 8.3 Determinism test

Render the **same frame** in two fresh rendering contexts (two separate `renderStill` runs from a fresh bundle), hash both images, and require the hashes to match. M1 proves this on the hand-written composition; M5 runs it on every generated composition at the contact-sheet timestamps.

---

# 9. Renderer: the existing Remotion stack

## 9.1 V1 renderer

Motion V1 renders with the existing Remotion stack in **`packages/learn-render`**. It does not create a parallel rendering system. What already exists there:

| Capability | Where |
|---|---|
| Remotion bundle + render to MP4 (1920×1080, 30 fps; h264) | `scripts/render.mjs` (CLI `remotion render`), `@remotion/bundler`, `@remotion/renderer` |
| Fish Audio TTS, one call per beat, cached by hash of text + voice + model | `scripts/tts.mjs` |
| Measured audio timing: beat duration = measured clip length + 0.6 s; silent fallback with estimated durations | `scripts/tts.mjs` |
| Still-frame rendering (`renderStill`, one still per screen) | `scripts/stills.mjs` |
| Content-hash cache: unchanged inputs skip the Remotion pass | `scripts/render.mjs` |
| Acceptance tests: duration within 10% of the beat clips, fonts are real woff2 and load, a colour at a known beat, cached re-render under 60 s | `scripts/test.mjs` |
| Pinned fonts (Inter, Virgil) | `assets/fonts/` |
| Existing visual primitives (rough.js whiteboard, captions, code) | `src/lecture/` |

Motion extends this package: a Motion composition entry, the static validator, the determinism test and the final-validation checks are added next to the existing lecture pipeline. The CLI's zero-dependency rule is unaffected (learn-render has its own dependencies, and the CLI never imports from it).

## 9.2 Visual primitives

Inside Remotion compositions, V1 allows:

- React
- SVG
- Canvas (drawn from the current frame)
- CSS (static styling only; no CSS animation)
- existing safe animation primitives approved in M1

**GSAP is not used in V1.** `packages/web/package.json` lists `gsap`, but nothing imports it, and Motion compositions must not import it until the owner/legal review in §34 is done. GSAP's standard licence prohibits use in tools that let users build animations without code in competition with Webflow's visual animation features; a prompt-to-animation product may be close enough to matter.

## 9.3 Fixed authoring stage

Author every landscape composition at **1920×1080, 30 fps** unless another format is explicitly requested. Do not author one layout at 480p and another at 1080p. The preview is a scaled render of the same composition (§11.1).

16:9 is the V1 format. Architect for future 9:16 / 1:1, but do not let format proliferation block V1.

## 9.4 Renderer adapter boundary

```text
MotionRenderer {
  validateSource(brief, storyboard, source)
  renderPreview(job)
  renderStills(job, frames)
  renderFinal(job)
  validateFinal(job)
  collectDiagnostics(job)
}
```

V1 implementation: `RemotionRenderer` (packages/learn-render).

Future adapters (not V1): HyperFrames, Three.js, Manim, Blender. The learner-facing `/motion` command does not change when a renderer is added.

**HyperFrames** (HeyGen, Apache-2.0, released April 2026) stays documented as a future renderer experiment. If it later produces materially better results, it can become another adapter. It is not a V1 dependency.

---

# 10. Render service and sandbox

## 10.1 Linux from the first real render

Rendering happens in Linux from the first real render milestone (M1). Final frame fidelity never depends on the Windows development host: Chromium and font rasterization differ between hosts, and the determinism and preview/final checks assume one environment.

The primary development machine currently has **no Docker, no WSL and no ffmpeg** (checked 2026-10-03). Motion V1 therefore cannot assume a local sandbox runtime.

## 10.2 Proposed development render service

Preferred initial architecture: a new Rabbit Hole-owned development render service,

```text
rabbit-hole-motion-renderer-dev
```

a Fly app in the **Rabbit Hole Fly org**, using the existing math-renderer container pattern. Creating it requires explicit approval before deployment. It is not created by this spec.

Do not reuse `small-math-renderer-dev` as the Motion service, and do not create any new `small-*` resource. The math renderer is a pattern source only.

Proven ideas to reuse from `packages/math-renderer` (`Dockerfile`, `server.py`) and `packages/control-plane/src/math-provider.js`:

- Debian slim image, ffmpeg installed, non-root user
- bearer-token auth on every request, compared with `hmac.compare_digest`
- `/health` reports a version that becomes part of the job cache key
- one render slot at a time; busy answers 429
- a fresh temporary directory per job
- the render child gets a credential-free environment
- a hard render timeout (math renderer: 420 s)
- an output-size cap (math renderer: 25 MB)
- schema validation before rendering
- provider contract `submit → ticket`, `poll → null | bytes`, consumed by the LearnVideos Durable Object (§18)

New requirements for Motion, because composition source is generated code:

- the render child runs as a **separate unprivileged user** from the service process, so it cannot read the service's environment or token
- **no arbitrary network access**: the render child gets loopback only (for Remotion's local bundle server). The mechanism (for example a network namespace for the child, plus a Content Security Policy on the bundle page) is chosen in M1 and proven by a test in which a composition's outbound request fails
- **no arbitrary filesystem access**: the child reads only its job directory and the read-only render package, and writes only its output directory
- CPU, memory, process-count and wall-clock limits
- output validation before acceptance (§11.3)
- no model keys, Fish key, user cookies, OAuth tokens or provider keys ever reach the render service; it receives only the composition source and deterministic assets for one job

Model calls (Director, storyboard, Author, reviewers) and TTS calls happen **outside** the render service, on the orchestrator side (§18). The render service never holds model or Fish credentials.

## 10.3 Authoring on the Windows host

learn-render may still run on the Windows host for authoring iteration. Those renders are never used for determinism, preview/final comparison or acceptance.

---

# 11. Preview, contact sheet and final validation

## 11.1 Preview

Do not repeatedly render full-resolution final video during iteration.

```text
validated composition
→ preview: same composition, same fps and timing, rendered with Remotion's output scale (≈ 854×480)
→ stills at the contact-sheet timestamps
→ contact sheet
→ determinism check (§8.3)
→ fresh reviews
```

The preview changes resolution only. Layout, timing and stage are identical to the final.

## 11.2 Contact sheet

Stills at least at:

- the first frame
- the hook
- every beat boundary and the middle of every beat
- any notation/equation frame
- the final takeaway
- any `qa_requirements.keyframe_times`

Reuse `scripts/stills.mjs` / `renderStill`.

## 11.3 Final validation (automatic, after the final render)

Preview QA does not prove the final output. After the final render, run cheap automatic checks:

- `ffprobe` duration ≈ `duration.seconds` (within one frame) and ≤ 30 s
- frame count and fps (30)
- resolution 1920×1080
- output size under the cap
- blank-frame detection on the contact-sheet timestamps and the last frame
- final keyframe hashes recorded in the job
- final vs preview: render the contact-sheet frames at final scale, downscale them to preview size, and compare with the preview frames under a pixel-difference threshold set in M5 (exact hash equality is expected between two renders at the same scale, not across scales)

If the final differs unexpectedly from the preview, **fail the job**. Do not launch another repair; the single repair round is only before the final render.

---

# 12. Review

## 12.1 Fresh, blind reviewers

Both reviewers are fresh calls with no memory of earlier stages.

| Reviewer | Receives | Never receives |
|---|---|---|
| Visual reviewer | the MotionBrief + rendered frames (contact sheet, keyframes) | Author/Director rationale or self-assessment; storyboard notes; earlier findings |
| Pedagogical reviewer | the MotionBrief + source evidence + rendered frames (+ narration script when narration is on) | Author/Director rationale or self-assessment; earlier findings |

"Review the artifact, not the author's argument for why it is good."

## 12.2 Visual checks

At least the first frame, the hook, major transitions, the primary teaching beat, any notation/equation frame and the final takeaway. Check for:

- clipping
- blank frames
- unreadable text
- overlapping labels
- bad contrast
- awkward typography
- broken geometry
- jitter
- unintended disappearance
- incorrect layering
- excessive visual busyness
- timing too fast to understand
- decorative motion that obscures the concept

## 12.3 Pedagogical / source checks

A visually beautiful video that teaches the wrong thing is a failure. Check:

- every major beat maps to a source-supported claim
- the correct source/code branch is represented, with its condition
- the conceptual order is coherent
- no prerequisite is skipped in a way that makes the video misleading
- the visual implies the correct causal relationship
- labels match source semantics
- analogies map explicitly to real concepts, and their limits are not hidden when relevant
- the takeaway matches the objective
- no `must_not_claim` violation
- every `must_show` item appears
- narration and visuals agree

For `intuition_first`:

```text
If the equation/formal notation were hidden,
could the learner explain the core mechanism in plain language?
```

```text
After formalism appears,
can the learner map the major intuition elements to the real mechanism?
```

---

# 13. Blocking findings and the single repair

## 13.1 Blocking

These consume the single repair round (§4.8):

- unsupported factual claim
- `must_not_claim` violation
- required claim contradicted
- wrong source/code branch represented
- blank frame
- materially clipped text
- materially overlapping, unreadable text
- missing `must_show` concept
- duration > 30 seconds
- corrupt or unplayable output
- renderer failure
- narration materially contradicts visuals

## 13.2 Advisory (never repaired automatically)

- minor easing preference
- aesthetic preference
- small spacing issue that does not affect readability
- alternate but valid colour choice

## 13.3 Policy

```text
preview → fresh reviews → blocking?
    no  → final render → final validation
    yes → one repair round → re-render preview → fresh reviews
            still blocking → job failed, diagnostics kept
            clean          → final render → final validation
```

If the job fails, keep its diagnostics, do not insert a broken video into the canvas, and do not start another repair. No unbounded rendering loop exists.

---

# 14. Toolchain

| Piece | V1 choice |
|---|---|
| Director, storyboard, Author, reviewers | role-configured models (§4.9); runtime may resolve to `claude-opus-5-5` |
| Renderer | Remotion via `packages/learn-render` |
| Browser | the headless Chromium that Remotion drives |
| Encoding / probing | ffmpeg / ffprobe in the Linux render container |
| Frame inspection | `renderStill` stills, contact sheet, poster frame |
| Narration (optional) | Fish Audio through learn-render's per-beat path (§15) |

Pin every version in the render image. M1 reports exact dependencies and licences.

---

# 15. Narration (optional)

Narration is optional and not required for V1 acceptance. Add it only after silent motion passes the M8 demos. Do not let audio complexity block visual V1.

Policy:

```text
5s       → no narration by default
10–15s   → optional one short line
20–30s   → optional concise narration when useful
```

Reuse learn-render's per-beat path: one Fish call per beat, measured clip duration, beat duration = clip + 0.6 s. Do not guess narration duration when it can be measured.

- TTS calls run on the orchestrator side; the audio files enter the render package as deterministic assets (§16). The render service never holds the Fish key.
- Narration is a paid call and follows the existing confirmation gate (§25).
- Narration never includes unsupported claims or private learner content.

**Secret name.** The canonical runtime secret is `FISH_AUDIO_API_KEY` (the dev worker's `/api/learn/tts` and the documented secrets list use it). `packages/learn-render/scripts/tts.mjs`, its README and `render.config.json` still use `FISH_AUDIO_KEY`. Compatibility mapping until that script is updated: `FISH_AUDIO_KEY` is a legacy alias for the same key. When Motion first uses narration, `tts.mjs` reads `FISH_AUDIO_API_KEY` and falls back to `FISH_AUDIO_KEY`. Do not introduce a third name.

---

# 16. Asset policy

Prefer programmatic vectors, shapes, diagrams and typography for V1.

If a job requires external assets:

```text
asset resolution happens BEFORE the sandboxed render
```

The orchestrator fetches/validates an allowlisted asset and copies the deterministic asset into the render package. The generated composition never fetches anything during render.

For code explainers, source excerpts are generated from approved repository content at the pinned commit and included as deterministic assets (or as text in the brief's evidence).

---

# 17. Privacy policy

Do not place learner-private content into generated videos unless that content is intentionally part of the learner's requested artifact.

Never automatically include:

- voice transcripts
- raw Tutor private context
- OAuth data
- email addresses
- secrets
- private environment variables
- unrelated private repository material

A source-grounded code explainer may use the exact selected private code when the user is authorized and intentionally requests a private artifact, but provenance/access rules must remain intact.

Do not upload private source to third parties beyond the approved model/render provider contracts required for the job.

---

# 18. Storage, artifact and canvas insertion

Motion V1 reuses the existing video pipeline. It does **not** introduce a new MotionArtifact persistence model.

| Existing piece | Reuse |
|---|---|
| `LearnVideos` Durable Object (`packages/control-plane/src/learn-video.js`) | holds the job per learner (org, app, email); one generating job at a time; saved-video limit; alarm-driven polling; never automatically repeats a potentially charged submission |
| Provider contract (`ManimProvider` in `math-provider.js`) | a Motion provider follows the same `submit → ticket`, `poll → null \| bytes` contract against the render service |
| `LEARN_MEDIA` R2 binding, `learnMedia(env)` (`learn-storage.js`) | stores the final MP4 under the existing `learn-video-dev/<doId>/<key>.mp4` key scheme |
| `GET /api/learn/video?app=…&asset=<64-hex>` | serves the MP4 privately with Range / 206 |
| `BLOCK_TYPES.video` + `VideoBody` (`packages/web/src/LearningBlocks.jsx`) | the canvas card and player |
| `runLearnCommand` → `canvas.insertBlock` (`packages/web/src/learn-slash.js`) | inserts the result |

Insertion is an ordinary video block:

```js
insertBlock({
  type: 'video',
  // title, caption, the src/asset wiring and status follow the existing
  // video block; M7 decides the exact mode/src fields against VideoBody
  // and the LearnVideos placement model.
  provenance: { motion_job_id, prompt_spec_version, source_refs, claim_ids },
})
```

not a new Motion card system.

Provenance lives in the existing video job/block metadata. It must answer: *what source, card, code and claims generated this motion explainer?* Do not expose inaccessible source references to viewers who lack permission.

Preview and contact-sheet refs point to harness job-directory files in M1–M6, and from M7 to `LEARN_MEDIA` keys under the job's existing prefix. Serving previews to learners is not part of V1.

Where the orchestration runs in M7 (alarm-driven stages in the LearnVideos Durable Object, like its existing polling, or a development-only harness process) is an M7 decision. Either way, model and Fish keys stay outside the render service.

Card behaviour once ready:

```text
[poster / video]
Title
15 sec · Motion explainer
Play

Sources / provenance
Open storyboard (optional/debug/creator)
```

The learner plays the artifact without leaving the canvas. A failed job inserts nothing broken.

Later actions (fork canvas with artifact, share, regenerate with a different teaching mode, expand to interactive explanation, open source concept) are not V1.

---

# 19. Relationship to Tutor

Tutor may suggest motion when it is pedagogically useful, but V1 does not automatically generate paid motion on every difficult concept.

```text
Tutor: "This relationship is easier to see moving. Want a 10-second animation?"
```

Generation starts only after learner intent/confirmation according to cost policy.

- **Tutor** decides WHETHER an animation is the right teaching move.
- **Motion Director** decides HOW that animation should teach the concept.
- **Motion Author** decides HOW to implement it against the renderer contract.

Tutor reuses the same `/motion` pipeline and the same Learner Intent Resolver. There is no second video-generation implementation.

---

# 20. Relationship to `/dive`

A Rabbit Hole provides a natural scope for a motion explainer.

```text
Transformer canvas
  ↓
Attention Rabbit Hole
  ↓
/motion explain this mechanism
```

The motion context should prefer the current Rabbit Hole and its relevant source references rather than indiscriminately using the entire project.

Do not change `/dive` semantics in this implementation.

---

# 21. Relationship to Practice / course content

A motion explainer may later be used as:

- lesson hook
- intuition layer
- mechanism walkthrough
- code walkthrough
- feedback after a misconception

But Motion V1 is an on-demand artifact first.

Do not automatically insert motion into every authored course lesson.

---

# 22. Prompt architecture

Do not maintain one giant unstructured prompt string. Each stage call has its own structured template, built from brief fields:

| Call | Sections |
|---|---|
| Director | ROLE, TASK, LEARNER TURN, SOURCE OF TRUTH, IMPLEMENTATION CONDITIONS, DURATION POLICY, TEACHING MODES, OUTPUT SCHEMA |
| Storyboard | ROLE, MOTIONBRIEF, STORYBOARD RULES, OUTPUT SCHEMA |
| Author | ROLE, TASK, OBJECTIVE, AUDIENCE, SOURCE OF TRUTH, CLAIMS, CONDITIONS, MUST SHOW, MUST NOT CLAIM, TEACHING MODE, DURATION, VISUAL DIRECTION, STORYBOARD, RENDERER CONTRACT, NARRATION POLICY, OUTPUT |
| Visual reviewer | ROLE, MOTIONBRIEF, FRAMES, CHECKS, FINDING SCHEMA |
| Pedagogical reviewer | ROLE, MOTIONBRIEF, SOURCE EVIDENCE, FRAMES, CHECKS, FINDING SCHEMA |
| Repair | the original stage's sections + BLOCKING FINDINGS |

Benefits: easier testing, source grounding, renderer-specific contracts, reproducible failures, model comparison and prompt versioning.

Every MotionJob stores `prompt_spec_version`.

---

# 23. Example Author prompt template

```text
ROLE
You are an educational motion designer and animation engineer.
Your job is to make motion reveal the concept clearly and accurately.

TASK
Implement the validated storyboard as one Remotion composition
of exactly {duration_seconds} seconds at 1920×1080, 30 fps.

LEARNING OBJECTIVE
{objective}

AUDIENCE CONTEXT
{audience_context}

SOURCE OF TRUTH
{evidence}

SUPPORTED CLAIMS
{claim_registry}

IMPLEMENTATION CONDITIONS
{implementation_conditions}

MUST SHOW
{must_show}

MUST NOT CLAIM OR IMPLY
{must_not_claim}

TEACHING MODE
{teaching_mode}

VISUAL DIRECTION
{visual_direction}

STORYBOARD
{storyboard}

RENDERER CONTRACT
Remotion. Imports: react, remotion, and the approved primitives only.
Derive every visible state from useCurrentFrame()/useVideoConfig()
with interpolate()/spring() or arithmetic on the frame.
No Date, performance.now, Math.random (use random(seed)),
requestAnimationFrame, timers, network or storage APIs.
No CSS @keyframes, animation or transition.
Use only the bundled fonts.

NARRATION POLICY
{narration_policy}

OUTPUT
Return either the composition source, or a needs_revision object
naming the beat/claim/condition that makes the brief or storyboard
insufficient or inconsistent. Do not improvise around missing evidence.
Do not review or grade your own output.
```

The implementation can improve the wording, but not weaken the contract.

---

# 24. Failure / clarification behavior

Do not start a render when the target cannot be resolved safely.

### Ambiguous target

```text
/motion explain softmax func
```

with several materially different occurrences and no context that selects one. Ask one concise clarification (§6.2).

### Unsupported source claim

```text
/motion show why this function uses temperature 0.7
```

when the selected source has no such behavior. Do not invent it. Explain that the requested claim is not supported by the current source, or ask what the learner meant.

### Too broad

```text
/motion explain transformers
```

for a 10-second default. Narrow to one useful objective (with a `scope_note` and a decision line) or ask the learner to choose: attention intuition, causal mask, residual stream, one forward pass.

### Author cannot implement the brief

The Author returns `needs_revision`; the harness uses the single repair round for one Director revision and one Author call. If the round is already used, the job fails with the reason.

### Renderer or final-validation failure

If rendering fails after the repair round, or final validation fails, keep the job failed with diagnostics and do not insert a broken video into the canvas.

---

# 25. Cost / paid policy

The architecture separates:

```text
cheap planning (brief + storyboard)
→ cheap preview
→ expensive final render
```

**Current reality.** The only paid-generation primitives that exist are the confirmation gate and the proposal:

- `paidRefusal(body)` (`packages/control-plane/src/learn-paid.js`) answers HTTP 428 `needsConfirm` unless the request carries `confirmed: true`, set only by an explicit Generate press. LearnVideos already runs it before every submission.
- a paid `/` command returns a `paid_proposal` (currently with `estimatedCost: null`) that the composer confirms.

Quote → reserve → settle is **not implemented**. It belongs to the future Usage & Credits work (paused).

**Motion V1 development harness:** no production billing is required. Development runs still go through the existing confirmation gate, so nothing paid starts because a learner typed a question.

**Paid production rendering is deferred** until Usage & Credits exists. Then the production flow is: quote → explicit user confirmation → reserve → render → settle. M9 depends on it.

---

# 26. Milestones

Do not attempt everything in one commit.

| Milestone | Scope | Status |
|---|---|---|
| **M0** | Documentation, canonical schemas (§5), demo fixtures (§27) | Schemas and fixture definitions: this document. Fixture files (brief/storyboard examples, pinned source excerpts) are created at the start of implementation. |
| **M1** | Audit the existing Remotion render path; deterministic Linux render harness | Authorized |
| **M2** | Learner Intent Resolver integration (shared slice) + Motion Director + grounded MotionBrief | Authorized |
| **M3** | Storyboard generation + validation | Authorized |
| **M4** | Motion Author → Remotion composition source + static validation | Authorized |
| **M5** | Preview + contact sheet + determinism checks | Authorized |
| **M6** | Fresh visual + pedagogical review + exactly one repair round | Authorized |
| **M7** | Final render + final validation + LearnVideos / R2 + existing video-block insertion, in a development environment only | Authorized |
| **M8** | End-to-end development demonstration: §27 demos pass human review; required report (§36) | Authorized |
| **M9** | Production `/motion` integration | **DEFERRED** pending explicit approval and the Usage & Credits payment architecture. Do not start M9 from this specification alone. |

## M1 — Remotion render path audit + deterministic Linux render harness

No model calls.

- run learn-render's existing pipeline in Linux and record what works
- a hand-written 5-second deterministic Remotion composition
- preview (scaled) → final MP4 → stills → contact sheet
- determinism hash test (§8.3)
- proof that `Math.random`, `Date`, network and CSS-animation use are rejected by static validation, and that an outbound request from a composition fails in the sandbox
- the approved primitive allowlist
- exact dependencies and licences

M1's first real render needs either the approved `rabbit-hole-motion-renderer-dev` Fly app or a Linux container runtime on the development machine. Neither exists today; request the approval at M1 start.

**M1 decisions (implemented in `packages/learn-render/motion/`, 2026-10-04):**

- Composition module: `export const stage = {width: 1920, height: 1080, fps: 30, durationInFrames}` as number literals, plus `export default` the component. The harness owns the Remotion root and the bundled-font loading.
- Approved imports: `react` (default, `Fragment`, `useMemo`, `useRef`, `useLayoutEffect`) and `remotion` (`AbsoluteFill`, `Sequence`, `Series`, `Freeze`, `Loop`, `Easing`, `interpolate`, `interpolateColors`, `spring`, `measureSpring`, `random`, `useCurrentFrame`, `useVideoConfig`). Not approved: the lecture `Code` primitive (unbundled system monospace fonts) and rough.js (unseeded shapes call `Math.random`). Fonts: Inter and Virgil only; no monospace font is bundled yet.
- Source-size cap: 64 KiB. Static validation parses with `@babel/parser`; webpack refuses any non-allowlisted import at bundle time as a second layer.
- Preview scale 0.45 (864×486): Remotion needs whole, even output dimensions, and 854×480 is not a uniform scale of 1920×1080.
- Final encoding: h264, yuv420p, bt709, muted while `narration_policy` is `none`. The duration check reads the video stream.
- Network on the Windows authoring host: a self-only Content Security Policy injected into the bundle page. The Linux render namespace (`motion/linux/`) is the boundary for everything CSP does not cover.

**Stop and report after M1** before building the model pipeline if the renderer/toolchain is not reliable.

## M2 — Resolver + Director + MotionBrief

```text
raw request
→ Learner Intent Resolver (shared slice)
→ resolved target + candidates
→ evidence pack + implementation conditions
→ claim registry
→ objective, teaching mode, duration, scope
→ must_show / must_not_claim
→ validated MotionBrief
```

Deterministic tests use the §27 fixtures (pinned commits and recorded model responses). The most important cases: `/motion explain me softmax func` resolves to the attention occurrence with K1 recorded when the attention lesson is current, and asks one clarification when it is not.

## M3 — storyboard

Director-role call → storyboard JSON → harness validation (§5.2). Malformed or ungrounded storyboards are rejected (one format retry).

## M4 — Author

Author call → composition source or `needs_revision` → static validation (§8.2).

## M5 — preview and determinism

Preview render, contact sheet, determinism hashes, preview/final comparison threshold.

## M6 — review and repair

Fresh visual and pedagogical reviewers; harness classification (§13); one repair round.

## M7 — final render and insertion (development only)

Final render, final validation, Motion provider in LearnVideos, `LEARN_MEDIA` storage, `insertBlock({type: 'video', …})` in a development environment. Narration may be enabled here only after silent runs pass.

## M8 — end-to-end development demonstration

All §27 demos through the full pipeline; human review; the required report.

## M9 — production (deferred)

Before any production work, with a separate explicit GO, review:

- sandbox isolation
- model/provider cost
- storage, media serving, cleanup and retention
- paid confirmation through Usage & Credits (quote → confirm → reserve → render → settle)
- privacy
- observability
- abuse/resource caps
- the licence items in §34

---

# 27. Demo fixtures

No demo may depend on unspecified repository or context state.

## Demo A — Softmax / attention (`mechanism_first`)

| Field | Value |
|---|---|
| Repository | `karpathy/nanoGPT` |
| Commit | `3adf61e154c3fe3fca428ad6bc3818b27a3b8291` (pinned by the NanoGPT course docs) |
| Context | NanoGPT course, current concept: attention; nothing selected |
| Request A1 | `/motion 15s explain me softmax func` |
| Expected target | `model.py:69` (`F.softmax` in `CausalSelfAttention.forward`); `model.py:324` (`GPT.generate`) recorded in `candidates_considered` |
| Expected conditions | K1 from `model.py:44–45`: SDPA (`model.py:62–64`, `is_causal=True`) vs fallback (`model.py:65–71`, mask buffer `48–50`) |
| Expected claims | C1–C3 as in §6.4 |
| Must not appear | "nanoGPT always executes the explicit F.softmax path" |
| Duration | 15 s (the demo may use any requested value from 15 to 25 s) |
| Request A2 | `/motion explain me softmax func` with **no** lesson context and nothing selected |
| Expected A2 | one clarification: attention (`model.py:69`) or sampling (`model.py:324`); no render |

## Demo B — code walkthrough (`code_walkthrough`)

| Field | Value |
|---|---|
| Repository | `karpathy/nanoGPT` |
| Commit | `3adf61e154c3fe3fca428ad6bc3818b27a3b8291` |
| Selection | `repository_context {commit: <above>, label: "GPT.generate", range: {path: "model.py", start: 305, end: 330}}` |
| Request | `/motion 20s show what happens here` |
| Expected target | the selected span (deictic "here"), `GPT.generate` |
| Expected source refs | `model.py:306` signature (`temperature=1.0, top_k=None`); `312` loop over `max_new_tokens`; `314` crop context to `block_size`; `316` forward pass; `318` last-position logits divided by `temperature`; `320–322` optional top-k sets the rest to `-inf`; `324` `F.softmax` → probabilities; `326` `torch.multinomial` sample; `328` append and continue |
| Must not appear | "generate always picks the highest-probability token"; "temperature is applied after softmax"; "top-k is always applied" |

## Demo C — request flow (`system_flow`)

| Field | Value |
|---|---|
| Repository | this repository (Rabbit Hole) |
| Commit | `e9d6dbe7f088a8a2d99e138c0b08a4c7a2dfcc25` (origin/main on 2026-10-03) |
| Selection | `repository_context {commit: <above>, label: "LearnVideos asset GET", range: {path: "packages/control-plane/src/learn-video.js", start: 34, end: 46}}` |
| Request C1 | `/motion 30s show how this request moves through the app` |
| Expected request path | `GET /api/learn/video?app=…&asset=<64-hex>` |
| Expected source refs | `packages/web/dev-worker.js:135` route → `videoFetch`; `learn-video.js:12–14` `videoFetch` → `privateLessonAssetFetch(LEARN_VIDEOS)`; `:21–23` app authorization + sign-in check; `:27–28` per-learner Durable Object id from org, app and email; `:37–39` 64-hex key check and ready-job check; `:40` R2 read with the request's Range header; `:42–45` headers and 206/200; `packages/control-plane/src/learn-storage.js:10` `learnMedia` = `LEARN_MEDIA` or `RUNS` |
| Must not appear | the Worker generating the video on request; the browser reading R2 directly; public video URLs; any service not in the refs (no CDN, no invented queue) |
| Request C2 | the same request with **nothing selected** |
| Expected C2 | one clarification asking which request or route; no render |

## Optional Demo D — intuition (`intuition_first`)

`/motion 20s intuition attention`, in the NanoGPT attention lesson. Expected: an `analogy_map` with limits, then the bridge to the real mechanism.

---

# 28. Acceptance criteria

A Motion V1 development candidate must demonstrate:

1. `/motion` accepts a short learner prompt.
2. The raw prompt reaches only the Learner Intent Resolver; the Author never receives it.
3. Target resolution uses the shared Resolver slice and the §4.3 precedence.
4. Unresolved ambiguity produces one clarification, not a guess.
5. The MotionBrief validates against §5.1, with source refs, evidence, implementation conditions and supported claims.
6. Duration parsing and normalization follow §2.2; every normalization prints its decision line.
7. Video duration is 5–30 seconds.
8. The storyboard exists and validates before any composition source is written.
9. Storyboard beats map to claim IDs; required claims and `must_show` items are covered.
10. Composition source passes static validation.
11. Renderer output is deterministic (§8.3).
12. Generated code runs only in the sandbox.
13. Preview render completes.
14. Contact sheet is generated.
15. Fresh visual review runs.
16. Fresh pedagogical/source review runs.
17. At most one repair round occurs.
18. Final MP4 is generated and passes final validation (§11.3).
19. Poster is generated.
20. Provenance is retained in the existing video job/block metadata.
21. The final artifact is inserted as an existing `type: 'video'` block in a development environment.
22. No unsupported claim appears.
23. No secret/private unrelated material leaks.
24. No arbitrary network or filesystem access exists in the renderer.
25. No model ID appears in the brief, storyboard or other contract objects.
26. The §27 demos pass human review.

---

# 29. Testing strategy

## Unit tests

- duration parsing and normalization (every row of the §2.2 table)
- 5–30 second enforcement
- explicit name beats ambient context
- deictic binding to selected card / code span
- ambiguous target → one clarification
- nanoGPT softmax: candidates found, K1 recorded, unconditional claim rejected
- MotionBrief schema validation (§5.1 rules)
- storyboard schema validation (§5.2 rules)
- composition static validation (§8.2)
- blocking vs advisory classification (§13)
- one repair round maximum; `needs_revision` consumes it
- one format retry maximum
- prompt-template construction per stage
- model IDs absent from contract objects
- provenance serialization

## Security tests

- generated code cannot read the host or service environment
- generated code cannot access arbitrary filesystem paths
- generated code cannot reach the network
- timeout kills a runaway job
- oversized output is rejected
- secret-looking input is not logged

## Rendering tests

- same frame in two fresh contexts → same hash
- preview output exists
- final MP4 valid (ffprobe duration, fps, resolution)
- no blank final frame
- contact sheet includes the requested timestamps
- final vs preview comparison within threshold

## Product tests

- selected card + `/motion explain this`
- selected code + `/motion show what happens here`
- explicit duration
- default duration
- ambiguous request
- insertion into the canvas as a video block
- a failed job inserts nothing broken

---

# 30. Observability

Motion V1 does not depend on any particular observability provider. Sentry does not exist in the repo today; when it lands, these events may be emitted there.

Job-level events:

```text
motion_requested
motion_clarification_needed
motion_brief_created
motion_storyboard_created
motion_preview_rendered
motion_review_blocking
motion_repair_started
motion_final_validated
motion_ready
motion_failed
```

Safe properties:

- `render_job_id`
- stage
- renderer
- duration
- teaching mode
- failure category
- repair count
- timing per stage
- model role (and resolved model)

Do not log:

- raw private source code
- raw learner message if sensitive
- prompt bodies
- generated private narration/source
- secrets

---

# 31. Storage / cleanup

Development harness:

```text
scratch job directory
→ clean after the run unless retained intentionally
```

Production storage (M9) should separate source package / manifest, preview media, final media, poster/contact sheet and QA/provenance, with retention rules so failed preview artifacts do not accumulate forever.

V1 development uses the existing `LEARN_MEDIA` binding and LearnVideos key scheme (§18). Do not decide new production bucket names in this harness work.

---

# 32. Infrastructure and naming

- Do not run ffmpeg, Chromium or generated code inside any Cloudflare Worker.
- All new Rabbit Hole resources, development or permanent, use `rabbit-hole-*` names, in the Rabbit Hole Cloudflare account and Fly org.
- Never create a new `small-*` resource. Existing `small-*` names (for example the `small-learn-media-dev` bucket behind `LEARN_MEDIA`, or `small-math-renderer-dev`) appear in this spec only because they refer to existing resources awaiting migration or retirement.
- Creating `rabbit-hole-motion-renderer-dev` (§10.2) requires explicit approval before deployment.

Likely production topology (M9, not V1):

```text
rabbit-hole-app
   ↓ internal authenticated job
rabbit-hole-motion-renderer
   ↓
sandboxed render container
   ↓
artifact storage
```

---

# 33. What not to build in V1

Do not build:

- a full video editor
- a timeline editor UI
- arbitrary third-party plugins
- unrestricted user JavaScript execution
- arbitrary Blender Python
- autonomous long-form video essays
- videos longer than 30 seconds
- automatic video for every Tutor answer
- automatic video for every lesson
- a social video marketplace
- multi-user live editing
- a renderer marketplace
- several renderers at once (HyperFrames, Three.js, Manim, Blender adapters)
- a new MotionArtifact store or a special Motion card system
- iterative repair loops beyond one repair round

Get one renderer and one workflow extremely reliable first.

---

# 34. Release / legal checklist

These are owner/legal review items, not architectural blockers for the development harness:

- **Remotion licence.** Free for individuals, non-profits and for-profit organizations with up to 3 employees; larger for-profit organizations need a company licence. Check before broad commercial production use.
- **GSAP licence.** Free under GSAP's standard "no charge" licence, which prohibits use in tools that let users build animations without code in competition with Webflow's visual animation features. Not used in V1 (§9.2); review before any Motion use.
- **HyperFrames licence.** Apache-2.0. Review only if it becomes an adapter.
- **Fish Audio** terms for generated narration in distributed videos, when narration ships.
- **nanoGPT** (MIT) excerpts shown in videos keep their attribution in provenance.

---

# 35. References / inspiration corpus

Use these for design research and prompt inspiration, not as runtime dependencies.

- Addy Osmani motion explainer / browser walkthrough post supplied by the product owner
- `awesome-opus5-5-videos`
- YouMind Opus 5.5 prompt examples
- Jason Zhu Opus 5.5 prompt/video library
- educational Canvas explainer workflows shared by Claude users
- HyperFrames (future renderer experiment, §9.4)
- Remotion agent skills and rendering patterns

Important lesson from the public examples:

```text
"one prompt" often hides substantial autonomous work
```

The reliable architecture is not:

```text
prompt → perfect video
```

It is:

```text
brief
→ storyboard
→ code
→ render
→ inspect
→ repair
→ final
```

with the harness, not the model, owning each arrow.

---

# 36. Instructions to Parallel

Create an isolated branch/worktree from the latest canonical main after currently active merges are stable.

```text
branch:   feature/motion-v1-harness
worktree: workspace/motion-v1-harness
```

Use sub-agent-driven implementation/review where useful, with one primary owner. Do not work directly on main.

## Checkpoints

1. **After M1** (no model calls): Linux render path, hand-written deterministic composition, preview, MP4, contact sheet, determinism hashes, restriction tests, dependencies and licences. Stop and report before building the model pipeline if the toolchain is not reliable.
2. **After M2**: show for `/motion explain me softmax func` (both Demo A requests):

   ```text
   raw prompt
   → LearnerTurn
   → resolved target + candidates
   → evidence pack + implementation conditions
   → claim registry
   → learning objective
   → teaching mode
   → duration (+ decision line)
   → must_show
   → must_not_claim
   → final MotionBrief
   ```

3. **After M4**: storyboard and composition source for Demo A; the Author never saw the raw prompt.
4. **After M6**: review findings, the harness's blocking classification, and the repair round if one ran.
5. **After M8**: the full report below.

## Required report

1. branch/SHA
2. dependency/tool audit
3. renderer setup (Remotion via learn-render) and what changed in learn-render
4. sandbox design and the network/filesystem isolation proof
5. MotionBrief schema as implemented
6. Resolver + Director implementation
7. exact enriched example for `/motion explain me softmax func`
8. storyboard schema as implemented
9. generated-code contract and static validator
10. review implementation
11. repair behavior
12. audio/narration status
13. output artifact structure (job/block metadata)
14. all tests
15. render timings
16. approximate model/render cost for 5/10/15/20/30 seconds
17. the demo videos
18. screenshots/contact sheets
19. remaining blockers before production

Do not merge.
Do not deploy production.
Do not create infrastructure without explicit approval.
Stop for review.

---

# 37. Final principle

The goal of `/motion` is not to make formulas prettier.

The goal is to build the mental model that makes the formula, code or system behavior make sense.

The harness should therefore optimize for:

```text
source correctness
+ pedagogical clarity
+ deterministic motion
+ visual polish
```

not for spectacle alone.

A good Rabbit Hole motion explainer should leave the learner able to say:

```text
"I can see what is happening now."
```

and, when appropriate:

```text
"I can map what I just saw back to the real code / math / system."
```

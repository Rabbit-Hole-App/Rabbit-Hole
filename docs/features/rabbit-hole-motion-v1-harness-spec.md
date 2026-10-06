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
Storyboard                       (Director role; validated; renderer-neutral)
    ↓
Renderer selection               (harness; the Director may recommend)
    ↓
Motion Author                    (writes renderer-specific composition source only)
    ↓
composition source               (statically validated for that renderer)
    ↓
render harness                   (MotionRenderer adapter, Linux render sandbox)
    ↓
preview + contact sheet + determinism checks
    ↓
fresh visual reviewer + fresh pedagogical reviewer
    ↓
at most one repair per stage: storyboard, Author (only for blocking findings)
    ↓
final render + automatic final validation
    ↓
existing LEARN_MEDIA / LearnVideos storage
    ↓
existing `type: "video"` block via insertBlock
```

**Duration:** any whole number of seconds from 5 to 30. Default 10 seconds when the learner gives none. See §2.2.

**Renderers** (owner decision 2026-10-04, locked): Motion V1 needs BOTH.

- **Remotion** (`packages/learn-render`) is the baseline and the first implementation (M1, M7A).
- **HyperFrames** is the priority second renderer (M7B), the first adapter built once the Remotion baseline works.
- Both are required before the renderer-selection strategy is finalized by the M8 benchmark.
- Neither replaces the other.

Three.js, Manim and Blender remain future adapters, not V1. See §9.

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
- one repair per stage (storyboard, Author), two at most
- final local/development render
- insertion through the existing video block in a development environment

**Not authorized:**

- public production `/motion`
- production paid rendering
- automatic paid charges
- broad user rollout
- arbitrary generated-code execution (generated composition source runs only after static validation, inside the render sandbox, with allowlisted imports; see §8 and §10)
- production renderer adapters of any kind; the HyperFrames adapter is authorized for development at M7B (§9.5), and Three.js, Blender and Manim adapters are not authorized at all
- milestone M9 (§26)

Creating new infrastructure still requires explicit approval before it is deployed. The development render service `rabbit-hole-motion-renderer-dev` (§10.2) is approved as the M1 Linux runtime (owner decision 2026-10-04); Home creates and deploys it.

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
| **Motion Author** | composition source from the validated brief + storyboard + the selected renderer's contract | changing the objective, claims, sequence or scope; grading its own output |
| **Render harness** | every stage transition, renderer selection, validation, rendering, repair counting, final validation, storage | creative or pedagogical decisions |
| **Visual reviewer** (fresh) | visual findings from the brief + rendered frames | seeing the Author's self-assessment |
| **Pedagogical reviewer** (fresh) | correctness findings from the brief + source evidence + rendered frames | seeing the Author's self-assessment |

The architecture is:

```text
learner → Learner Intent Resolver → Motion Director → MotionBrief + storyboard
        → renderer selection → Motion Author → renderer-specific composition → sandbox → render → QA → video
```

not `learner → prompt enhancer → model`. "Prompt enhancer" is not a component name in this system.

**Renderer-neutral until the Author.**

- The MotionBrief and the storyboard carry no Remotion- or HyperFrames-specific assumption unless one is absolutely required. They describe the stage, timing, beats, claims and visuals, not React components or HTML.
- The renderer-specific contract starts at the Motion Author / renderer adapter boundary: imports, the composition format, the static rules and the render command.
- The Director may recommend a renderer. The harness makes the final, allowed choice (§9.5).

## 4.2 Learner Intent Resolver

Motion does not invent its own context-resolution system. It uses the shared **Learner Intent Resolver** whose contract is "Future shared input layer: Learner Intent Resolver" in `docs/features/adaptive-tutor-v1.md` (on main). That contract builds a structured `LearnerTurn` and keeps `raw_user_message` next to `structured_interpretation`, with per-concept evidence and no permanent learner labels.

M2 built the motion-facing slice of it **in the shared location, to the shared contract**, so that the Tutor and other specialists can consume the same component later. It is not a private `/motion` resolver:

- `packages/control-plane/src/learner-intent.js`: `resolveLearnerTurn({message, location, selection, canvas_target, repository_context})` returns the `LearnerTurn` (`raw_user_message` verbatim, `command`, `structured_interpretation {request_text, target {binding: named | deictic | deictic_unbound | none, name, kind_hint}, requested_duration, requested_mode}`, `current_location`, and the validated `selection`, `canvas_target` and `repository_context` in their existing identity shapes). It reads the request; it does not ground it, normalize the duration or label the learner.
- `packages/control-plane/src/source-grounding.js`: `groundTarget(turn, source)` decides which occurrence the target is, against a pinned source `{repository, commit, files, read}`, and returns `grounded` (resolved target, candidates considered, source refs, verbatim evidence, implementation conditions) or `needs_clarification` / `not_found` with one question.
- `packages/control-plane/src/request-duration.js`: the one duration reader, shared by the Resolver and Motion's duration policy (`packages/learn-render/motion/duration.js`).

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
- The storyboard changes only through a Director revision, the storyboard's one repair (§4.8).

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
8. The Author repair (once per job; the storyboard's own repair is separate, below)
     - Author-level defect           → one Author call with the blocking findings
     - brief/storyboard-level defect → one Director revision (revalidated) if the
                                        storyboard repair is unused, then one Author call
     → re-render preview, re-run both fresh reviewers
     → still blocking → job fails with diagnostics; no further repair
9. Harness                 → final render + automatic final validation (§11.3)
     fails → job fails; no further repair
10. Harness                → store via LearnVideos / LEARN_MEDIA; insert video block (§18)
```

Rules:

- **One semantic repair per artifact stage, at most two per job** (owner decision 2026-10-05; it replaces the single round the whole job shared, decided 2026-10-04). The job records `repairs: {storyboard: 0 | 1, author: 0 | 1}`, and `repair_count` is their sum.
  - **Storyboard:** first pass → one Director revision when it fails its checks → final storyboard.
  - **Author/preview:** first pass → preview and fresh reviews → one Author repair when anything blocks → preview and fresh reviews → final.
  - Example: a storyboard that fails its checks spends the storyboard repair; the Author's own repair stays available for its output.
  - Review findings at the storyboard level use a Director revision only while the storyboard repair is unused. Otherwise the Author repair runs alone.
  - An Author `needs_revision` spends both repairs: a Director revision, then the Author's regeneration. With either already spent, it fails the job.
  - After the Author repair, any further blocking failure fails the job. There is no third repair and no loop.
- Only **blocking** findings spend a repair. Advisory findings are recorded, never repaired automatically.
- **Transport retry** (Author, owner decision 2026-10-05). Every call records how it ended: `complete`, `transport_interrupted`, `gateway_timeout`, `max_tokens`, `malformed_tool_arguments`, `provider_error` or `refusal`.
  - **When:** an Author invocation may send its request again ONCE, unchanged, and only when the transport broke: an interrupted stream (including a stream that ended before `message_stop`) or a gateway timeout.
  - **Why it's safe:** no complete result was received, and nothing rendered from it (the stage has not returned).
  - **Not a repair:** it never spends a semantic repair. It is recorded as `transport_retries` (`{stage, round, kind, detail}`), and the call that broke keeps its partial usage as its cost record.
  - **Never retried:** a provider error or a refusal fails the stage. `max_tokens` and malformed tool arguments take the schema-only re-ask.
- **Format retry** is separate from semantic repair. Every distinct structured model invocation may get at most ONE schema-only re-ask when its response is malformed or unparseable (owner decision 2026-10-04).
  - **Invocation:** a stage in a round. Round 0 is the first pass; round 1 is that stage's repair (the reviews follow the Author's). A Director revision and an Author repair are distinct invocations, so each gets its own re-ask.
  - **The prompt:** the re-ask carries the malformed output and the validation errors, and asks only to return the same intended response in the required structure. It adds no findings and no new instructions.
  - **What it may not change:** the MotionBrief, the storyboard semantics, the claims, the teaching mode, the source grounding or the composition intent.
  - **Repairs:** the re-ask never spends one and never starts another semantic repair.
  - **A second malformed result** from the same invocation fails the job, naming the stage (and "repair round" when it happened there).
  - **Visibility:** every re-ask is recorded on the job as `format_retries` (`{stage, round, errors}`), separately from `repair_count`. Repeated failures are never hidden behind retries.
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

Runtime configuration may initially resolve all four to `claude-opus-5-5`. **M2 decision:** a role resolves from the environment, else from one development default in `packages/learn-render/motion/model-config.js` (`MOTION_DIRECTOR_MODEL` → `claude-opus-5-5`; the other roles get their defaults when their milestones add them). Whether the Motion roles join `LEARN_TASKS` is decided at M7, when Motion has a product entry point. The MotionJob records which model each role actually resolved to, for provenance, never credentials; the MotionBrief carries no model id (`validateBrief` rejects one).

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
    branches[] {                 // [condition holds, condition does not hold]
      when
      runs                       // what runs, as text
      source_ref_ids[]?          // the refs that run on this side (grounding writes them)
      no_op?                     // true: this side has no code of its own (an if without else);
                                 // its source_ref_ids are empty and no source is invented
    }
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
    start_time                   // seconds, on the 0.1 s grid (3 frames at 30 fps)
    end_time
    pedagogical_role             // hook | intuition | analogy | mechanism | bridge_to_formalism
                                 // | notation | equation | implementation | takeaway
    visible_objects[] {          // M3: was a list of strings
      id                         // stable snake_case semantic id; the same id in a later beat
                                 // is the same object (continuity is structural, not prose)
      description                // what it is and its state in this beat (for the Author)
      label?                     // the only learner-visible text on the object
      source? {source_ref_id, start_line, end_line}   // verbatim lines of one brief code ref
      change?                    // how it changes during this beat (enters, transforms, exits)
    }
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
- boundaries sit on the 0.1 s grid; object ids are snake_case and unique within a beat; a `source` lies inside its code ref.

**Semantic checks** (M3, `packages/learn-render/motion/storyboard-check.js`, deterministic, after the shape above):

- **scope:** at most floor(duration / 2) beats (8 maximum), each at least 1.5 s; no word from a topic the brief's `scope_note` leaves out.
- **motion:** every beat changes at least one object.
- **claims:** learner-facing text (labels, `on_screen_text`, `narration_line`) uses only the vocabulary of the brief's claims, must_show, objective, visual direction and evidence (plus function words). Named code must be in the evidence of the beat's claims or conditions. New facts are rejected even when true.
- **conditions:** a beat that names branch-only code or shows a branch's code names that condition and keeps it visible on screen (the flag or a branch word). "always" and the like never appear on branch-dependent content. Teaching one side of a condition requires teaching the other side when the brief has claims there.
- **must_not_claim:** a word that appears only in a must_not_claim item is rejected anywhere in the storyboard. A learner sentence that states steps against the code order ("X then Y", "Y after X") is rejected, and so are mechanism beats that animate a later step before an earlier one.
- **must_show:** a coverage map item → beats. A declared item counts only when the beat visibly carries at least 40% of the item's terms (objects, labels, code lines, text).
- **teaching mode:** checked from the beat structure.
  - mechanism_first: no intuition or analogy beat before the mechanism.
  - intuition_first: intuition or analogy first, then a mechanism or bridge beat.
  - code_walkthrough: source lines in every teaching beat, plus an implementation beat.
  - system_flow: three or more components, and a beat that changes two of them.
- **concise text:** labels at most 60 characters and 10 words; `on_screen_text` at most 2 sentences and 25 words; at most 40 words on screen per beat; new words at most 6 + 4 per second. Narration is planning only: one sentence of at most 20 words at 2.5 words per second, and one beat in all under `one_line`.
- **renderer-neutral:** no renderer, library, API, CSS, color code, easing function or pixel size anywhere.

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
  refs[],                        // beat / claim / condition IDs
  requested_changes[]? }         // M4: the concrete changes that would make it implementable
```

The Remotion Author contract inside `source` (M4, `packages/learn-render/motion/author-check.js`):
- `export const timeline = { B1: [from, to], ... }`: the storyboard's frames exactly.
- `export const TEXT = {...}`: every learner-visible string. It holds every storyboard label, on_screen_text and shown source line verbatim, and JSX renders text only through `{TEXT.key}`.
- One DOM element per storyboard object, carrying `data-object`. Each id is written exactly once as a literal: on the element, or as a prop or spec value handed to a primitive that sets `data-object={id}`.

`requested_changes` is required by the Author tool and optional in the contract, so the M0 fixtures stay valid.

Static validation of `source` (harness, before any render): §8.2.

## 5.4 Review finding

```text
ReviewFinding {
  reviewer                       // visual | pedagogical | harness (M6: the automatic preview checks)
  round?                         // 0, or 1 after the repair round (M6)
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
  repairs                        // {storyboard: 0|1, author: 0|1}: one semantic repair per stage (§4.8)
  repair_count                   // repairs.storyboard + repairs.author: 0, 1 or 2
  format_retries[]               // {stage, round, errors}: at most one per structured invocation
                                 // (stage x round 0|1); never counted in repair_count
  transport_retries[]            // {stage: author, round, kind, detail}: at most one per Author
                                 // invocation, only for a broken transport; never a repair
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

**What must match** (owner decision 2026-10-04): the same composition + the same pinned assets and fonts + the same renderer image + the same frame, rendered in two fresh Linux render contexts, give an identical decoded-pixel hash. Windows authoring hashes are never compared with Linux hashes: Chromium rasterizes text differently per OS. Every Linux proof reports the renderer image it ran on (the service's `/health` version and the image digest).

The development render service (§10.2) runs this check on every job: the first, middle and last frames and (since M5) every contact-sheet timestamp, rendered again by a second fresh context (its own bundle and browser), compared by decoded-pixel sha256. The orchestrator recomputes the verdict from the hashes (`render-job.mjs`); the service's own flag is not trusted.

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
| Pinned fonts (Inter, Virgil; Motion adds JetBrains Mono for code) | `assets/fonts/`, sha256-pinned in `FONT_PINS` |
| Existing visual primitives (rough.js whiteboard, captions, code) | `src/lecture/` |

Motion extends this package: a Motion composition entry, the static validator, the determinism test and the final-validation checks are added next to the existing lecture pipeline. The CLI's zero-dependency rule is unaffected (learn-render has its own dependencies, and the CLI never imports from it).

## 9.2 Visual primitives

Inside Remotion compositions, V1 allows:

- React
- SVG
- Canvas (drawn from the current frame)
- CSS (static styling only; no CSS animation)
- existing safe animation primitives approved in M1

**GSAP is not used in V1, by either renderer.** `packages/web/package.json` lists `gsap`, but nothing imports it, and Motion compositions must not import it until the owner/legal review in §34 is done. GSAP's standard licence prohibits use in tools that let users build animations without code in competition with Webflow's visual animation features; a prompt-to-animation product may be close enough to matter. GSAP can be evaluated separately after that review.

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

V1 implementations (owner decision 2026-10-04, locked):

```text
MotionRenderer
├── RemotionRenderer      baseline, first implementation (M1, M7A), packages/learn-render
└── HyperFramesRenderer   priority second renderer (M7B)
```

Future adapters (not V1): Three.js, Manim, Blender. The learner-facing `/motion` command does not change when a renderer is added.

## 9.5 HyperFrames: the priority second renderer

HyperFrames (HeyGen, Apache-2.0, released April 2026) is a serious production candidate, not a hidden experiment. It is the first adapter to build once the Remotion baseline works end to end (M7A), and it is required before the renderer-selection strategy is finalized.

Why HyperFrames:

- HTML/CSS/JS is a highly natural target for model-written motion code.
- It is designed around agent-authored deterministic animation.
- It is a strong fit for 5–30 s motion graphics, typography, diagrams and technical explainers.
- Its animation primitives are framework-independent.
- The Apache-2.0 licence is attractive.
- It may give the Author more creative freedom than React/Remotion compositions.

**The adapter may not weaken the contract.** `HyperFramesRenderer` obeys every rule `RemotionRenderer` does:

- the fixed 1920×1080 / 30 fps stage;
- explicit timeline / time seeking;
- no wall-clock state and no uncontrolled `requestAnimationFrame` state;
- seeded randomness only;
- no arbitrary network;
- bundled fonts and assets only (the same `assets/fonts`);
- an import / dependency allowlist with its own static validation;
- sandboxed Linux execution in the same render service and sandbox (§10.2), with the same resource limits;
- the hard timeout, the output-size cap and a fresh temp workspace;
- the same deterministic frame checks, preview/final comparison and final validation.

An animation library that cannot be deterministically seeked to an exact time is not allowed in the adapter.

**No mandatory GSAP.** The HyperFrames adapter must work without GSAP. It animates with the Web Animations API, CSS only where fully controlled and seekable, SVG/Canvas drawn directly from time, or Anime.js if its licence and technical review pass.

**Renderer selection.**

- **Today:** the harness chooses from the allowed renderers. The Director may recommend one; the harness's choice is final.
- **Routing:** after the M8 benchmark, routing may become capability-based, for example technical / tightly structured → Remotion, and high-motion / HTML-native typography → HyperFrames. None of that is hard-coded before the benchmark.
- **Production policy (after M8):** choose a DEFAULT renderer, keep the other as an approved alternative, and optionally route per teaching or visual need. Never delete either adapter.

## 9.6 Renderer benchmark (M8)

Once both adapters work, run a real benchmark. Each renderer receives the SAME:

- learner request and source context;
- MotionBrief and storyboard;
- duration and teaching mode;
- Author model/config;
- review rubric.

Only the renderer contract differs. Neither renderer may receive a different teaching brief.

**Fixtures** (at least): durations of 5 s, 10 s, 15 s, and 30 s where appropriate.

| Fixture | Mode | Exercises |
|---|---|---|
| A | `mechanism_first`: nanoGPT attention / softmax / causal masking | matrices, labels, arrows, state transitions, technical correctness |
| B | `code_walkthrough`: a selected function / module flow | code typography, highlighting, source-to-visual transitions, camera / scroll |
| C | `intuition_first`: an abstract ML concept | visual metaphor, smooth motion, character / object animation, the bridge into notation |
| D | `system_flow`: a request path through a codebase | multiple components, packets / arrows / state transitions, labels and hierarchy |

**Compared per renderer:**

- **Generation reliability:** valid composition on the first try; schema / build failures; repair rate; unsupported API / import failures.
- **Visual quality:** motion richness, polish, typography, composition, transitions, camera movement, perceived professional quality.
- **Pedagogical quality:** claim correctness, `must_show` coverage, `must_not_claim` violations, mental-model clarity, narration / visual alignment when audio is on.
- **Determinism:** repeated frame hashes, preview/final consistency, seek correctness.
- **Performance:** model generation latency, bundle / build time, cold and cached render time, memory, CPU.
- **Cost:** model tokens, render compute, repair cost.
- **Engineering:** sandbox complexity, dependency surface, debugging difficulty, artifact size, maintenance burden.

---

# 10. Render service and sandbox

## 10.1 Linux from the first real render

Rendering happens in Linux from the first real render milestone (M1). Final frame fidelity never depends on the Windows development host: Chromium and font rasterization differ between hosts, and the determinism and preview/final checks assume one environment.

The primary development machine currently has **no Docker, no WSL and no ffmpeg** (checked 2026-10-03). Motion V1 therefore cannot assume a local sandbox runtime.

**Chosen Linux runtime** (owner decision 2026-10-04): the Rabbit Hole-owned Fly development renderer `rabbit-hole-motion-renderer-dev` in the `rabbit-hole` Fly org. Developers are not required to install WSL or Docker Desktop, and GitHub Actions is not used for the primary renderer proof. `motion/linux/` (a one-shot `docker` / `unshare` proof image) stays available for anyone who has a Linux host, but it is not the M1 runtime.

## 10.2 Development render service (`rabbit-hole-motion-renderer-dev`)

The development render service lives in `packages/learn-render/motion/service/`. It is built inside M1 (owner decision 2026-10-04) and modelled on the math-renderer service. It exists ONLY to execute already-validated Motion render jobs in a restricted Linux environment:

- it makes no model calls;
- it decides no pedagogy;
- it writes no MotionBriefs or storyboards;
- it holds no Fish or provider credentials.

**Ownership.** The branch provides everything needed to deploy it; **Home owns all external infrastructure mutation** (creating the app, setting the secret, deploying). The app is DEVELOPMENT ONLY. No `small-*` resource is used or created.

| Piece | Where |
|---|---|
| HTTP service | `motion/service/server.mjs` (stdlib `node:http`) |
| Render child | `motion/service/child.mjs` |
| Sandbox launcher (root, via one sudo rule) | `motion/service/motion-sandbox`, `motion/service/sandbox-init`, `motion/service/sudoers` |
| Image | `motion/service/Dockerfile` |
| Fly config | `motion/service/fly.dev.toml` |
| Deploy context (the committed tree only) | `motion/service/context.sh`, which prints Home's commands |
| Tests | `motion/service/service.test.mjs` (any host), `motion/service/service.linux.test.mjs` (the image) |

**Secret.** `MOTION_RENDERER_TOKEN`, a dedicated development secret of at least 32 characters. The service refuses to start without it. It is not `SCENE_WORKER_TOKEN`, not a math-renderer credential and never a production credential. Home generates and sets it; it is never printed or committed. The control plane reads the same name, plus `MOTION_RENDERER_URL`, for the dev carrier (§18).

**API.**

| Route | Auth | Behaviour |
|---|---|---|
| `GET /health` | none | `{ok, service: "rabbit-hole-motion-renderer", version, sandbox, busy, limits}`. The version hashes the service, renderer, contracts and sandbox files, plus the Remotion version and the build commit. No secrets. |
| `POST /render` | Bearer | Body: a `motion-render/1` job, `{schema, renderer: "remotion", stage?, brief, storyboard, composition: {composition_id, source}}` (M6: `stage` is `preview` for a review pass, which renders only preview.mp4 and the contact sheet and returns them whatever they show, or `final`, the default and the whole job), validated by `validateRenderRequest` (`motion/contracts.js`) and then by the §8.2 static check. Unknown fields, paths, URLs and commands are rejected (400 `invalid_job`, or `malformed` for non-JSON; 413 over 512 KiB). The service chooses its own render id (32 hex). Accepted: 202 `{render_id, status: "rendering", poll}`. Busy: 429 `{error: "busy", render_id}`. |
| `GET /render/<id>` | Bearer | Status (`rendering` / `ready` / `failed` with `error` and `detail`) and metadata: duration, fps, resolution, frame count, output bytes, final validation, the determinism result, preview size, the preview/final comparison, the contact-sheet manifest, the fonts that loaded, the sandbox report, timings and renderer versions. When ready, it also returns artifact refs. |
| `GET /render/<id>/artifacts/<name>` | Bearer | `final.mp4`, `preview.mp4`, `contact-sheet.png` or `poster.png`. Only those fixed names; nothing in a URL becomes a file path. |

Rendering is asynchronous so that no HTTP request waits up to 420 s behind Fly's proxy. Callers poll `GET /render/<id>` while a render runs and fetch the artifacts promptly. Finished renders stay in memory for at most 30 minutes, and at most three are kept. This is the development transport only, not the production artifact API.

**Limits.**

- **Concurrency:** one active render; a second `POST /render` gets 429. Nothing queues.
- **Time:** a hard 420 s. The service stops the child at 420 s and reports `error: "timeout"`. The launcher's own `timeout 425s` is the backstop.
- **Output:** final ≤ 25 MB, enforced by the renderer's final validation and again by the service (`output_too_large`). Each file the child writes is capped at 64 MB (`prlimit --fsize`).
- **Workspace:** each render gets a fresh `/var/motion/jobs/<id>/` (setgid group `motion`, 2770), which is removed after success, failure or timeout.
- **Machine resources** (M1, owner requirements 2026-10-04): every job runs inside kernel-enforced limits through the `ResourceController` in `motion/service/resource-control.mjs`. `motion-sandbox` calls it (as root, with the validated render id only) before anything else starts, so every process the job starts is limited from its first instruction:
  - **memory:** 3 GiB, including the job's tmpfs, with **no swap allowance**;
  - **process count:** 1024 tasks (processes and threads), plus `RLIMIT_NPROC` 1024 for the `motion-render` user;
  - **CPU:** a 1.5-CPU quota (150000 µs per 100000 µs period) of the dev machine's 2 CPUs, so the service keeps half a CPU for `/health` and status polls. This is on top of the independent 420 s wall limit.

  The values match the 4 GB / 2-CPU `fly.dev.toml` machine; change them with the VM size. Chromium needs far more virtual address space than it uses, so `RLIMIT_AS` is not usable; memory is bounded only by the cgroup.
- **Two backends, one logical job group** (owner decision 2026-10-04: support Fly's native cgroup v1):

  ```text
  ResourceController
  ├── CgroupV2Controller   one delegated hierarchy: memory.max, memory.swap.max = 0, pids.max, cpu.max
  └── CgroupV1Controller   Fly: memory (memory.limit_in_bytes, memory.memsw.limit_in_bytes = the same value),
                           pids (pids.max), cpu,cpuacct (cpu.cfs_period_us 100000, cpu.cfs_quota_us 150000),
                           freezer when present
  ```

  - **Detection order:** a complete v2 hierarchy (memory, pids, cpu) wins. Otherwise the complete v1 set is used: memory with swap accounting (`memory.memsw.*`), pids, cpu and cpuacct. Otherwise the job fails closed.
  - **One logical job group:** on v1 the job is one group per hierarchy (`memory:/motion/<id>`, `pids:/motion/<id>`, `cpu,cpuacct:/motion/<id>`, `freezer:/motion/<id>`), all named from the same validated id. No path comes from a request.
  - **Membership:** the launcher shell joins every group before it starts `timeout`/`unshare`. The child verifies it sits in one `/motion/<id>` group in every hierarchy, and the resource probe verifies its children do too.
  - The v2 backend stays supported for hosts that delegate v2 controllers.
- **Fail closed.** The job renders nothing and reports `{error: "resource_limits_unavailable", reason, detail}` if any of these holds:
  - neither backend is complete (`controllers_missing`);
  - the memory controller cannot enforce "no extra swap" (`swap_controller_unavailable`: no `memory.memsw.limit_in_bytes` on v1, no `memory.swap.max` on v2);
  - the kernel does not keep a limit after it is written (`limits_not_applied`).

  The service reports that error. Limits are never silently dropped.
- **Cleanup settling** (fixed after the first Fly run). A process caught in the middle of its kernel exit (State Z/X) still shows in `/proc` for a moment. The controller therefore waits with bounded polls of kernel state, never blind sleeps:
  - **SIGTERM grace:** up to 2 s, until the job groups are empty;
  - **after SIGKILL:** up to 5 s, re-sending SIGKILL;
  - **settle:** up to 5 s, until the groups are empty AND the render user owns no process;
  - **group removal:** up to 5 s.

  Only something still there after the window is a leak, and that stays fail-closed (`cleanup_failed`, `/health` `ok: false`, 503). The cleanup record reports `settle_ms` and any `lingering` processes (pid, name, state).
- **Cleanup, proven, on both backends.** After the sandbox exits, the controller:
  1. detaches the launcher;
  2. freezes the job (v1 freezer / v2 `cgroup.freeze`, reported as `unavailable` when absent);
  3. sends SIGTERM to every task still in any job group, thaws, waits a short grace, and sends SIGKILL to survivors until every group is empty;
  4. removes every controller's job directory and checks it is gone;
  5. counts `motion-render` processes on the machine (must be 0).

  The PID namespace normally ends every process first; this step proves it. If anything is left, the render fails with `cleanup_failed` and no artifacts, `/health` turns `ok: false` with `degraded`, and new renders get 503 until the machine restarts.
- **After every job** `motion-sandbox` writes `out/sandbox-exit.json` (normalized, no host paths): `backend`, `controllers`, `memory_bytes`, `swap_bytes` (0), `pids_max`, `cpu_quota` (1.5), `cpu_period_us`, `cpu_quota_us`, `oom_kills`, `memory_peak`, `memory_failcnt`, the v1 `memsw_limit` / `memsw_peak`, `pids_peak`, `pids_limit_hits`, `cpu_nr_periods`, `cpu_throttled`, `cpu_throttled_time_us`, `cpu_usage_us` and `cleanup`. The service returns it as `resources`. A real kernel OOM kill becomes `error: "memory_limit_exceeded"`. `/health` reports `resource_backend` (`cgroup-v1` on Fly) and `resource_controllers` (names only).

**Identities** (fixed after the first Fly run, 2026-10-04):

- `motion-svc` (the HTTP service) and `motion-render` (generated code) have distinct uids, the SAME primary group `motion`, and no supplementary groups.
- Fly starts the service with its primary gid only. An earlier image gave `motion-svc` the shared group as a supplementary group, which Fly ignored, so `job.json` was unreadable to the render user (EACCES).
- Job directories are `motion-svc:motion` 2770 (setgid); the job input is 0640 and never world-readable. Neither process runs as root.
- **Preflight:** before the child starts, `sandbox-init` checks:
  - the directories' group and 2770 mode;
  - `job.json` is group `motion` and mode 0640;
  - `motion-render` can read `job.json` and write `out/`;
  - the service's job tree and the homes are empty to it, and service configuration (`/etc/sudoers.d/motion`) is unreadable.

  A failure is the job's result (`workspace_preflight_failed`); the child never runs.
- The shared group never widens what the child sees: the mount namespace still exposes only its own job directory.

**Isolation.** The service runs as `motion-svc`. For each job it runs `sudo -n /usr/local/sbin/motion-sandbox <render id>`, the only sudo rule. The launcher accepts nothing but the 32-hex id, builds every path itself, and runs:

```text
timeout 425s unshare --net --pid --mount --ipc --uts --fork --kill-child --mount-proc sandbox-init <id>
```

`sandbox-init` runs as root inside the new namespaces:

1. brings up loopback only;
2. makes all mounts private;
3. mounts a private tmpfs on `/tmp` and `/dev/shm`;
4. re-exposes only this job's directory, at `/tmp/job`;
5. hides `/var/motion`, `/home`, `/root` and `/.fly` behind empty mounts;
6. remounts the renderer `/app` read-only;
7. becomes `motion-render` with `setpriv`: group `motion`, no supplementary groups, no capabilities, `no_new_privs`, an empty environment (`HOME`, `TMPDIR`, `PATH`, `NODE_ENV`, `MOTION_SANDBOX` only) and `umask 007`.

The result:

- **Network:** the child, its Chromium and its ffmpeg have no route off the machine; the service keeps its normal Fly networking.
- **Processes:** the child sees only its own processes.
- **Files:** it cannot read the service's environment, token or files.
- **Cleanup:** when the launcher exits or is signalled, the PID namespace ends and every process in it dies, so there are no orphan Chromium or ffmpeg processes.

This is an OS boundary on top of the page Content Security Policy and the static validation, not a replacement for them.

**Self-check.** The render child checks its own boundary on every job (network reachable, root, the service's files visible, a writable renderer, an inherited environment) and refuses to render on any breach (`error: "sandbox_breach"`). Each result carries that report.

**The resource probe** (proof-only, `motion/service/stress-probe.mjs`) runs each stress phase in its own subprocess:

1. a PID storm, where EAGAIN at the limit is the expected evidence;
2. two busy CPU workers;
3. a 4 GiB allocation.

Before each next phase, it polls `pids.current` back to the job's baseline (plus 8 tasks of slack for Node's worker threads, within 30 s). If the task count does not recover, the probe fails explicitly instead of letting one phase starve the next.

The report includes `limits`: the backend, the job group the child is actually in (the same `/motion/<id>` in every controller), and the `memory_bytes`, `swap_bytes`, `pids_max`, `cpu_quota`, `RLIMIT_NPROC`, `RLIMIT_FSIZE` and `RLIMIT_NOFILE` values, all read from the kernel. A missing backend, split groups, any unlimited value or a non-zero swap allowance is also a breach.

**Packaging** (M1 blocker 1). The image installs exactly the committed lockfile. A lockfile written on Windows once kept only `@esbuild/win32-x64`, so Linux `npm ci` could not bundle. The fix:

- `packages/learn-render` pins `@esbuild/linux-x64` to the esbuild version `@remotion/bundler` uses (0.28.1), as an `optionalDependencies` entry, so Windows installs skip it.
- The lockfile carries its entry.
- `motion/lockfile.test.mjs` fails if that entry, or `@remotion/compositor-linux-x64-gnu` at the Remotion version, ever goes missing.

**What the service still checks.** The full M0/M1 validation runs before any render, first in the service and again in the child:

- the brief, storyboard and render-request schemas;
- the import allowlist and banned APIs;
- the fixed 1920×1080 / 30 fps stage and frame count;
- deterministic timing rules;
- bundled fonts only.

The webpack import allowlist and the page CSP still apply at render time.

**Home's deploy, from a clean commit.** `sh packages/learn-render/motion/service/context.sh` builds the context from `git archive HEAD` and prints:

```text
fly apps create rabbit-hole-motion-renderer-dev --org rabbit-hole
fly secrets set --stage MOTION_RENDERER_TOKEN=<at least 32 random characters> -a rabbit-hole-motion-renderer-dev
fly deploy <context> --config <context>/fly.dev.toml --build-arg MOTION_RENDERER_BUILD=<sha> --ha=false
```

**Design basis** (the M1 proposal this implements):

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
- blank-frame detection on the contact-sheet timestamps and the last frame, and (M5) at every beat start, start + 1, middle and end - 1, which puts boundary - 1, boundary and boundary + 1 under the check
- final keyframe hashes recorded in the job
- final vs preview: render the contact-sheet frames at final scale, downscale them to preview size, and compare with the preview frames under a pixel-difference threshold (M5 keeps mean |RGB difference| ≤ 6: four Windows authoring renders measured 1.27–2.10; the Linux values come with the Fly proof) (exact hash equality is expected between two renders at the same scale, not across scales)

If the final differs unexpectedly from the preview, **fail the job**. Do not launch another repair; repairs happen only before the final render.

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

These spend a repair (§4.8): the Author repair, and a Director revision first while the storyboard repair is unused when the finding is at the storyboard level:

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
- the render does not show the storyboard (M7A, `storyboard_fidelity`, harness-owned): an object missing from its beat's middle, a shared object vanishing at a boundary, an id rendered twice. The coverage probe judges it on the preview, so the repair round can fix it; the final keeps the same check.

## 13.2 Advisory (never repaired automatically)

- minor easing preference
- aesthetic preference
- small spacing issue that does not affect readability
- alternate but valid colour choice

## 13.3 Policy

```text
preview → fresh reviews → blocking?
    no  → final render → final validation
    yes → the Author repair → re-render preview → fresh reviews
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

Insertion is an ordinary video block, not a new Motion card system. The development carrier exists since M1 (owner decision 2026-10-04: the Motion result must never travel through the maths-animation carrier or show its copy):

```js
// motionVideoBlock({ brief, renderId, jobId }) in packages/learn-render/motion/video-block.js
insertBlock({
  type: 'video', mode: 'generate', title: brief.title, src: '', caption: '', status: 'idle',
  operation: { op: 'motion_render', render_id },            // nothing else: no source, no URL
  motion: { job_id, duration_seconds, renderer: 'remotion', teaching_mode,
            prompt_spec_version, source_refs, claim_ids },  // provenance, below
})
```

- **Control plane:** `LearnVideos` treats `motion_render` as a third provider next to maths and FAL. `MotionProvider` (`packages/control-plane/src/motion-provider.js`):
  - reads `MOTION_RENDERER_URL` (HTTPS only) and `MOTION_RENDERER_TOKEN`;
  - only GETs a finished render from the render service (§10.2), with the `submit → ticket`, `poll → null | bytes` contract;
  - lets the bytes land in `LEARN_MEDIA` like any clip.
  - `paidRefusal` and every existing limit still apply.
- **Web:** `VideoBody`'s operation copy lives in `packages/web/src/learn-video-label.js`. A Motion block reads "15s · Motion explainer · Remotion", and its button reads "Add the rendered video". Once ready, it shows that line and its sources (`model.py:62–64`, …) under the video. It never shows Manim or sigmoid copy.
- **Regression tests:** `learn-video-label.test.mjs`, `motion/video-block.test.mjs` and `packages/control-plane/test/motion-provider.test.js`.

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

The Author returns `needs_revision`; the harness spends both repairs: one Director revision and one Author call. If either is already spent, the job fails with the reason.

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
| **M1** | Remotion sandbox / render proof: the existing Remotion render path, the deterministic Linux render harness and the development render service | Authorized |
| **M2** | Shared, renderer-neutral pipeline (M2–M6): Learner Intent Resolver integration (shared slice) + Motion Director + grounded MotionBrief | Done (2026-10-04; see "M2 result") |
| **M3** | Storyboard generation + validation | Done (2026-10-04; see "M3 result") |
| **M4** | Renderer selection + Motion Author → renderer-specific composition source (Remotion first) + static validation | Done (2026-10-04; see "M4 result") |
| **M5** | Preview + contact sheet + determinism checks | Checkpoint (2026-10-04; see "M5 result"): render stage, RenderResult and checks done; no generated composition is `ready` yet (blank opening frames) |
| **M6** | Fresh visual + pedagogical review + exactly one repair round | Checkpoint (2026-10-05; see "M6 result"): both generated demos `ready` after one repair round |
| **M7A** | Remotion end to end: final render + final validation + LearnVideos / R2 + existing video-block insertion, in a development environment only | Checkpoint (2026-10-05; see "M7A result"): the pipeline, card, Stop, failure, Voice and reload are proven; no automatic run has produced a ready video yet |
| **M7B** | HyperFrames adapter (§9.5) under the same sandbox, resource limits and determinism contract, through the same pipeline | Authorized (development) |
| **M8** | Remotion vs HyperFrames benchmark (§9.6) on the same briefs and storyboards; §27 demos pass human review; choose the default routing; keep both adapters; required report (§36) | Authorized |
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

M1's Linux runtime is the development render service `rabbit-hole-motion-renderer-dev` (§10.2, owner decision 2026-10-04). The branch builds the service; Home creates and deploys it. The Linux M1 proof runs there:

- the Demo A render (1920×1080, 30 fps, 15 s, 450 frames);
- same-frame determinism in two fresh contexts;
- the isolation probe;
- the timeout kill;
- a Demo B run that proves JetBrains Mono loads deterministically;
- the resource limits: a spawn storm stops at the task limit, a 4 GiB allocation is OOM-killed and busy CPU is throttled.

Those are `motion/service/service.linux.test.mjs`, plus the existing video-block insertion and playback.

**M1 decisions (implemented in `packages/learn-render/motion/`, 2026-10-04):**

- Composition module: `export const stage = {width: 1920, height: 1080, fps: 30, durationInFrames}` as number literals, plus `export default` the component. The harness owns the Remotion root and the bundled-font loading.
- Approved imports: `react` (default, `Fragment`, `useMemo`, `useRef`, `useLayoutEffect`) and `remotion` (`AbsoluteFill`, `Sequence`, `Series`, `Freeze`, `Loop`, `Easing`, `interpolate`, `interpolateColors`, `spring`, `measureSpring`, `random`, `useCurrentFrame`, `useVideoConfig`). Not approved: the lecture `Code` primitive (unbundled system monospace fonts) and rough.js (unseeded shapes call `Math.random`).
- Fonts (owner decision 2026-10-04 adds the monospace face): Inter 400/500, Virgil, and **JetBrains Mono 2.304 Regular 400 only** for code walkthroughs.
  - JetBrains Mono comes from the official release `JetBrainsMono-2.304.zip`, with `OFL.txt` copied verbatim to `assets/fonts/JetBrainsMono-OFL.txt`. It is sha256-pinned.
  - All fonts load from the bundled woff2 through `src/motion/fonts.jsx`, and a failed face cancels the render. There is no network font loading.
  - Generic families such as `monospace` are rejected by static validation, so code never falls back to a system font.
  - Code highlights use colour, not weight.
  - The stage logs the loaded faces (`MOTION_FONTS`).
  - Demo B (`motion/fixtures/demo-b/`) and `node scripts/motion.mjs font-proof` prove the faces load and render identically in two fresh contexts.
- Development render service and the Motion video carrier: §10.2 and §18.
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

### M2 result (2026-10-04)

**Pipeline.** `resolveLearnerTurn` (§4.2) → `groundTarget` (§4.4) → `runDirector` (`packages/learn-render/motion/director.js`) → `validateBrief` + grounding rules. Only the Director uses a model. Clarification and not-found turns never call it and never produce a brief.

**Pinned source.** `packages/learn-render/motion/fixtures/sources/nanogpt-3adf61e/`: the Python files and LICENSE of karpathy/nanoGPT at `3adf61e154c3fe3fca428ad6bc3818b27a3b8291` (MIT), byte-exact (`-text`), every file checked against `MANIFEST.json` sha256 on load (`motion/fixture-source.js`).

**Grounding.** Occurrences are grouped by enclosing symbol (`Class.method`). One group: named. Several: a selected range that overlaps one wins, then the current concept when its words are a subset of the symbol's words (`attention` → `CausalSelfAttention.forward`), else one clarification naming the options. The occurrence span is the innermost branch or block (at most 30 lines). Every if/else the span sits in becomes an implementation condition (K1, ...) with both branches as source refs; registered buffers the span reads (`self.bias`) are added as definitions with their own branch condition, and the line that sets each condition flag is added as a condition ref. Every excerpt is verbatim. For `/motion 15s explain me softmax func` on the attention concept: S1 `model.py:44-45` (flash flag), S2 `48-50` (causal-mask buffer, K1), S3 `62-64` (SDPA with `is_causal=True`, K1), S4 `65-71` (mask → `F.softmax` fallback, K1); K1 = `self.flash` (model.py:62). `GPT.generate (model.py:324)` is recorded as considered and set aside.

**Director.** Role `MOTION_DIRECTOR_MODEL` (§4.9). Request: `tool_choice: {type: 'auto'}` with the single `motion_brief` tool, `thinking: {type: 'adaptive'}`, `output_config: {effort: 'high'}`, `fallbacks: 'default'` with the `server-side-fallback-2026-07-01` beta, a cache breakpoint on the fixed system prompt, `max_tokens` 16000, sent through the existing `anthropic()` chokepoint in `packages/control-plane/src/ask.js`. The model sees the LearnerTurn, the fixed duration and the evidence pack as data. It writes title, objective, audience_context, scope_note, teaching_mode, claims (cited S ids + condition ids), analogy_map, must_show, must_not_claim, semantic visual_direction, narration_policy and keyframe_times. The harness writes everything else: id, prompt_spec_version (`motion-v1.0/director-1`), raw_user_request, resolved_target, source_refs, evidence, implementation_conditions, duration, output and QA requirements, provenance.

**Validation.** Schema errors in the tool input get the one schema-only re-ask (§4.8; append-only: the assistant turn unchanged, then an `is_error` tool_result listing the errors and asking for the same intended brief), recorded in `format_retries`; a second malformed answer fails the stage. Contract and grounding errors are never re-asked: a claim citing an id the grounding did not produce, a claim resting on a branch without naming its condition, branch-dependent behavior described as unconditional ("always", "every time", ...), a code identifier that is not in the claim's cited evidence (or the evidence of a condition it names), no required claim on the target occurrence, a requested teaching mode not honored, narration that does not fit the duration, or a renderer or web technology named in title, visual_direction or must_show.

**Real calls (Claude Opus 5.5, development key, effort high).**

| Request | Result | Latency | Input / output / cache write / cache read tokens | Cost |
|---|---|---|---|---|
| `/motion 15s explain me softmax func`, concept attention | failed `invalid_brief`: the first validator rejected a branch claim naming `self.flash` and a flash-branch claim naming `F.softmax`; the evidence a claim may draw on now includes its named conditions' refs | 23.8 s | 1347 / 2424 / 2034 / 0 | $0.064 |
| same | brief, 0 format retries (`motion/fixtures/m2/softmax-15s-attention.brief.json`) | 25.2 s | 1347 / 2472 / 2059 / 0 | $0.065 |
| `/motion explain this`, concept tokenization, selection `model.py:62-71` | brief on the selection (10 s default), 0 format retries | 31.6 s | 1281 / 2983 / 0 / 2059 | $0.065 |

Costs use $4 / $20 per million input / output tokens, cache writes at 1.25× input and reads at $0.20.

**Development harness.** `node packages/learn-render/scripts/motion-brief.mjs "/motion 15s explain me softmax func" --concept attention [--select model.py:62-71] [--call]` prints the resolved intent, source refs, normalized duration, Director result and validated MotionBrief; without `--call` it stops before the model. Call records (never prompts or credentials) append to `out/motion/director-calls.jsonl`. In Git Bash set `MSYS_NO_PATHCONV=1`, or the leading `/motion` is rewritten into a Windows path.

**Known limits.** ponytail: the grounding reads Python block structure by indentation (`if`/`elif`/`else`, `def`, `class`) and only the pinned fixture sources; it does not parse other languages or follow calls across files. Concept-to-symbol disambiguation is a word-subset match; a lesson whose concept words do not appear in a symbol name asks instead of guessing.

## M3 — storyboard

Director-role call → storyboard JSON → harness validation (§5.2). Malformed or ungrounded storyboards are rejected (one format retry).

### M3 result (2026-10-04)

**Call.** `packages/learn-render/motion/storyboard.js` `runStoryboard({brief, call})` is a separate, stateless call after the brief call.
- **Role:** `MOTION_DIRECTOR_MODEL`, resolved by `model-config.js` (`claude-opus-5-5` in development).
- **Request:** the same shape as the Director call. `tool_choice: {type: 'auto'}` with the single `motion_storyboard` tool, adaptive thinking, `output_config.effort: 'high'`, refusal fallbacks, a cached system prompt, sent through `ask.js` `anthropic()`.
- **Input:** only the validated brief, minus harness bookkeeping (id, prompt_spec_version, output requirements, QA categories, provenance). It never sees grounding internals or the resolver.
- **Who writes what:** the model writes the beats; the harness writes `id`, `brief_id` and `version`.

**Validation.** `validateStoryboardOutput` checks the tool input's shape only, and that is the one thing re-asked: one schema-only re-ask (stage `storyboard`, round 0), recorded in `format_retries`; a second malformed answer fails the stage. Then `checkStoryboard` (`storyboard-check.js`) runs `validateStoryboard` plus the §5.2 semantic checks. A semantic failure returns `storyboard_invalid` with every reason and the storyboard for inspection. It is never re-asked, and M3 never spends the repair round (that is wired with the full QA loop, M6).

**Schema change.** `visible_objects[]` became `{id, description, label?, source?, change?}` (§5.2), and boundaries sit on the 0.1 s grid. Strings could not carry stable ids or object continuity. The Demo A/B fixtures were converted with the same meaning. No other field changed and no MotionBrief field is duplicated.

**Real calls (Claude Opus 5.5, effort high, 0 format retries).**

| Input | First check | Latency | Input / output / cache write / cache read tokens | Cost |
|---|---|---|---|---|
| A: softmax brief (`fixtures/m2/softmax-15s-attention.brief.json`), 15 s, mechanism_first | `storyboard_invalid` (3 text-limit errors) - all from a validator defect: glyphs (→ \| @) counted as words; valid after the fix, kept as `fixtures/m3/softmax-15s-attention.real.storyboard.json` | 68.9 s | 2938 / 7069 / 2694 / 0 | $0.167 |
| B: deictic brief (`fixtures/m2/explain-this-selection-62-71.brief.json`), 10 s | `storyboard_invalid`: a hook beat with no claim (a real §5.2 violation), plus two function words missing from the validator's list and named-flag evidence scoped too narrowly (both fixed) | 82.1 s | 3046 / 8619 / 0 / 2694 | $0.185 |
| C: Demo B request `/motion 20s show what happens here`, selection `model.py:305-330` (new brief, mechanism_first, concise narration) | `storyboard` | 72.9 s (+30.7 s Director) | 2626 / 8060 / 2709 / 0 (+985 / 2845 / 2059 / 0) | $0.185 (+$0.071) |
| B again, after the prompt says "every beat, hook included, cites a claim" | `storyboard` | 61.5 s | 3046 / 5916 / 0 / 2709 | $0.131 |

First-pass validity: 1 of 3 as measured at the time. Against the final validator: 2 of 3, with B failing only for the genuine rule, which the clarified prompt fixed on its re-run.

**Development harness.** `node packages/learn-render/scripts/motion-brief.mjs "15s explain me softmax func" --concept attention --storyboard [--call]`, or `--brief <brief.json> --storyboard [--call]`. It prints the intent, refs, duration, Director result and brief, then:
- the storyboard result and errors;
- the beat timeline with frames;
- the verified must_show coverage;
- the claim mapping and object continuity;
- the storyboard JSON, saved to `out/motion/<id>.json`.

Call records append to `out/motion/director-calls.jsonl` with their stage. The request may omit "/motion", and a Git Bash rewrite of a leading "/motion" into a Windows path is undone (`MSYS_NO_PATHCONV` is no longer needed).

**Known limits.** ponytail: the semantic checks are lexical (word stems, code names, order words, term overlap). A misconception paraphrased in words the brief also uses, or a visual implication described in new words, is left to the M6 reviewers.

### Grounding hardening before M4 (2026-10-04)

M3 surfaced two M2 grounding gaps on the Demo B selection. Both are fixed in `packages/control-plane/src/source-grounding.js`; the M3 architecture and semantics are unchanged.

**Every if statement is a structural condition.** A selected or occurrence span is split wherever its set of enclosing branches changes, so each ref names exactly the conditions its lines run under:
- if/else: one condition, both sides;
- if without else: the body carries the condition, and the other side is `no_op`, with empty `source_ref_ids` and `runs: "nothing: <path:lines> is skipped (no else branch)"`; no source line is invented;
- nested ifs: the inner body carries both conditions;
- sequential ifs: each carries its own;
- `if not x`: the body runs on the false side of `x`.

Each branch now records the refs that run on it (`branches[].source_ref_ids`, §5.1; optional in the contract, always written by grounding), so "this code runs only when the condition holds" is machine-visible to the Director checks, the storyboard checks and the future Author. The storyboard checks read the branch refs from these fields (older briefs fall back to the `runs` text) and read a condition's names from its expression (`top_k is not None` → `top_k`). An `else` that belongs to `for`, `while` or `try` is no longer paired with an earlier `if`.

**Decorators resolve to the decorated symbol.** A range starting on a decorator, including stacked ones and ones with multi-line arguments, or on a def/class header, resolves to that symbol; the exact selected range and evidence are kept. Examples: `@torch.no_grad()` at model.py:305 → `GPT.generate`, `@classmethod` → `GPT.from_pretrained`, `@dataclass` → `GPTConfig`, train.py:215 → `estimate_loss`. Named occurrences on a header line now group with their function's body.

**Demo B (`model.py:305-330`).**
- Before: one ref S1 305-330, no conditions, labelled `GPT`.
- After: S1 305-319, S2 320-322 [K1], S3 323-330, with K1 = `top_k is not None` (true: S2; false: no_op), labelled `GPT.generate`.
- One real Director call (28.6 s; 1289 / 2583 / 2059 / 0 tokens; $0.067; 0 retries) taught the top-k step as K1's true side and said it is skipped when `top_k` is None. That brief is kept at `fixtures/m3/generate-20s-selection.brief.json`.

**Still not conditions** (ponytail, statement-level indentation reading):
- inline `a if c else b` expressions, such as the crop at model.py:314 and `dropout_p=self.dropout if self.training else 0` at :64;
- one-line `if x: y`;
- multi-line `if` headers;
- the earlier tests an `elif` implies.

## M4 — Author

Author call → composition source or `needs_revision` → static validation (§8.2).

### M4 result (2026-10-04)

**Stage.** `packages/learn-render/motion/author.js` `runAuthor({brief, storyboard, call})` runs under role `MOTION_AUTHOR_MODEL` (`model-config.js`, `claude-opus-5-5` in development).
- **Input:** the brief's contract fields (title, objective, scope_note, teaching_mode, duration, claims, conditions, must_show, must_not_claim, visual_direction, narration_policy), the storyboard beats, the evidence of refs that claims, conditions or storyboard code objects cite, and the renderer facts to copy (stage, timeline frames, required text). It never sees the learner's request, audience or grounding internals.
- **Request:** `tool_choice: {type: 'auto'}` with the single `motion_composition` tool, adaptive thinking, `output_config.effort: 'high'`, refusal fallbacks, a cached system prompt, `max_tokens` 64000, streamed. `motion/stream-message.js` rebuilds the message, including thinking signatures for an append-only re-ask, because a generation can run for minutes. Calls go through `ask.js` `anthropic()`.
- **Outcomes:**
  - `composition`: passes static safety and the Author contract;
  - `needs_revision`: its refs exist;
  - `author_invalid`: source, contract or ref errors, surfaced and never re-asked or repaired in M4;
  - `failed`: malformed twice (one schema-only re-ask, and a `max_tokens` stop counts as malformed), refused, or a model error.

**Raw source is evidence, not a reasoning surface.** Author-added text uses only the contract's words: claims, must_show, objective, visual direction, conditions and storyboard text. Raw code is shown verbatim and never paraphrased into a new condition or claim, so the deferred grounding forms (below) cannot leak into teaching through the Author.

**Static validation.** `static-check.js` (M1 safety) is unchanged and runs on every composition. `author-check.js` adds the contract:
- the exact `timeline`;
- `TEXT` with the storyboard text and source lines verbatim;
- learner text only via `{TEXT.key}` and no prose outside `TEXT`;
- Author text that is short, in the contract vocabulary, naming only evidenced code and never "always";
- one literal per storyboard object id.

**Compile and frame probe** (`motion/author-proof.mjs`, local/dev). The composition is compiled through the M1 Remotion path, whose bundler import allowlist still stops a disallowed module. Then one still per beat middle is rendered with the harness probe (`src/motion/probe.jsx`, enabled only by the `probe` input prop, drawing nothing). At each beat middle it checks:
- every storyboard object is visible and the only element carrying its id;
- labels and source lines show inside their objects;
- the on_screen_text is visible;
- a conditional beat shows its condition (flag or branch word);
- all text uses a bundled font, with code in JetBrains Mono;
- every visible word comes from `TEXT`.

**Real calls (Claude Opus 5.5, effort high).**

| Input | Result | Latency | Input / output / cache write / cache read tokens | Cost |
|---|---|---|---|---|
| A: softmax brief + real M3 storyboard (5 beats, 15 s) | 1st call hit `max_tokens` 32000 (mostly thinking), which used the one schema-only re-ask; the re-ask returned a `composition` that passes static + contract, compiles (bundle 9-10 s) and probes clean at 5/5 beats | 305 s + 67 s | 5552 / 32000 / 1909 / 0, then 32182 / 10010 / 0 / 1909 | $0.67 + $0.33 |
| B: Demo B brief + storyboard (7 beats, 20 s) | `author_invalid` under the first contract (chips set `data-object={spec.id}` from a spec array); valid under the corrected contract (id literal once at the use site, one live element per id checked by the probe); compiles (bundle 19 s) and probes clean at 7/7 beats; top-k gate shows `top_k is not None` with the true path (`-Inf`) and the no-op false path ("unchanged") | 486 s | 8554 / 48619 / 0 / 1909 | $1.01 |
| needs_revision fixture (a photograph of a paper figure required in B6) | `needs_revision`: stage brief, refs B6/C4/K1, three concrete requested changes, no invented content | 9.9 s | 4742 / 862 / 1909 / 0 | $0.05 |

`max_tokens` is now 64000. The real outputs are kept as fixtures: `fixtures/m4/*.real.composition.jsx` and `needs-revision.real.author.json`. Tests check them by contract, safety and compilation, never byte for byte. They came from the prompt before two clarifications that match the corrected contract: id literals at the use site, and Author words from the contract rather than raw code.

**Demo B storyboard.** Two real storyboard calls on the hardened Demo B brief were both `storyboard_invalid`:
- 135.8 s, $0.29: after the validator fixes below, one genuine error ("smaller" in a narration line).
- 104.4 s, $0.22: one genuine error (B7 changes a label to name `max_new_tokens` while citing only C6).

The fixture `fixtures/m4/generate-20s-selection.storyboard.json` is the second output with one hand edit, `B7.claim_ids += C1`, standing in for the M6 Director revision. Nothing else was changed.

**M3 validator fixes found by M4** (tested; no rule loosened):
- `sentences()` treated the dot in `F.softmax` or `torch.cat` as a sentence end. A sentence now ends at . ! ? before a space or the end.
- A label carried unchanged from the previous beat was re-checked against the next beat's claims. It is now checked where it is introduced or changed, as the reading-pace rule already counted it. A new or changed label is checked as before.

**Known limitations.**
- ponytail: the Author contract's text rules are lexical. A one-word string passed through a prop, or text built at run time, is visible only to the frame probe, which checks words, not meaning.
- The probe samples beat middles only, not transitions; visual quality is not reviewed (M6).
- Grounding still does not represent:
  - inline `a if c else b` expressions;
  - one-line `if x: y`;
  - multi-line `if` headers;
  - full `elif` semantics.

  These are deferred by owner decision (2026-10-04) and are not M4 blockers. The Author cannot promote them into teaching (above).

## M5 — preview and determinism

Preview render, contact sheet, determinism hashes, preview/final comparison threshold.

### M5 result (2026-10-04)

**Render stage.** `packages/learn-render/motion/render-job.mjs` `renderComposition({brief, storyboard, author, service, dir, origin})`:
1. Only an Author `composition` is submitted. `needs_revision`, `author_invalid` and `failed` never reach the renderer (zero service calls, tested).
2. Before submission it applies the service's own gate (`validateRenderRequest`, `static-check.js`) plus the Author contract (`author-check.js`). A refused source is `{submitted: false, reason: 'invalid_job'}`.
3. It submits the unchanged `motion-render/1` request to the M1 service (`motion/service`), polls, and fetches the four artifacts.
4. It validates them again on this side: final.mp4 through the M1 validator; preview.mp4 at its scale; the poster as the determinism check's last frame; the contact sheet as one tile per contact frame.
5. It judges beat and transition coverage from the child's probe observations, and recomputes decoded-pixel determinism.

The service record is input, never the verdict. `motion/service` remains the only place generated code runs.

**RenderResult** (`contracts.js` `validateRenderResult`, schema `motion-render-result/1`):
- `status`: `ready` | `render_failed` | `artifact_invalid`.
- `render_id` (null when refused before rendering), `composition_id`.
- `renderer`: {name, service_version, remotion, chrome, ffmpeg, sandbox}.
- `duration_seconds`, `fps`, `width`, `height`.
- `artifacts` {final_mp4, preview_mp4, poster, contact_sheet}, with `hashes` (sha256 of the received bytes).
- `validation` {ok, final, artifacts, coverage, determinism, preview_final}.
- `resources`: the child's sandbox report and the kernel limits and usage.
- `timings`: the service's, plus submit-to-finish, download and client validation.
- `provenance`: motion_job_id, prompt_spec_version, canonical-JSON sha256 of the brief and the storyboard, composition sha256, source bytes and characters, `storyboard_origin`, `composition_origin`, font pins.
- `failure` {category, detail, errors} whenever the status is not `ready`.

`ready` requires all four artifacts and every validation part, at 1920x1080 and 30 fps. No learner input, model ID or credential is allowed (validator-enforced).

**Failure mapping.**
- **`render_failed`:**
  - refused before rendering: `invalid_job`, `busy`, `degraded`, `unauthorized`, `too_large`;
  - `compile_failed`: the module did not bundle or load;
  - `runtime_error`: a frame threw;
  - `timeout`: the service's 420 s, or the caller's polling deadline;
  - the sandbox categories, passed through.
- **`artifact_invalid`:**
  - the service refused its own output: `final_validation_failed`, `nondeterministic`, `preview_final_mismatch`, `output_too_large`. Its artifacts are withheld, and its observations are still judged;
  - the caller found a problem: `artifact_missing`, `final_invalid`, `preview_invalid`, `poster_invalid`, `contact_sheet_invalid`, `coverage_failed`, `nondeterministic`, `preview_final_mismatch`.

**Coverage** (`motion/render-coverage.js`). The sampled frames are each beat's start, start + 1, middle and end - 1, so boundary - 1, boundary and boundary + 1 are covered. At each kind of frame:
- **Beat middle:** the M4 probe rules.
- **Around a boundary:** an object in both beats stays visible; an object leaving or arriving may fade.
- **Every frame:** it rendered, and one element carries each id.

Blank frames are judged on the decoded final video at all of these frames.

**Service change (Home redeploys the M5 checkpoint).** The request schema is unchanged, but the result is not:
- `child.mjs`:
  - reports `compile_failed` and `runtime_error`;
  - renders the determinism frames at every contact-sheet timestamp plus the middle frame;
  - runs the harness probe at every coverage frame and returns the observations as `coverage` (text kept at beat middles only).
- `remotion-renderer.mjs` `validateFinal` decodes the coverage frames too.
- `server.mjs` passes `coverage` through.

**Contract changes M5 found.**
- The Author contract never carried the M1 rule that the first and last frames are not blank. All three Author-contract compositions on hand open on a blank or near-blank frame: both M4 outputs and my hand-written M4 reference. Two fixes:
  - The Author prompt now states the rule. Its first wording, "start placed or partly visible", invited a dim entrance; it now says full opacity.
  - The local Author proof (`author-proof.mjs`) also checks frames 0 and last.
- `console` is banned in compositions: the probe's lines are the coverage evidence.
- The model-ID leak pattern needs a version after `gpt-`. The real composition id `gpt-generate-one-pass` (nanoGPT's GPT.generate) was a false positive.
- The hand-written reference no longer fades its first or last frame.

**Renders** (Windows authoring host, the service in process with the unsandboxed child; Linux acceptance is Home's Fly proof).

| Input | Result | Coverage | Determinism (2 fresh contexts) | Preview vs final (≤ 6) | Bundle / preview / final / service total |
|---|---|---|---|---|---|
| Softmax, M5 regeneration (real M3 storyboard) | `artifact_invalid` (final_validation_failed: blank #0:1.28 #1:1.28) | 20/20 clean | 13 frames identical | 2.104 | 7.13 s / 6.89 s / 25.74 s / 114.01 s |
| Softmax, M4 Author output | `artifact_invalid` (final_validation_failed: blank #0:0 #1:0) | 20/20 clean | 13 frames identical | 1.931 | 16.86 s / 9.66 s / 28.06 s / 138.81 s |
| Demo B, M4 Author output (storyboard `fixture_with_manual_semantic_fix`) | `artifact_invalid` (final_validation_failed: blank #0:0) | 28/28 clean | 16 frames identical | 1.363 | 18 s / 11.93 s / 28.85 s / 141.21 s |
| Hand-written control (never acceptance evidence) | `ready` | 24/24 clean | 16 frames identical | 1.272 | 9 s / 7.15 s / 14.62 s / 88.63 s |

Each generated composition renders and passes every check except the unchanged M1 nonblank check on its opening frames. A blank frame is luma stddev ≤ 2.
- The M4 outputs fade in from an empty stage (luma 0).
- The M5 regeneration opens with one code line at 30% opacity (luma 1.28; it first passes at frame 10).

The Demo B render uses the hand-corrected M3 storyboard and is recorded as such. It is renderer and Author execution proof, not proof that the Director/storyboard pipeline is reliable. It stays recorded as `fixture_with_manual_semantic_fix` (owner decision at M5 acceptance): automatic storyboard reliability is not proven yet.

**Real call.** One Author call, the one M5 authorized for a concrete contract defect: softmax under the corrected prompt. It took 406 s and produced 40,011 output tokens, at $0.83; the request was capped at one with no re-ask. It returned a contract-valid `composition` that still opens near-blank, as above. No further calls were made.

**Telemetry for M8** (`out/motion/render-telemetry.jsonl` per render) covers Author calls, output tokens, latency and cost, source bytes and characters, compile time, render time and the end-to-end time.

**Known limitations.**
- No generated composition is `ready` yet. That needs the owner to authorize Author regeneration under the tightened rule (softmax and Demo B), or a decision on the opening-frame rule.
- M6 should run the nonblank check on the preview render, so a blank opening spends the repair round instead of failing at final validation (§11.3 fails the job there with no repair).
- ponytail: a composition that reaches the global object could still forge probe lines. `console` is banned statically and a second line for a frame fails coverage, but the pixels (nonblank, M6 review) stay the backstop.
- Windows timings and hashes are authoring evidence only (§10.3). The service totals here are 89–141 s. Fly, with its 1.5 CPU quota, took 122 s for M1's Demo A. M5 adds 13–16 determinism frames per context and 20–28 probe stills, so a 20 s composition may approach the 420 s limit there; Home's proof measures it.

## M6 — review and repair

Fresh visual and pedagogical reviewers; harness classification (§13); one repair round.

### M6 result (2026-10-05)

Owner decisions at M5 acceptance: keep the blank-opening rule unchanged, make no raw Author retries, run the check on the preview so the repair round fixes it, and keep Demo B recorded as `fixture_with_manual_semantic_fix`.

**The loop** (`motion/review-job.mjs` `runMotionJob`, §4.8 steps 5-9). For each pass:
1. **Preview** (`render-job.mjs` `renderPreview`). The render gate is the same as the final's. The service runs a **preview job** (`motion-render/1` with `stage: "preview"`): `child.mjs` renders only preview.mp4 and the contact sheet and returns them whatever they show. This side validates both files.
2. **Blank check on the preview.** The preview is decoded at every frame the final is checked for blankness (`render-coverage.js` `nonblankFrames`): 0, 1, each beat's start, start + 1, middle and end - 1, and the last frame. It applies the unchanged M1 rule, luma stddev > 2 (`NONBLANK_MIN_LUMA_STDDEV`, shared with `validateFinal`). No threshold changed.
3. **Harness findings** (reviewer `harness`): `blank_frame` for any blank or near-blank sampled frame, `renderer_failure` for a refused or failed render, `corrupt_output` for a broken preview. All three are §13.1 blocking.
4. **Fresh reviewers** (`motion/review.js`), in parallel, each a new call:
   - The visual reviewer sees the brief (no claims or evidence) and the contact frames decoded from the preview, labelled with frame, time and beat. Categories: `blank_frame`, `clipped_text`, `overlapping_text` and the four advisory ones.
   - The pedagogical reviewer also sees the claims, conditions, must_not_claim and the cited source evidence. Categories: the six §13.1 content categories.
   - Neither sees the composition source, the Author's notes, the storyboard text or any earlier finding (tested).
   - Each pass gets one schema-only re-ask.
5. **Classification** by category (`classifyFindings`, `afterReview`):
   - Clean: the final render (M5 `renderComposition`, unchanged).
   - Blocking with the round unused: the ONE repair round.
   - Blocking after the repair: the job fails with its diagnostics, with no final render and no further call.

**The repair round** (`startRepair`, `repair_count` 1).
- **Storyboard-level findings** (`unsupported_claim`, `must_not_claim_violation`, `required_claim_contradicted`, `wrong_source_branch`, `missing_must_show`, `narration_contradicts_visuals`) take one Director revision first: `runStoryboard` with the storyboard and the findings. The revision is checked by `checkStoryboard` and keeps its id with the next version.
- **Everything else** goes to the Author alone.
- **The Author call** (`runAuthor` round 1) gets the original request plus a REPAIR ROUND section: the blocking findings, the previous source, and the four owner-required rules (`author.js` `REPAIR_RULES`):
  - frame 0 is visibly nonblank;
  - the first beat begins at useful visible opacity;
  - no fade-in leaves the first sampled frames blank or near-blank;
  - the final frame stays nonblank.
- **needs_revision:** an Author `needs_revision` consumes the round (Director revision, then Author). One from the repair call fails the job.
- **Format re-asks** are recorded per stage and round in `format_retries`. None happened in the real runs.

**Contract changes.**
- `validateRenderRequest` accepts `stage` (`preview` | `final`, default `final`). Every M1-M5 request is unchanged.
- `ReviewFinding` gains reviewer `harness` and `round`.
- Two new role defaults: `MOTION_VISUAL_REVIEW_MODEL` and `MOTION_PEDAGOGICAL_REVIEW_MODEL`, both `claude-opus-5-5` (§4.9).
- The MotionJob (`validateJob`) is the job record: owner `development / motion-v1-harness` until M7 scopes jobs, and `final_ref` is a job-directory file until M7 stores it.

**Service change.**
- `child.mjs` has the preview job.
- `server.mjs` records the stage and requires preview.mp4 (not final.mp4) for a ready preview job.
- `remotion-renderer.mjs` shares `decodeFrames` and the nonblank check.
- Service version `motion-renderer-1-a86e713ce9d6/remotion@4.0.521`; Home redeploys this checkpoint, which supersedes the M5 redeploy.
- `service.linux.test.mjs` gains a sandboxed preview-job test.
- **Fly build context fix (2026-10-05).** The first M6 Fly build could not boot: since M2, `motion/duration.js` imports the shared duration parser `packages/control-plane/src/request-duration.js` (one parser with the Learner Intent Resolver), and neither `context.sh`'s archive nor the image carried it. `context.sh` now archives the service's shared files from their own package (`SHARED`), and the Dockerfile copies each with its package.json (`"type": "module"`); nothing is vendored. `deploy-config.test.mjs` builds the same archive from the working tree (`context.sh --paths`), lays out `/app` from the Dockerfile's COPY lines, starts the render child and boots the service there, and checks every relative import resolves. It failed first on the old context with `ERR_MODULE_NOT_FOUND` for `request-duration.js`.
- Home's Fly proof needs no model call: `service.linux.test.mjs`; `node scripts/motion-render.mjs softmax-m6|generate-m6 --service <url>` renders the recorded repaired compositions (`motion/fixtures/m5/inputs.json`); `node scripts/motion-review.mjs softmax --service <url>` without `--call` runs the preview stage and its harness findings.

**Real runs** (2026-10-04/05, local service on the Windows authoring host, unsandboxed child). The round-0 inputs are the saved Author outputs from M5: the softmax M5 regeneration, and Demo B's M4 output on the hand-corrected storyboard. No raw Author retry; the only Author calls were the two repair calls.

| Input | Round 0 blocking | Repair | Round 1 | Final | Model cost |
|---|---|---|---|---|---|
| Softmax (real M3 storyboard) | harness `blank_frame`; preview #0 luma 1.34 | one Author call: 77 s, 11350 output tokens, $0.3026 | 0 blocking (1 advisory); preview #0 luma 14.5 | `ready`: coverage 20/20, 13 determinism frames identical, preview vs final 2.104 | $0.53 |
| Demo B (storyboard `fixture_with_manual_semantic_fix`) | harness `blank_frame` + visual `overlapping_text`; preview #0 luma 0 | one Author call: 100 s, 14221 output tokens, $0.3793 | 0 blocking (2 advisory); preview #0 luma 16.66 | `ready`: coverage 28/28, 16 determinism frames identical, preview vs final 1.367 | $0.66 |

Observations:
- **Softmax:** the repair changed only B1's entrance (about 30 lines): its code lines slide in at full opacity instead of fading up from 30%. Determinism frames #165 to #449 keep their M5 hashes; #0, #60 and #120 (B1 and its boundary into B2) changed.
- **Demo B:** one round fixed both the blank opening and the overlapping `-Inf` labels the visual reviewer found. Against M5, only #0 and #45 (the opening) and #240 to #390 (the `-Inf` labels, B3 to B5) changed; the other determinism frames keep their hashes.
- **Visual reviewer on the blank opening:** it reported the softmax opening as advisory (`easing_preference`: "starts almost empty"). The harness check is what made it blocking, which is why the rule is a harness check and not left to reviewer judgement.
- **Pedagogical reviewers:** no findings on either demo in either pass.
- **Advisory findings left:** small weight labels (softmax B5), stray branch dots and small `-Inf` labels (Demo B). Advisory findings are recorded and never repaired.

Demo B stays `fixture_with_manual_semantic_fix` in every RenderResult. Its `ready` proves the review and repair loop and the render, not automatic storyboard reliability. Records: `motion/fixtures/m6/{softmax,generate}.review-job.json` and the repaired sources. Telemetry: `out/motion/review-telemetry.jsonl`.

**Known limitations.**
- Whether a finding blocks follows the reviewer's chosen category. A reviewer that files a material defect as advisory lets it through. The blank rule is therefore harness-owned; other visual rules are not.
- ponytail: the brief is never revised. A brief-level defect goes through a storyboard revision that cannot fix it, and fails at the second review.
- Reviewers see stills, not motion, so jitter and timing are judged only from neighbouring frames.
- Windows renders are authoring evidence (§10.3). Linux acceptance is Home's Fly proof after the redeploy.

## M7A — Remotion end to end (development only)

Final render, final validation, `LEARN_MEDIA` storage and `insertBlock({type: 'video', …})` in a development environment. The Motion provider and the `motion_render` carrier already exist since M1 (§18); M7 connects them to the orchestrated pipeline. Narration may be enabled here only after silent runs pass.

### M7A result (2026-10-05)

**Where it runs (the §18 M7 decision).** A development-only Node orchestrator. The LearnVideos Durable Object stays a poller, and the Worker never holds a model key.
- `scripts/motion-orchestrator.mjs` and `motion/orchestrator.mjs` run on the local Motion stack:
  - HTTPS on 8856, bearer token;
  - one job at a time, and none while the render service is busy;
  - a per-job call cap and an owner spend ceiling (`--budget-usd`);
  - Stop abandons a call in flight;
  - `--stub <mp4>` runs the same routes with no model call and no render.

**The request** (`motion/pipeline.mjs` `runMotionRequest`):
1. A raw `/motion` line goes through the Learner Intent Resolver and grounding. An unresolved target asks one clarification before any paid call.
2. The Director writes the MotionBrief, then the storyboard, then the Author writes the composition.
3. The M6 review job runs: preview, harness checks, fresh reviewers, at most one repair, final render and validation.
4. The finished render becomes the existing `type: "video"` block.

Repairs are per stage (owner decision 2026-10-05, below): a storyboard that fails its checks spends the storyboard's repair on one Director revision, and the Author keeps its own. Every stage's artifact is kept in the job directory.

**Product path, unchanged where it existed:**
- **Dev-only command:** `/motion` exists only in a `VITE_MOTION_DEV=true` build. Without an orchestrator configured, LearnVideos refuses it. No checked-in Worker config sets `MOTION_ORCHESTRATOR_*` or `VITE_MOTION_DEV` (tested).
- **Proposal:** the paid proposal comes back with no request made. Generate inserts the existing video card already confirmed (`operation: {op: "motion_request", request, location: {concept}}`); the canvas title is the concept.
- **LearnVideos** starts the job with the existing paid gate and de-duplication, polls it, stores the validated final MP4 in `LEARN_MEDIA` and serves it from the same card. The card takes the brief's title and provenance: duration, Remotion, sources.
- **Stop** (new): a cancel action stops providers that can stop. It is free, needs no confirmation, and leaves a retryable "Stopped." card.
- **Fixed:** the card's poll wrote a stale copy back (with `confirmedStart`) and could restart the job; `useConfirmedStart` now starts once per card.

**Harness additions found by the real runs.** None relaxes a check or adds a repair round.
- The preview job also runs the coverage probe. A render that does not show the storyboard is a blocking harness finding (`storyboard_fidelity`, §13.1), found while the repair round can fix it.
- The Author contract states that a leaving object fades after its beat's middle.
- A response that breaks off mid-stream fails its stage and is never retried.
- The storyboard system prompt is in sections (owner decision):
  - `<role>`, `<objective>`, `<non_negotiable_rules>`, `<validation_rules>`, `<examples>`, `<output_contract>`;
  - `<validation_rules>` states the checks the first storyboards broke, with the checker's own numbers;
  - `<examples>` holds four worked examples: attention order, a generation loop, an MLP mechanism and a conditional branch. They demonstrate the rules and never add requirements.
- Regressions cover three domains (softmax/attention, GPT.generate, an MLP forward pass): one system prompt, no brief fact in it, the same checks. The recorded failed storyboards are fixtures the unchanged checks still reject.

**Browser proof** (`scripts/motion-e2e.mjs`, local stack, stub orchestrator):
- `stop`: proposal → Generate → placeholder → Stop → "Stopped." with Retry → Retry → video in the same card.
- `failure`: the reason on the card, Retry, no video.
- `full`:
  - the same card plays a 15 s 1920x1080 video served from `LEARN_MEDIA`, with title, meta and sources;
  - reload keeps it with no restart;
  - Voice Mode on the Tutor board removes the typing field (so no `/motion` by voice) while the card plays;
  - one start per Generate, and two Generates of the same request share one render job;
  - no model call for the proposal, no Rabbit Hole created or entered.

**Automatic runs of `/motion 15s explain me softmax func`** (real orchestrator, local render service on the Windows authoring host):

| Run | First storyboard | Author | Preview checks and fresh reviews | Recorded cost |
|---|---|---|---|---|
| 1 | failed its checks (2 errors, not kept then); repair spent on a revision | composition | 0 blocking at preview; final validation failed coverage (2 objects missing at their beat middles) | $1.01 |
| 2 | failed: one side of K1 not taught; repair spent | the stream broke off (crashed the pipeline then; fixed) | — | $0.37 + a cut-off call |
| 3 | failed: a word outside the brief vocabulary, 16 new words in a 2 s beat, a must_show item not covered; repair spent | composition | blocking: `storyboard_fidelity` (a shared object vanishing at a boundary) and `overlapping_text` | $1.13 |
| A | failed: the lexical order check misread a correct sentence; repair spent | composition | blocking: `overlapping_text` (the chart over the matrix) and `narration_contradicts_visuals` (a masked cell drawn as a bar) | $1.11 |
| B | **passed first time** | the stream broke off after 122 s (failed cleanly, not retried) | — | $0.26 + a cut-off call |

Runs A and B were the two the owner authorized, under a $2.50 ceiling. The ceiling counted $2.06: $1.36 recorded plus run B's cut-off Author call at its $0.70 estimate. Both failed, so no further runs were made.

**Failure distribution:**
- **First-pass storyboard:** failed its checks in 4 of 5 runs, and each failure spent the job's only repair round. Run B, the first with all five validation rules, passed.
- **Author response:** the stream broke off in 2 of 5 runs.
- **Author drafts that reached review:** 3 of 3 had at least one blocking defect. All three opened nonblank first time.
- **Validator:** one false positive. "Softmax runs after mask, before dropout." is correct, but the lexical order check reads it as dropout before softmax.

**Owner decisions after these runs (2026-10-05), implemented with no further paid run.**
- **Repair budget:** one semantic repair per artifact stage (storyboard, Author/preview), at most two per job, no loops (§4.8).
- **Author transport retry:** every call is classified by how it ended, and a broken transport is retried once (§4.8).
- **Order check precision** (owner-authorized):
  - each order word relates the nearest step on each side within its sentence, so "Softmax runs after mask, before dropout." states mask, softmax, dropout and passes;
  - genuinely reversed orders still fail;
  - an underscore starts a step word (`c_proj` names `proj`);
  - positive and negative cases in three domains.
- **No topic word lists in the checker.** The global `OP_STOP` (`attn`, `torch`, `functional`, …) is gone. A step's identifying words come from the brief's own evidence:
  - minus generic English;
  - minus language-level code words (Python builtins and the array/container API every framework shares);
  - minus any word two calls of one excerpt share.
- **Prompt:** the storyboard rule 5 states the relation reading, not a phrasing workaround. The Director asks how the viewer's visual focus should move, never "attention".
- **Model transport for the paid proof (owner decision 2026-10-06).** The API account ran out of credit on the first call ($0 spent), so the owner chose the Claude subscription. `motion-orchestrator.mjs --subscription` sends every role through the owner's Claude subscription (the native Claude Code CLI, `scripts/learn-subscription-bridge.mjs`, in process):
  - it reads no API key and never falls back to the API;
  - the CLI's `opus` alias serves each role, recorded as `served_model: subscription/opus`;
  - API cost is $0, and the budget ceiling charges nothing for a subscription answer;
  - outcomes map onto the same end kinds: a CLI deadline is `gateway_timeout` (the Author may resend once), an answer outside the JSON/tool contract takes the schema-only re-ask, and anything else is `provider_error`;
  - the bridge now passes rendered frames as real image blocks and block system prompts as text. The Learn defaults are unchanged.

**Known limitations.**
- No automatic run has produced a ready video yet; the next paid runs need an owner GO.
- Windows renders are authoring evidence (§10.3).

## M7B — HyperFrames adapter (development only)

`HyperFramesRenderer` behind the same `MotionRenderer` interface (§9.4–§9.5), its own Author contract and static validation, the same render service sandbox and resource limits, and the same determinism, preview/final and final-validation checks. GSAP is not required. Start it immediately after M7A.

## M8 — benchmark and end-to-end development demonstration

Run the §9.6 benchmark on the same briefs and storyboards for both renderers, then pass all §27 demos through the full pipeline with human review. Choose the default renderer and routing from the results; keep both adapters. Deliver the required report.

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

**Hard release gate:** M9 / public production `/motion` MUST NOT launch until Remotion's commercial licensing requirements have been reviewed and satisfied (§34). This is a release gate, not a code problem; nothing in the code tries to solve licensing.

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
17. At most one repair per stage occurs (storyboard, Author), two at most.
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
- one repair per stage (storyboard, Author), two maximum; `needs_revision` spends both
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
- `rabbit-hole-motion-renderer-dev` (§10.2) is the approved development render service (owner decision 2026-10-04). Home creates the app in the `rabbit-hole` Fly org, sets `MOTION_RENDERER_TOKEN` and deploys it; nothing on the Motion branch mutates infrastructure.

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
- more renderers than Remotion and HyperFrames (no Three.js, Manim or Blender adapters)
- a new MotionArtifact store or a special Motion card system
- iterative repair loops beyond one repair per stage

Get the Remotion baseline and one workflow reliable first, then HyperFrames; nothing else.

---

# 34. Production-release checklist (release / legal)

These are owner/legal review items. None of them blocks the M0–M8 development harness:

- **Remotion licence: HARD RELEASE GATE** (owner decision 2026-10-04). M9 / public production `/motion` MUST NOT launch until Remotion's commercial licensing requirements have been reviewed and satisfied. Today Remotion is free for individuals, non-profits and for-profit organizations with up to 3 employees; larger for-profit organizations need a company licence. Licensing is not solved in code.
- **GSAP licence.** Free under GSAP's standard "no charge" licence, which prohibits use in tools that let users build animations without code in competition with Webflow's visual animation features. Not used in V1 (§9.2); review before any Motion use.
- **HyperFrames licence.** Apache-2.0; review the exact release used at M7B, including any bundled animation library (Anime.js is MIT, but it still needs licence and technical review before use).
- **Fish Audio** terms for generated narration in distributed videos, when narration ships.
- **nanoGPT** (MIT) excerpts shown in videos keep their attribution in provenance.
- **JetBrains Mono** (SIL OFL 1.1) is bundled unmodified with its licence file, `assets/fonts/JetBrainsMono-OFL.txt` ("Copyright 2020 The JetBrains Mono Project Authors"). Redistributing it inside the renderer is allowed; the font is not sold on its own.

---

# 35. References / inspiration corpus

Use these for design research and prompt inspiration, not as runtime dependencies.

- Addy Osmani motion explainer / browser walkthrough post supplied by the product owner
- `awesome-opus5-5-videos`
- YouMind Opus 5.5 prompt examples
- Jason Zhu Opus 5.5 prompt/video library
- educational Canvas explainer workflows shared by Claude users
- HyperFrames (the priority second renderer, §9.5)
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

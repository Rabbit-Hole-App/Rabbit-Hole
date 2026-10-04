# Rabbit Hole `/motion` V1 — Motion Explainer Harness Specification

**Audience:** Parallel / Rabbit Hole engineering agents  
**Status:** Implementation specification for an isolated V1 harness. Do not deploy to production until the acceptance gates in this document pass and a separate production GO is given.  
**Primary goal:** Turn a short learner request such as `/motion explain me softmax func` into a source-grounded, deterministic, 5–30 second technical motion explainer that is actually useful for learning.

---

## 0. Executive summary

Rabbit Hole should treat `/motion` as a **teaching primitive**, not as a generic text-to-video feature.

The user may type something very small:

```text
/motion explain me softmax func
```

That prompt is **not sufficient** to send directly to the animation agent.

Rabbit Hole must first resolve what the learner means, gather source-grounded context, decide the learning objective and pedagogical treatment, identify what the video must and must not claim, choose a duration and renderer, and construct a much richer internal motion brief.

The core production pattern is:

```text
raw learner request
    ↓
context / target resolution
    ↓
source-grounded claim extraction
    ↓
prompt enhancement → MotionBrief
    ↓
storyboard
    ↓
deterministic animation code
    ↓
sandboxed render
    ↓
contact-sheet visual QA
    ↓
pedagogical / source QA
    ↓
max one repair pass
    ↓
final MP4/WebM + provenance
    ↓
insert as a Rabbit Hole canvas artifact
```

The V1 should support videos up to **30 seconds**.

Recommended duration presets:

- 5 seconds — one visual idea / micro-mechanism
- 10 seconds — default; one focused concept
- 15 seconds — mechanism plus takeaway
- 20 seconds — intuition → mechanism or richer code walkthrough
- 30 seconds — the V1 maximum; intuition → mechanism → formal/code bridge when appropriate

Do not build a general-purpose video editor. Do not build unrestricted text-to-video. Do not make learners choose rendering technologies.

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

The user should not need to know Remotion, GSAP, HyperFrames, SVG, Canvas, Three.js, Manim, Blender, ffmpeg, or rendering terminology.

## 2.2 Optional user controls

V1 may parse optional duration and teaching treatment from natural language or explicit tokens:

```text
/motion 5s ...
/motion 10s ...
/motion 15s ...
/motion 20s ...
/motion 30s ...

/motion intuition ...
/motion mechanism ...
/motion code ...
/motion system ...
```

These are preferences, not a requirement that the user understand a schema.

Default duration:

```text
10 seconds
```

Maximum:

```text
30 seconds
```

If a request cannot be taught coherently in 30 seconds, narrow the objective or ask the learner to choose what to focus on. Do not silently compress a whole chapter into an incoherent 30-second animation.

## 2.3 Contextual use

`/motion` should use Rabbit Hole context.

Examples:

```text
selected card + /motion make this intuitive
```

means the selected card is the primary target.

```text
selected code block + /motion show what happens here
```

means the selected source/code evidence is the primary target.

```text
current Rabbit Hole + /motion explain this flow
```

means the current Rabbit Hole and relevant child/source context are available to the prompt enhancer.

The user should not need to restate information Rabbit Hole already knows.

---

# 3. Critical rule: never send the raw `/motion` prompt directly to the video agent

This is one of the most important rules in the design.

A raw request such as:

```text
/motion explain me softmax func
```

is underspecified.

It does not reliably tell the animation model:

- which `softmax` implementation the user means
- what repository/file/function is relevant
- what the learner already knows
- what the learning objective should be
- what claims are source-supported
- whether the focus is intuition, mechanism, math, or code
- whether numerical stability exists in this implementation
- whether masking happens before or after this function in the current source
- what must be shown
- what must not be implied
- how long the video should spend on each beat
- what renderer should be used
- what constitutes a successful result

Therefore the raw user request is only the **seed** for a hidden prompt-enhancement pipeline.

---

# 4. Prompt enhancement pipeline

The prompt enhancer converts the learner's short request into a grounded `MotionBrief`.

## 4.1 Step A — resolve the target

Resolve the user's referent using, in order:

1. explicitly selected object/card/part/code span
2. current canvas / Rabbit Hole context
3. current repository and current lesson/concept
4. explicit phrase in the user's request
5. repository symbol search when the phrase looks like a function/class/file

Do not guess when more than one plausible target remains.

Example:

```text
/motion explain me softmax func
```

Possible resolution:

```text
repository: karpathy/nanoGPT
file: model.py
symbol: softmax call or softmax-related implementation path
current lesson: attention
current concept: attention weights
selected evidence: exact source span / authored card
```

If there are two unrelated `softmax` functions and no contextual signal selects one, clarify instead of rendering.

## 4.2 Step B — collect source-grounded context

Build a minimal evidence pack.

Possible inputs:

- selected card content
- selected part ID
- repository file/symbol span
- current lesson claims
- current Rabbit Hole concept IDs
- relevant source citations
- exact implementation details
- surrounding call path when necessary
- Tutor claim/evidence registry only when useful and privacy-safe

Do not dump an entire repository into the motion planner.

Prefer the smallest evidence set that can ground the explanation.

## 4.3 Step C — extract supported claims

Create a small claim registry for the video.

Example:

```text
C1: softmax converts a vector of logits/scores into normalized positive weights
C2: the weights sum to 1 along the chosen dimension
C3: this implementation applies softmax over attention scores after masking
C4: masked future positions are unavailable before normalization
```

Only include C3/C4 if supported by the actual source context.

Each storyboard beat should later reference the claim IDs it teaches.

This lets QA answer:

```text
Which source-supported claim is this visual teaching?
```

## 4.4 Step D — infer the learning objective

The prompt enhancer should convert a vague request into one concrete learning outcome.

Bad objective:

```text
Explain softmax.
```

Better objective:

```text
After this 10-second animation, the learner should be able to explain in plain language how the selected softmax operation turns attention scores into relative weights and identify where it occurs in the current attention flow.
```

For code requests, include the implementation relationship:

```text
The learner should understand what enters this function, what transformation occurs, and what the returned tensor means to the next stage.
```

## 4.5 Step E — determine learner level/context

Use known current learning context when available.

Examples:

- early ML learner
- already knows logits but not normalization
- understands attention scores but not masking
- currently inside the NanoGPT attention lesson

Do not use sensitive personal profiling.

This is lesson context, not a permanent learner label.

## 4.6 Step F — choose pedagogical treatment

Renderer and pedagogy are separate decisions.

V1 teaching treatments:

### `intuition`

Use a visual metaphor or concrete story first, then map it back to the actual mechanism.

Example:

```text
speakers in a room
→ relevance brightness
→ weighted blend
→ labels become Q/K/V / attention weights
```

The analogy must map explicitly to the real concept and must not introduce false causality.

### `mechanism`

Use direct technical visualization.

Example:

```text
scores
→ mask
→ softmax
→ weighted values
```

### `code`

Show source/code execution or data flow.

Example:

```text
input tensor
→ highlighted source lines
→ shape/state changes
→ returned value
→ next caller
```

### `system`

Show flow across modules/services/components.

Example:

```text
browser request
→ Worker
→ control plane
→ provider
→ response
```

For V1, user-specified treatment wins when coherent. Otherwise the prompt enhancer chooses based on the request and source.

## 4.7 Step G — choose duration

If explicitly requested, respect 5/10/15/20/30 seconds when feasible.

Otherwise choose using complexity:

```text
single visual fact                 → 5s
single mechanism                  → 10s
mechanism + takeaway              → 15s
intuition → mechanism             → 20s
intuition → mechanism → formalism → 30s
```

Never exceed 30 seconds in V1.

## 4.8 Step H — define must-show and must-not-claim constraints

Example for causal masking:

```text
must_show:
- token positions
- attention-score matrix
- future positions
- mask applied before normalization
- blocked cells unavailable
- softmax over permitted cells

must_not_claim:
- masking happens after softmax
- future tokens are deleted from the sequence
- masked values become ordinary zeros that softmax may still use
```

These constraints are part of the production contract.

## 4.9 Step I — choose renderer

For the first implementation, use one reliable default renderer.

Recommended V1 default:

```text
HyperFrames
+ HTML/SVG/Canvas
+ GSAP
```

Why:

- code-driven and deterministic
- HTML-native
- strong fit for Claude-generated visual programs
- good for technical diagrams and typography
- GSAP provides polished, seekable motion
- Chromium-based preview/render workflow
- easy to inspect at arbitrary times
- straightforward MP4 generation with a controlled render pipeline

Build a renderer-adapter boundary so future renderers can be added without changing `/motion` semantics.

Future candidates:

```text
Remotion   → longer/template-heavy React compositions
Three.js   → spatial / 3D concepts
Manim      → mathematical derivations
Blender    → physically rich 3D / cinematic work
```

Do not support all of them in V1.

## 4.10 Step J — produce the `MotionBrief`

Conceptual shape:

```text
MotionBrief {
  id
  raw_user_request
  resolved_target
  title
  objective
  audience_context?
  source_refs[]
  claim_registry[]
  duration_seconds   // <= 30
  aspect_ratio
  teaching_mode
  visual_direction
  renderer
  narration_policy
  must_show[]
  must_not_claim[]
  output_requirements
  qa_requirements
}
```

This is the real input to the motion agent.

Do not treat the literal user string as the motion-agent prompt.

---

# 5. Worked example: `/motion explain me softmax func`

## 5.1 Raw request

```text
/motion explain me softmax func
```

## 5.2 Resolved context

Illustrative example:

```text
repository: karpathy/nanoGPT
current learning area: attention
selected/current code context: attention score normalization
learner level: early ML
source refs:
- exact source span around softmax
- relevant attention card / claim
- masking step immediately before it, if supported
```

## 5.3 Enhanced internal brief

```text
TITLE
How softmax turns attention scores into weights

OBJECTIVE
After 10 seconds, the learner should be able to explain how the selected
softmax operation converts the current attention-score row into relative
attention weights and identify what those weights mean downstream.

AUDIENCE
Early ML learner currently studying attention.

SOURCE OF TRUTH
- selected repository source span
- selected/current lesson evidence
- source claim IDs C1–C4

CLAIMS
C1: softmax maps relative scores to positive normalized weights
C2: the weights sum to 1 across the selected axis
C3: in this source path, masking has already removed disallowed future positions
C4: the resulting weights are later used to combine values

TEACHING MODE
mechanism

DURATION
10 seconds

MUST SHOW
- one row of attention scores
- score magnitudes visually compared
- transformation into normalized weights
- weights sum to 1
- downstream weighted combination cue

MUST NOT CLAIM
- softmax chooses one single winner
- softmax removes future tokens by itself
- weights are probabilities of token correctness

VISUAL DIRECTION
Clean technical motion graphics. Minimal text. Use position, size and opacity
changes to make normalization legible. Motion should show transformation,
not decorative bouncing.

RENDERER
HyperFrames + SVG/Canvas + GSAP

NARRATION
Optional one short sentence, only if it improves comprehension.

QA
- no unsupported claims
- labels readable at 1080p
- no clipping
- numerical/visual ordering consistent with source example
- takeaway understandable without narration
```

## 5.4 Hidden implementation-agent prompt

The motion harness then produces a prompt similar to:

```text
You are an educational motion designer, animation engineer and storyboarder.

Create a deterministic 10-second technical motion explainer from the supplied
MotionBrief.

Do not invent facts beyond SOURCE OF TRUTH and CLAIMS.

PROCESS
1. Write a compact timed storyboard.
2. Map every beat to one or more claim IDs.
3. Implement the storyboard in the allowlisted HyperFrames renderer using
   SVG/Canvas/GSAP as appropriate.
4. Every rendered state must be deterministic from timeline time and explicit state.
5. Do not use wall-clock timers, unseeded randomness or render-time network access.
6. Run renderer validation.
7. Render representative keyframes/contact sheet.
8. Inspect for clipping, hierarchy, timing and conceptual errors.
9. Inspect for unsupported or misleading teaching claims.
10. Repair at most once if a blocking issue is found.
11. Produce the final artifact package.

OUTPUT
- storyboard.json
- composition source
- render manifest
- contact sheet
- QA report
- final.mp4
- poster image
- provenance metadata
```

The precise prompt can evolve, but this **enhancement architecture is mandatory**.

---

# 6. Storyboard contract

Before implementation, create a short timed storyboard.

For 5–30 second videos, a storyboard should generally have **2–8 beats**.

Example 10-second softmax storyboard:

```text
0.0–1.5s
A row of attention scores appears.
Claim: C1
Takeaway: these are relative raw scores.

1.5–4.0s
Scores stretch/compress visually according to magnitude.
A normalization transform begins.
Claim: C1

4.0–6.5s
Scores become positive weights with percentages / normalized bars.
A subtle sum = 1 indicator resolves.
Claim: C1, C2

6.5–8.5s
Weights flow toward value vectors / information blocks.
Claim: C4

8.5–10.0s
Takeaway: "softmax turns scores into relative attention weights."
Claim: C1, C4
```

Each beat should include:

```text
start_time
end_time
pedagogical_role
visible_objects
claim_ids
transition
camera/framing
on_screen_text
narration_line?
```

Possible `pedagogical_role` values:

- hook
- intuition
- mechanism
- bridge_to_formalism
- notation
- equation
- implementation
- takeaway

These names can remain internal and may evolve.

---

# 7. Deterministic animation contract

The preferred mental model is:

```text
frame = pure_function(time, scene_state)
```

Generated motion code should be seekable and replayable.

Avoid:

- wall-clock-dependent animation
- hidden mutable timers
- uncontrolled DOM timing
- unseeded randomness
- network calls during render
- nondeterministic asset loading

The renderer must be able to request:

```text
render frame at t = 0.0
render frame at t = 2.5
render frame at t = 9.8
```

and obtain the correct visual state independently.

This matters for:

- reproducibility
- contact-sheet QA
- deterministic repairs
- caching
- debugging
- future distributed rendering

---

# 8. Toolchain for Motion V1

## 8.1 Model

Primary storyboard + implementation model:

```text
claude-opus-5-5
```

Use high reasoning effort when supported by the configured API for generation tasks.

Do not reuse the Tutor fast-tier architecture automatically. Motion generation is an artifact-generation job, not an interactive Tutor turn.

## 8.2 Primary renderer

Recommended first renderer:

```text
HyperFrames
```

with:

```text
SVG
Canvas
HTML/CSS
GSAP
```

Use a pinned, allowlisted renderer environment.

## 8.3 Browser/render capture

Use controlled Chromium / headless Chrome tooling for preview and frame capture.

Possible implementation tooling:

- Playwright or Puppeteer
- Chromium
- deterministic page/timeline seek API

## 8.4 Encoding

Use:

```text
ffmpeg
```

for final video encoding / muxing.

## 8.5 Image/frame inspection

Generate:

- poster frame
- contact sheet
- representative keyframes

These are inputs to visual QA.

## 8.6 Audio / narration

Narration is optional.

Policy suggestion:

```text
5s       → no narration by default
10–15s   → optional one short line
20–30s   → optional concise narration when useful
```

If narration is generated, reuse a server-side approved TTS provider such as the existing Fish Audio integration rather than exposing credentials client-side.

For synchronized narration:

```text
script
→ TTS
→ actual timestamps / cue timings
→ animation timing adjustment
```

Do not guess narration duration when actual timing can be measured.

Narration must never include unsupported claims or private learner content.

---

# 9. Renderer adapter boundary

Define a renderer abstraction so `/motion` does not depend directly on HyperFrames forever.

Conceptually:

```text
MotionRenderer {
  validate(brief, storyboard)
  generateSource(...)
  renderPreview(...)
  renderKeyframes(...)
  renderFinal(...)
  collectDiagnostics(...)
}
```

V1 implementation:

```text
HyperFramesRenderer
```

Later:

```text
RemotionRenderer
ThreeRenderer
ManimRenderer
BlenderRenderer
```

The learner-facing `/motion` command must not change when a renderer changes.

---

# 10. Preview and render strategy

Do not repeatedly render full-resolution final video during iteration.

Recommended pipeline:

```text
storyboard
→ source generation
→ low-resolution preview
→ contact sheet
→ QA
→ max one repair
→ high-resolution final
```

Suggested initial preview:

```text
854×480 or similar
15–24 fps
```

Suggested final:

```text
1920×1080
30 fps
```

Default aspect ratio:

```text
16:9
```

Architect for future 9:16 / 1:1 support, but do not let format proliferation block V1.

---

# 11. Visual QA

The visual reviewer should inspect at least:

- first frame
- hook
- major transitions
- the primary teaching beat
- any formal notation/equation frame
- final takeaway

Check for:

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

The contact sheet should make obvious problems easy to spot before the final video is accepted.

---

# 12. Pedagogical / source QA

A visually beautiful video that teaches the wrong thing is a failure.

Pedagogical QA is separate from visual QA.

Check:

- every major beat maps to a source-supported claim
- the conceptual order is coherent
- no prerequisite is skipped in a way that makes the video misleading
- the visual implies the correct causal relationship
- labels match source semantics
- analogies map explicitly to real concepts
- the analogy's limits are not hidden when relevant
- the takeaway matches the objective
- no `must_not_claim` violation occurs
- narration and visuals agree

For intuition-first videos, apply this test:

```text
If the equation/formal notation were hidden,
could the learner explain the core mechanism in plain language?
```

Then:

```text
After formalism appears,
can the learner map the major intuition elements to the real mechanism?
```

---

# 13. Repair policy

V1 allows at most **one automatic repair pass**.

```text
render preview
→ QA
→ blocking issue?
    no  → final render
    yes → repair once
           ↓
         re-render
           ↓
         final QA
```

If the second result still fails a critical check, stop and report the failure.

Do not create an unbounded autonomous rendering loop.

---

# 14. Security and execution boundary

Generated animation code is **untrusted code**.

Never execute generated motion code inside the main Rabbit Hole Cloudflare Worker or directly in the learner's browser as unrestricted arbitrary code.

Use an isolated renderer sandbox.

Requirements:

- no arbitrary filesystem access
- no access to host secrets
- no production credentials
- no arbitrary network access
- allowlisted runtime / packages only
- CPU limit
- memory limit
- render timeout
- output-size limit
- deterministic assets
- explicit input/output directories
- kill runaway processes
- validate output media before accepting

The render service should receive only the data/assets needed for that job.

Do not send user auth cookies, OAuth tokens or provider keys into the generated-code sandbox.

---

# 15. Asset policy

Prefer programmatic vectors, shapes, diagrams and typography for V1.

If a job requires external assets:

```text
asset resolution happens BEFORE sandbox render
```

The main service fetches/validates an allowlisted asset and copies the deterministic asset into the render package.

The generated animation itself should not freely browse the internet during render.

For code explainers, screenshots/source excerpts should be generated from approved repository content and included as deterministic assets.

---

# 16. Privacy policy

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

# 17. Artifact data model

Conceptual records:

## 17.1 `MotionJob`

```text
id
user_id
canvas_id
status
raw_request
brief_id
renderer
created_at
started_at
completed_at
failure_reason?
```

Statuses might include:

```text
planning
storyboarding
generating
rendering_preview
reviewing
repairing
rendering_final
ready
failed
```

## 17.2 `MotionBrief`

```text
id
resolved_target
objective
audience_context
source_refs
claims
duration_seconds
aspect_ratio
teaching_mode
visual_direction
renderer
narration_policy
must_show
must_not_claim
```

## 17.3 `MotionStoryboard`

```text
id
beats[]
version
```

Each beat stores timing + claim references.

## 17.4 `MotionArtifact`

```text
id
motion_job_id
video_url
poster_url
contact_sheet_url?
duration
width
height
fps
renderer
source_manifest
qa_report
created_at
```

## 17.5 Provenance

Retain enough metadata to answer:

```text
What source/card/code/claims generated this motion explainer?
```

Do not expose inaccessible source references to viewers who lack permission.

---

# 18. Canvas artifact UX

When ready, `/motion` inserts a motion artifact into the current canvas.

Suggested card behavior:

```text
[poster / video]
Title
10 sec · Motion explainer
Play

Sources / provenance
Open storyboard (optional/debug/creator)
```

The learner can play the artifact without leaving the canvas.

Potential later actions:

- Fork canvas with artifact
- Share artifact
- Regenerate with different teaching mode
- Expand to interactive explanation
- Open source concept

Do not implement all later actions in V1.

---

# 19. Relationship to Tutor

Tutor may suggest motion when it is pedagogically useful, but V1 should not automatically generate paid motion on every difficult concept.

Examples of acceptable future behavior:

```text
Tutor: "This relationship is easier to see moving. Want a 10-second animation?"
```

Generation should start only after learner intent/confirmation according to cost policy.

Tutor must reuse the same `/motion` pipeline rather than creating a second video-generation implementation.

---

# 20. Relationship to `/dive`

A Rabbit Hole provides a natural scope for a motion explainer.

Example:

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

# 22. Production prompt architecture

Do not maintain one giant unstructured prompt string.

Build the final motion-agent prompt from structured sections:

```text
ROLE
TASK
OBJECTIVE
AUDIENCE
SOURCE OF TRUTH
CLAIMS
MUST SHOW
MUST NOT CLAIM
TEACHING MODE
DURATION
VISUAL DIRECTION
RENDERER CONTRACT
NARRATION POLICY
PROCESS
QA
DELIVERABLES
```

Benefits:

- easier testing
- easier source grounding
- renderer-specific adapters
- reproducible failures
- easier future model comparison
- easier prompt versioning

Store a prompt/template version with each `MotionJob`.

---

# 23. Example production prompt template

```text
ROLE
You are an educational motion designer, animation engineer and storyboarder.
Your job is to make motion reveal the concept clearly and accurately.

TASK
Create a {duration_seconds}-second motion explainer.

LEARNING OBJECTIVE
{objective}

AUDIENCE CONTEXT
{audience_context}

SOURCE OF TRUTH
{source_refs_and_evidence}

SUPPORTED CLAIMS
{claim_registry}

MUST SHOW
{must_show}

MUST NOT CLAIM OR IMPLY
{must_not_claim}

TEACHING MODE
{teaching_mode}

VISUAL DIRECTION
{visual_direction}

RENDERER CONTRACT
Use the allowlisted HyperFrames environment.
Use SVG/Canvas/HTML/GSAP as appropriate.
Every visible state must be deterministic from timeline time and explicit state.
No render-time network calls.
No wall-clock-dependent animation.
No unseeded randomness.

NARRATION POLICY
{narration_policy}

PROCESS
1. Produce a compact timed storyboard.
2. Map each storyboard beat to supported claim IDs.
3. Implement the animation.
4. Run renderer validation.
5. Render representative keyframes/contact sheet.
6. Self-review visual quality.
7. Self-review source/pedagogical correctness.
8. Repair at most once if required.
9. Produce final render artifacts.

ACCEPTANCE
- no unsupported claim
- readable typography
- no clipping
- no broken geometry
- motion reveals mechanism/sequence/causality
- takeaway matches objective
- output duration <= {duration_seconds}

DELIVERABLES
storyboard.json
composition source
render manifest
contact sheet
qa report
final.mp4
poster.png
provenance.json
```

The implementation agent can improve the wording, but not weaken the contract.

---

# 24. Failure / clarification behavior

Do not start a render when the target cannot be resolved safely.

Examples:

### Ambiguous symbol

```text
/motion explain softmax func
```

but repository contains several unrelated targets and no current selection.

Response:

```text
Ask which function/source target the learner means.
```

### Unsupported source claim

If the learner asks:

```text
/motion show why this function uses temperature 0.7
```

but the selected source has no temperature behavior, do not invent it.

Clarify or explain that the requested claim is not supported by the current source.

### Too broad

```text
/motion explain transformers
```

for a 10-second default.

Narrow to one useful objective or ask the learner to choose:

- attention intuition
- causal mask
- residual stream
- one forward pass

### Renderer failure

If rendering fails after one repair pass, keep the job failed with diagnostics and do not insert a broken video into the canvas.

---

# 25. Cost / confirmation policy

The architecture should separate:

```text
cheap planning/storyboard
→ cheap preview
→ expensive final render
```

For local development, no billing layer is required.

For production, if final rendering is billable, use Rabbit Hole's existing paid-artifact pattern:

```text
quote
→ explicit user confirmation
→ reserve
→ render
→ settle
```

Do not charge or launch an expensive final render solely because a learner typed a question.

A cheap storyboard/preview may be treated separately if product policy allows.

---

# 26. Motion V1 implementation milestones

Do not attempt everything in one commit.

## M0 — tool/runtime audit

Confirm locally:

- HyperFrames install/runtime
- Claude Code / agent skill availability if useful
- Chromium/headless render path
- ffmpeg
- deterministic seek/render
- output MP4
- source/check command

Return a minimal proof:

```text
hand-written 5-second deterministic animation
→ preview
→ MP4
→ contact sheet
```

No LLM yet.

## M1 — renderer sandbox/harness

Build a local isolated render harness with:

- job directory
- allowlisted runtime
- input manifest
- output directory
- timeout
- resource limits
- deterministic frame seek
- contact-sheet generation
- ffmpeg encoding

Do not connect `/motion` yet.

## M2 — prompt enhancer / MotionBrief

Implement:

```text
raw request
→ target resolution
→ source pack
→ claim extraction
→ objective
→ teaching mode
→ duration
→ must-show/must-not-claim
→ MotionBrief
```

Add deterministic tests using fixture repositories/cards.

## M3 — storyboard generation

Use Opus 5.5 to generate structured storyboard JSON from `MotionBrief`.

Validate schema.

Reject malformed or ungrounded storyboards.

## M4 — code generation + preview

Generate renderer source from the validated storyboard.

Run:

```text
validation
→ low-res preview
→ representative keyframes
→ contact sheet
```

## M5 — QA + repair

Implement:

- visual QA
- pedagogical/source QA
- one repair pass

Keep repair inputs grounded in actual diagnostics.

## M6 — final render + artifact package

Produce:

- final MP4
- poster
- storyboard
- contact sheet
- QA report
- provenance manifest

## M7 — local `/motion` command integration

Wire the slash command only after the harness can produce good artifacts independently.

Use the current Rabbit Hole context/selection system.

Insert resulting artifact into the canvas.

## M8 — optional narration

Add narration after silent motion is reliable.

Reuse server-side TTS and actual audio timing.

Do not let audio complexity block visual V1.

## M9 — production design review

Before production deployment, review:

- sandbox isolation
- model/provider cost
- storage
- media serving
- cleanup/retention
- paid confirmation
- privacy
- observability
- abuse/resource caps

Production deployment requires a separate GO.

---

# 27. Required V1 demo cases

Before `/motion` is considered successful, produce at least these three demos.

## Demo A — mechanism

```text
/motion 10s explain causal masking
```

Expected:

- attention matrix
- future region blocked
- normalization over permitted cells
- clear takeaway

## Demo B — code

```text
/motion explain me softmax func
```

Expected:

- exact selected/source-resolved implementation context
- input → transformation → output meaning
- no generic softmax animation disconnected from the repo

## Demo C — system/code path

```text
/motion 30s show how this request moves through the app
```

Expected:

- source-grounded component/service flow
- clear data/request transitions
- no invented services

Optional fourth demo:

```text
/motion 20s intuition attention
```

for intuition → mechanism bridging.

---

# 28. Acceptance criteria

A Motion V1 candidate must demonstrate:

1. `/motion` accepts a short user prompt.
2. The raw user prompt is enhanced before generation.
3. Target resolution uses current Rabbit Hole/repository context.
4. Unsupported ambiguity produces clarification, not guessing.
5. MotionBrief contains source refs and supported claims.
6. Video duration is <= 30 seconds.
7. Storyboard is created before renderer code.
8. Storyboard beats map to claim IDs.
9. Renderer output is deterministic/seekable.
10. Generated code runs only in the sandbox.
11. Preview render completes.
12. Contact sheet is generated.
13. Visual QA runs.
14. Pedagogical/source QA runs.
15. At most one repair pass occurs.
16. Final MP4 is generated.
17. Poster is generated.
18. Provenance is retained.
19. Final artifact can be inserted into a Rabbit Hole canvas.
20. No unsupported claim appears.
21. No secret/private unrelated material leaks.
22. No arbitrary network or filesystem access exists in the renderer.
23. The three required demo cases pass human review.

---

# 29. Testing strategy

## Unit tests

- duration parsing
- max 30-second enforcement
- target resolution
- selected-card precedence
- selected-code precedence
- ambiguous target clarification
- MotionBrief schema
- claim registry
- must-show/must-not-claim construction
- renderer selection default
- prompt-template construction
- storyboard schema validation
- one-repair maximum
- provenance serialization

## Security tests

- generated code cannot read host env
- generated code cannot access arbitrary filesystem
- generated code cannot call internet
- timeout kills runaway job
- oversized output rejected
- secret-looking input is not logged

## Rendering tests

- deterministic frame at same timestamp
- preview output exists
- final MP4 valid
- no blank final frame
- contact sheet includes requested timestamps

## Product tests

- selected card + `/motion this`
- selected code + `/motion show this`
- explicit duration
- default duration
- ambiguous request
- insertion into canvas
- failed job does not insert broken artifact

---

# 30. Observability

Add safe job-level telemetry later / when observability lands:

```text
motion_requested
motion_brief_created
motion_storyboard_created
motion_preview_rendered
motion_qa_failed
motion_repair_started
motion_ready
motion_failed
```

Safe properties:

- duration
- teaching mode
- renderer
- stage
- failure category
- elapsed time
- model
- repair count

Do not log:

- raw private source code
- raw learner message if sensitive
- prompt bodies
- generated private narration/source
- secrets

Sentry should capture renderer/orchestrator errors with safe job IDs and stage names.

---

# 31. Storage / cleanup

Local harness:

```text
scratch job directory
→ clean after test unless retained intentionally
```

Future production storage should separate:

- source package / manifest
- preview media
- final media
- poster/contact sheet
- QA/provenance

Add retention rules so failed preview artifacts do not accumulate forever.

Do not decide final production bucket names in this harness task unless infrastructure work is separately approved.

---

# 32. Renderer service deployment direction

Do not run ffmpeg/Chromium/generated code inside the primary Cloudflare Worker.

Likely future topology:

```text
rabbit-hole-app
   ↓ internal authenticated job
rabbit-hole-motion-renderer
   ↓
sandboxed renderer container
   ↓
artifact storage
```

For the first implementation:

- local/containerized harness only
- no production deployment
- no permanent production resource creation

After local acceptance, Home/Infra can prepare a Rabbit Hole-owned render service if approved.

All permanent infrastructure must use `rabbit-hole-*` naming.

---

# 33. What not to build in V1

Do not build:

- full video editor
- timeline editor UI
- arbitrary third-party plugins
- unrestricted user JavaScript execution
- arbitrary Blender Python
- autonomous long-form video essays
- >30 second videos
- automatic video for every Tutor answer
- automatic video for every lesson
- social video marketplace
- multi-user live editing
- renderer marketplace
- six renderers at once
- iterative repair loops beyond one repair

Get one renderer and one workflow extremely reliable first.

---

# 34. References / inspiration corpus

Use these for design research and prompt inspiration, not as runtime dependencies.

- Addy Osmani motion explainer / browser walkthrough post supplied by the product owner
- `awesome-opus5-5-videos`
- YouMind Opus 5.5 prompt examples
- Jason Zhu Opus 5.5 prompt/video library
- educational Canvas explainer workflows shared by Claude users
- HyperFrames / Claude Code workflow
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

---

# 35. Instructions to Parallel

Create an isolated branch/worktree from the latest canonical main after currently active merges are stable.

Suggested:

```text
branch:
feature/motion-v1-harness

worktree:
workspace/motion-v1-harness
```

Use sub-agent-driven implementation/review where useful, with one primary owner.

Do not work directly on main.

## First checkpoint — no model calls

Before connecting Opus:

1. prove HyperFrames/renderer runtime locally
2. create a deterministic hand-written 5-second animation
3. render low-res preview
4. render MP4
5. create contact sheet
6. prove random/network/wall-clock restrictions
7. report exact dependencies and licenses

Stop and report this checkpoint before building a large pipeline if the renderer/toolchain is not reliable.

## Second checkpoint — prompt enhancement

Implement MotionBrief generation and fixture tests.

The most important acceptance case is:

```text
/motion explain me softmax func
```

The raw prompt must NOT be passed directly to the motion agent.

Show in the report:

```text
raw prompt
→ resolved target
→ evidence pack
→ claim registry
→ learning objective
→ teaching mode
→ duration
→ must-show
→ must-not-claim
→ final MotionBrief
```

## Third checkpoint — Opus storyboard/code generation

Use:

```text
claude-opus-5-5
```

Generate structured storyboard first, then implementation.

Do not allow Opus to bypass the storyboard contract.

## Fourth checkpoint — render/QA/repair

Implement:

- preview
- keyframes/contact sheet
- visual QA
- source/pedagogical QA
- max one repair
- final export

## Fifth checkpoint — local slash-command integration

Only after the harness works end-to-end, wire `/motion` in the local Rabbit Hole app.

Do not deploy production.

## Required report

Return:

1. branch/SHA
2. dependency/tool audit
3. renderer choice and why
4. sandbox design
5. MotionBrief schema
6. prompt-enhancement implementation
7. exact enriched example for `/motion explain me softmax func`
8. storyboard schema
9. generated-code contract
10. QA implementation
11. repair behavior
12. audio/narration status
13. output artifact structure
14. all tests
15. render timings
16. approximate model/render cost for 5/10/15/20/30 seconds
17. the three required demo videos
18. screenshots/contact sheets
19. remaining blockers before production

Do not merge.
Do not deploy.
Do not create permanent production infrastructure.
Stop for review.

---

# 36. Final principle

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

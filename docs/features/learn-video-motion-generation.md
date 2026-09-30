# Rabbit Hole: Video / Motion Generation

## Status

Deferred. This is an architecture and product spec only. No implementation
is authorized.

## Purpose

Rabbit Hole should eventually be able to create high-quality educational
motion explainers from source-grounded learning material.

This is not mainly text-to-video generation. The preferred direction is:

```
model
→ plans the teaching sequence
→ writes deterministic animation/rendering code
→ renders frames
→ optionally generates narration/audio
→ inspects output
→ critiques/revises
→ exports final video
```

The model acts as a motion designer, an animation engineer and an
educational storyboarder together, not as a black-box video model.

## 1. Product principle

Rabbit Hole already has interactive visual learning primitives. Future video
generation should reuse the same semantic concepts where possible.

```
ONE LEARNING IDEA

can appear as:

interactive card
↓
deeper Rabbit Hole canvas
↓
motion explainer
```

These should not become three unrelated content systems.

## 2. Two distinct capabilities

Keep these separate.

**A. Interactive learning animation.**
- It is live and manipulable, and the learner controls the variables.
- It is useful for prediction, exploration and practice.
- The existing Rabbit Hole timeline/scene system remains the right tool here.

**B. Motion explainer / rendered video.**
- An authored sequence with cinematic timing.
- Narration, typography, camera movement, sound and transitions.
- Exportable as MP4 or WebM.

Video may reuse concepts and data from interactive scenes, but it does not
replace them.

## 3. Important architectural observation

Many strong Opus 5.5 motion examples are not generated as opaque video. The
model writes programs that generate frames, for example with:
- HTML / Canvas
- SVG
- GSAP
- Three.js
- Remotion
- HyperFrames
- Blender

A browser or render pipeline then captures the frames, and ffmpeg produces
the final video.

A key pattern:

```
frame = pure_function(time, scene_state)
```

This closely matches Rabbit Hole's existing deterministic timeline
philosophy. Prefer deterministic, replayable rendering where practical.

## 4. High-level generation pipeline

```
learner request
       ↓
source/context collection
       ↓
learning objective
       ↓
pedagogical outline
       ↓
storyboard
       ↓
scene/timing specification
       ↓
renderer selection
       ↓
code generation
       ↓
preview render
       ↓
visual QA
       ↓
pedagogical QA
       ↓
repair if needed
       ↓
narration/audio sync
       ↓
final render
       ↓
export/share
```

Allow one repair pass at first, consistent with the current
artifact-generation philosophy.

## 5. Do not rely on one-line prompting in production

Viral prompts show what the model can do, but they should not be the
production contract. One example:

```
"Make a 15-second motion-design showreel showing
what an incredible motion designer you are. Go all out."
```

Rabbit Hole should provide structured context:
- learning objective
- learner level and current context
- source material
- exact claims that must be preserved
- duration
- target format and aspect ratio
- desired style
- renderer options
- narration policy
- accessibility
- acceptance criteria

The model may keep broad artistic freedom inside that contract.

## 6. Suggested declarative request shape

The future request, conceptually:

```
MotionExplainerRequest
{
  title
  objective
  audience_context?
  source_refs[]
  duration_seconds
  aspect_ratio
  visual_style?
  renderer_preference?
  narration:
    none | generated | supplied
  soundtrack:
    none | ambient | supplied
  must_show[]
  must_not_claim[]
  interaction_source_refs?
}
```

Do not lock this schema now. It documents a future design.

## 7. Storyboard-first workflow

Before generating final code, create a compact storyboard. Example:

```
0.0–1.5s    Hook: token sequence appears rapidly
1.5–4.0s    Query/key/value split
4.0–7.0s    Dot-product attention
7.0–10.0s   Mask applied
10.0–13.0s  Softmax redistributes weight
13.0–15.0s  Weighted values merge + takeaway
```

The storyboard should include:
- timing
- visible objects
- camera and framing
- the learner takeaway
- the narration line
- the transition
- source grounding

For expensive renders, the preview or storyboard may be approved before the
final render.

## 8. Renderer strategy

Do not force every video through one renderer. Future allowlisted renderers
could include Remotion, HTML Canvas, SVG + GSAP, Three.js, Blender and Manim.

Suggested initial roles:

| Renderer | Role |
|---|---|
| Remotion | polished 2D motion graphics, typography, UI, explainers |
| HTML Canvas / SVG | diagrams, lightweight deterministic motion |
| Three.js | spatial and 3D concepts |
| Manim | math-heavy visual derivations |
| Blender | physically rich 3D or cinematic scenes |

Renderer selection should eventually depend on capability, not only on the
user's wording. No generated code runs without a sandbox.

## 9. Potential relationship with existing Artifact Generation

Video should eventually become a generated artifact family. Conceptually that
could be `/video` or `/generate video`, but this document does not decide the
final command.

Current Artifact Generation principles continue to apply:
- allowlisted families
- validated input and output
- at most one repair
- paid confirmation where required
- no arbitrary HTML or JS from the browser
- `productionReady=false` until reviewed

Do not automatically equate the existing paid tool `video_generate` with
this new code-driven motion-explainer pipeline. They may end up as separate
providers or modes.

## 10. Relationship to the Rabbit Hole scene engine

Investigate later whether Rabbit Hole semantic scenes can provide video
generation with:
- geometry
- relationships
- timelines
- semantic IDs
- equations
- graphs
- source provenance

Do not force the interactive scene engine to become a video engine. A better
architecture may be:

```
shared semantic scene description
       ↓
interactive renderer

shared semantic scene description
       ↓
motion renderer adapter
```

Reuse the semantics, not necessarily the runtime implementation.

## 11. Educational QA matters more than visual spectacle

A beautiful video that teaches the wrong thing is a failure. QA should
eventually have at least two independent dimensions.

**Visual QA:**
- clipping
- timing
- legibility
- transitions
- composition
- hierarchy
- visual polish

**Pedagogical QA:**
- source correctness
- conceptual order
- no skipped prerequisite that makes the explanation incoherent
- the animation corresponds to the narration
- the visual does not imply false causal relationships
- the takeaway matches the objective

The visual reviewer should not be the only correctness reviewer.

## 12. Contact-sheet / keyframe review

Before accepting a generated video, produce a contact sheet or a
representative set of frames:
- beginning
- hook
- major transitions
- key teaching beats
- ending

Review the frames before, or alongside, watching the full render. This makes
obvious failures easier to catch:
- text overflow
- blank frames
- camera mistakes
- disappearing elements
- visual repetition
- bad contrast
- broken 3D geometry

## 13. Audio and narration

Narration is optional. Future pipeline:

```
script
→ TTS
→ word-level timestamps
→ cue sheet
→ motion timing
```

Sync the animation to actual timestamps rather than guessing how long the
speech takes.
- Narration never autoplays inside normal Learn.
- The existing paid confirmation rules still apply.
- Audio may include voice, subtle SFX and music, but education comes first.
  Avoid music or SFX that obscure the narration or the learner's focus.

## 14. References / inspiration

**Reddit: educational Canvas explainer workflow**
https://www.reddit.com/r/ClaudeAI/comments/1wr268d/a_different_kind_of_opus_55_video_prompt/

It matters because it demonstrates:
- narration
- transcript/timestamp alignment
- Canvas animation
- deterministic frame generation
- browser rendering
- ffmpeg
- contact-sheet inspection
- AI review
- pedagogical correction

**YouMind: Opus 5.5 prompt examples**
https://youmind.com/opus-5-5-prompts

Useful examples: showreels, educational explainers, code explainers, product
videos and longer visual essays.

**awesome-opus5-5-videos**
https://github.com/yihui-dev/awesome-opus5-5-videos

A large collection of real prompts and the creators' original posts. Use it as
an inspiration corpus, not as a production prompt dependency.

**Jason Zhu: Opus 5.5 prompt/video library**
https://jasonzhu.ai/en/prompts/claude-opus-5-5

Useful for prompt patterns, renderer patterns, self-verification structures
and motion-design examples.

**Additional references supplied during research**
- https://x.com/neil_xbt/article/2103862582041874854
- https://x.com/rexan_wong/status/2103707054108299437
- https://x.com/0xMovez/status/2104216919033192746
- https://pasqualepillitteri.it/en/news/19007/opus-5-5-motion-design-video-en
- https://www.iart.ai/blog/claude-motion-graphics
- https://magiccreator.ai/posts/how-to-use-claude-opus-5-5-to-make-videos
- https://www.tripo3d.ai/3d-prompts/claude-opus-5-5-2103428454355980558
- https://www.tripo3d.ai/3d-prompts/claude-opus-5-5-2102739444256383089
- https://deepseekartifacts.com/prompts/opus-5-5-video

## 15. Reference workflow patterns worth preserving

**Short, high-agency prompts can work surprisingly well.** Example pattern:

```
Make a 15-second motion graphics video showing
what an incredible motion designer you are.
Treat it like your resume/showreel.
Go all out.
```

Quality often improves a lot when you supply some of these:
- 1–2 reference videos
- a logo
- brand colors
- fonts
- product screenshots
- source material

It also helps to ask for several storyboard directions before implementation.

**"One prompt" often hides substantial agent work.** Impressive examples may
involve long autonomous runs, repeated rendering, inspection and repair. So
do not market or architect this internally as simply "prompt → perfect
video".

## 16. Future Rabbit Hole examples

**Attention:** "Make me a 45-second visual explanation of causal
self-attention." Output: tokens enter, Q/K/V split, score matrix, causal
mask, softmax, weighted value aggregation, final residual stream.

**Tokenization:** "Show why character tokenization makes sequences longer."

**Training:** "Show what one NanoGPT training iteration actually does."

**Repository explanation:** "Make a 60-second visual walkthrough of how this
request moves through this codebase."

**Physical AI:** observation → world model → planning → action, possibly
using Three.js or Blender.

## 17. Creator use case

Later, a creator may build a Rabbit Hole and ask: "Turn this rabbit hole into
a 45-second explainer."

The generated video could become:
- a LinkedIn teaser
- a YouTube short
- a course intro
- a blog embed
- a landing-page explainer

Each links back to the live learning experience with **Explore the
interactive Rabbit Hole →**. The rendered video is distribution; the Rabbit
Hole remains the interactive source.

## 18. Relationship to nested rabbit holes

Future `/dive` canvases can provide natural boundaries for video generation:

```
Transformer surface
    ↓
Attention child canvas
    ↓
Softmax child canvas
```

A user may eventually ask: "Make a 30-second video from this Attention
rabbit hole." Use the current canvas and its subtree as context, not the
entire project. Do not implement `/dive` here.

## 19. Relationship to Visual Summary

`visual_summary` and motion generation should share source grounding and
semantic structure where possible. One possible path: visual summary →
storyboard → animated summary. Do not make Visual Summary depend on video
generation.

## 20. Cost / paid behavior

Final rendering may be expensive. Future architecture should separate:
- cheap planning and storyboard
- a cheap preview
- the expensive final render

A paid final render follows quote → explicit confirmation → reserve → render
→ settle, consistent with the Usage/Credits architecture. No paid render
starts merely because a learner asks a question.

## 21. Performance strategy

Render a low-resolution preview first and the high-resolution final render
second. Example: 480p preview → inspect → approve → 1080p final. Avoid
producing full-resolution renders over and over during iteration.

## 22. Security / execution boundary

Model-generated animation code is untrusted. A future runtime must define:
- a sandbox
- no arbitrary filesystem access
- no arbitrary network access
- a renderer allowlist
- resource and time limits
- deterministic asset ingestion
- output validation

Never execute generated code inside the main web worker.

## 23. Suggested milestone breakdown later

Do not execute now. A future sequence could be:

| Milestone | Scope |
|---|---|
| VM1 | storyboard contract |
| VM2 | Remotion/Canvas deterministic renderer |
| VM3 | preview + contact-sheet QA |
| VM4 | narration/timestamps |
| VM5 | pedagogical + visual evaluator |
| VM6 | paid final render |
| VM7 | Three.js / Manim adapters |
| VM8 | Blender adapter |
| VM9 | creator export/share |

Start with one reliable renderer, probably Remotion plus SVG/Canvas
primitives, rather than supporting everything at once.

## 24. Explicitly out of scope for the first implementation

- autonomous feature-film generation
- arbitrary user JavaScript execution
- unrestricted Blender Python
- a social feed
- a creator marketplace
- automatic Tutor video generation for every lesson
- replacing interactive learning cards with video
- live collaborative editing
- arbitrary third-party renderer plugins

## 25. Future acceptance criteria

When implementation is eventually authorized, an initial v1 should
demonstrate:

1. a source-grounded educational objective
2. a generated storyboard
3. deterministic renderer output
4. a 20–60 second explainer
5. no unsupported claims
6. readable text
7. no clipping
8. synchronized narration, if enabled
9. contact-sheet inspection
10. visual QA
11. pedagogical QA
12. one repair pass
13. a low-res preview
14. a final export
15. retained source and provenance metadata

## Intuition-first teaching videos

An important product direction: Rabbit Hole videos should not only be
polished explainers of equations or code. One of the main use cases is an
intuition-first teaching mode:

```
intuition
→ concrete story / analogy / cartoon
→ visual mechanism
→ concept vocabulary
→ theory
→ formulas
→ implementation
```

This is closer to how strong instructors such as Andrew Ng teach: first make
the learner feel what the idea is doing, then introduce the formal
machinery.

Do not treat this as imitating any person's visual style. What matters is
the pedagogical sequence, not copying a teacher's look or voice.

### Why this matters

A learner often does not need equation → equation → definition → proof as
their first encounter with a concept. They may get more from a character, an
object, a simple story, movement, cause and effect, or a visual metaphor
before seeing symbolic notation.

Example for attention:

| Scene | Beat |
|---|---|
| 1 | A character is in a busy room and hears many people speaking. |
| 2 | The character turns toward the person whose words matter most for the current question. |
| 3 | Different speakers become brighter or dimmer according to relevance. |
| 4 | Their information is blended according to those weights. |
| 5 | Transition: "That intuition is the core of attention." |
| 6 | Now introduce Query / Key / Value. |
| 7 | Then: score → scale → mask → softmax → weighted values. |
| 8 | Only after the learner understands the mechanism visually, reveal the formal equation. |

The cartoon or story should not be decorative. Every visual beat must
correspond to something that later maps cleanly onto the real concept.

### Support multiple pedagogical visual modes

Future motion generation should support different teaching treatments, for
example:
- `intuition_cartoon`
- `mechanism_visualization`
- `analogy_story`
- `code_walkthrough`
- `mathematical_derivation`
- `system_animation`
- `3d_spatial_explanation`

Do not lock these exact enum names yet.

The key architectural point: **renderer/style and pedagogy are separate
decisions.** For example:

| Pedagogy | Visual treatment | Renderer |
|---|---|---|
| intuition-first | cartoon | Remotion / SVG |
| mechanism-first | clean technical diagram | Canvas |
| spatial intuition | 3D scene | Three.js |

### Cartoon-based teaching

Cartoon and character-based explainers are explicitly in scope. To make an
abstract concept intuitive, they can use:
- simple characters
- objects
- rooms
- arrows
- containers
- paths
- machines
- packets
- workers
- conversations
- memory
- physical metaphors

Examples:

| Concept | Analogy |
|---|---|
| Attention | people deciding who to listen to |
| Gradient descent | walking downhill through fog, checking the slope locally |
| Tokenization | cutting a sentence into differently sized tiles |
| Embeddings | placing concepts in a room where similar ideas stand closer |
| Residual connections | information taking a shortcut around a transformation |
| Convolution | a small inspection window moving across an image |
| Backpropagation | responsibility flowing backward through a chain of decisions |
| World models | an agent imagining possible futures before acting |

Again, the analogy must map clearly back to the real mechanism.

### Required analogy mapping

Every intuition-first video should internally track which analogy element
maps to which actual concept. Example:

| Analogy element | Actual concept |
|---|---|
| person asking a question | query |
| each speaker's identity/context | key |
| information each speaker provides | value |
| relevance brightness | attention score / weight |
| blending speakers | weighted sum of values |

This stops an attractive metaphor from teaching the wrong mental model.

The pedagogical QA should verify that:
- the analogy is useful
- the analogy does not introduce a false causal relationship
- the mapping to the formal concept is explicit
- the learner knows where the analogy stops being exact

### Transition from intuition to formalism

The transition is the most important part. Do not leave the learner with only
the cartoon. A strong explainer progressively reveals:

```
familiar visual
↓
semantic labels
↓
simplified technical diagram
↓
actual notation
↓
formula
↓
implementation / source code
```

Example:

```
speakers
↓
Query / Key / Value labels appear over them
↓
characters simplify into vectors/boxes
↓
score matrix appears
↓
softmax weights
↓
attention equation
```

Ideally this transformation feels continuous, not "cartoon ends, hard cut,
equation appears".

### Videos can be an entry layer in Rabbit Hole

The future learning flow may be:

```
intuition video
↓
interactive visualization
↓
practice / prediction
↓
deeper explanation
↓
formula
↓
implementation
```

Or:

```
learner enters a rabbit hole
↓
short intuition-first animation
↓
learner chooses:
  "Show me the mechanism"
  "Show me the math"
  "Show me the code"
```

This fits Rabbit Hole's adaptive-depth model well. Do not implement this
routing now; this only documents the future relationship.

### The model should choose depth intentionally

Future generation should tell these apart, based on the learning objective
and the requested duration:
- an intuition-only teaser
- intuition → mechanism
- intuition → theory
- intuition → full formal derivation

A 20-second video may only establish the intuition. A 90-second video may
progress through analogy → mechanism → notation → equation.

### Avoid "edutainment slop"

Cartoon-based does not mean:
- random mascots
- constant bouncing
- unrelated visual jokes
- flashy transitions with no teaching value

Every scene should answer: **what mental model is this visual giving the
learner?** Motion should reveal relationship, causality, sequence,
transformation or comparison, not simply make the screen busy.

### Future storyboard field

In the future storyboard contract, consider something like:

```
teaching_mode:
  intuition_first
  mechanism_first
  formal_first
```

and per beat:

```
pedagogical_role:
  hook
  analogy
  mechanism
  bridge_to_formalism
  notation
  equation
  implementation
  takeaway
```

These names are provisional. Do not implement a schema yet.

### Acceptance condition for intuition-first videos

A good intuition-first video should pass this test: **if the equation were
hidden, could the learner explain the core mechanism in plain language?**

And after the formal section: **can the learner map each major part of the
intuition onto the real mathematical or computational mechanism?**

That should be part of future pedagogical QA.

### Principle

Rabbit Hole motion generation should teach from intuition to mechanism to
formalism when that ordering helps the learner. The goal is not to make
formulas prettier; it is to build the mental model that makes the formulas
make sense.

This section is still doc-only. It authorizes no video generation, Tutor
routing, renderer, command or schema.

---

Status: DEFERRED.

This document records the Video / Motion Generation direction only.

No video command, registry entry, renderer service, provider binding,
Tutor routing, paid render or production code is authorized by this document.

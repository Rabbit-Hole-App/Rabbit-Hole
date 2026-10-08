# Learn Artifact Generation v1

Status (2026-09-29): done. The Tutor Agent that will call this layer is
intentionally deferred until the tutor architecture session.

A Learn `/` command becomes one validated learning artifact on the canvas:

```
learner command -> semantic family -> constrained primitive choice
  -> validated declarative spec -> canvas block
```

This is infrastructure. The future Adaptive Tutor calls the same layer
(learner evidence -> pedagogical move -> family -> this generator). No tutor
policy, learner state or pedagogical routing lives here.

The command definitions are smart-home's shared contract
(`packages/web/src/agent/slash.js`, `docs/features/rabbit-hole-commands.md`).
This branch owns the Learn picker and execution.

## Primitive registry

`packages/control-plane/src/learn-primitives.js`: one entry per canvas
primitive. Each entry holds:

- `schema`: the JSON schema the model fills.
- `check`: semantic rules the schema cannot express (one correct quiz answer,
  edges that join real nodes, table rows the width of the header, Mermaid
  without click handlers or directives, graph specs through `validateGraph`,
  paid operations through their existing validators).
- `block`: the existing LearningBlocks card data.

There is no second schema per card and no generated code. The registry is
pure, so the browser imports it too.

The shared contract decides which primitives are paid (`primitive(id)`), not
the registry.

| Status | Primitives |
|---|---|
| Ready | explanation, table, flashcards, quiz, challenge, explain_back, code_sample, flow_diagram, mermaid_diagram, walkthrough, interactive_graph, data_plot |
| Ready, paid (proposal only) | video_generate, maths_animation, blender_scene |
| Not generated (explicit message, no substitution) | code_exercise, narration, knowledge_graph, animation, reference_attention, 3d_model, image_generate |
| Direct tools, no model | notebook, whiteboard, paper, image (search), video (existing clip) |

A generated code sample carries no output line: nobody ran it, so any output
would be a claim.

A data plot marked `illustrative` is labelled on the card whatever the model
wrote.

## Endpoint

`POST /api/learn/artifact` (dev worker, `learn-artifact.js`).

The body is `{app, command, args, selection, context}`:

- The server derives `allowedPrimitives` from the command through
  `learnRequest`. Any `family` or `allowedPrimitives` in the body is ignored.
- The ready primitives in that family become the model's only tools
  (`make_<primitive>`), plus `ask_clarifying_question`.

The response takes one of these forms:

| result | Meaning |
|---|---|
| `artifact` | `{primitive, block, repaired}`: validated; the client inserts it |
| `paid_proposal` | `{primitive, block, message: 'This uses paid generation.', estimatedCost: null}`: nothing started |
| `clarification` | `{question}`: the request was too underspecified to answer correctly |
| `unsupported` | `{message}`: the family has nothing ready, for example "/practice coding" |
| `validation_error` | `{error}` in two cases: the model returned a primitive outside the family (rejected, no repair), or a spec still failed after its single repair |
| `direct`, `not_artifact` | Deterministic and chat commands never run here |

App access is checked before any model call; an unknown command or selection
is a 400.

## Paid generation boundary

The rule is the same for every provider: an action that costs money starts
only after the learner confirms it, whichever UI path produced it.

Every paid endpoint runs `paidRefusal(body)` (`control-plane/src/learn-paid.js`)
before its provider call. Without `confirmed: true` it answers HTTP 428 with
`needsConfirm`. That flag is set only by a Generate press.

| Path | Paid? | Gate |
|---|---|---|
| `/api/learn/video`, `generate_video` (FAL) | yes | `confirmed` in the LearnVideos DO |
| `/api/learn/video`, `generate_math_animation` (Manim worker) | yes | same |
| `/api/learn/scene`, `generate_3d_animation` (Blender worker) | yes | `confirmed` in the LearnScenes DO |
| `/api/learn/image` (OpenAI images) | yes | `confirmed` in the dev worker |
| `/api/learn/tts` (fish.audio narration) | yes | `confirmed` in the dev worker |
| Existing glTF (`three_d`), hosted MP4/WebM, graphs, Pexels, arXiv | no | none |

In the UI:

- **Cards** (Blender scene, Video generate, Maths animation, Image generate):
  the button opens the confirmation: "This uses paid generation. [Cancel]
  [Generate]". A failed job's Retry asks again.
- **A paid `/` proposal** is confirmed in the composer. The card is then
  inserted with `confirmedStart` and starts once.
- **Narration** never autoplays. A whiteboard explanation, the whiteboard's
  "Read it aloud" and the Narration card all offer
  "Narration available. This uses paid generation. [Cancel] [Generate]" first.
- **A whiteboard card** has no paid job runner. Its video and scene blocks say
  "Generation isn't available from this canvas yet" and show no Generate
  button, so there is no button that does nothing.

The shared contract marks narration paid (smart-home 594c0ec, taken as-is).

## Fail-closed plans

`validateBoardPlan` already rejects unknown Explain-on-canvas kinds on the
server. `drawExplanation` now also refuses a plan with an unknown kind
(`PLAN_KINDS`) and draws nothing. It never reinterprets a plan as text.

## The Learn / picker

`LearnSlash.jsx` and `learn-slash.js` provide the picker in the Learn dock
composer.

- `/` opens LEARN, then CREATE, in `LEARN_MENU` order.
- Below them sits a collapsible **More learning tools** section listing every
  other available command. `/more` is a way to reach tools, not a tool, so it
  is never a row. The section opens on a click, on Enter, or when the list is
  scrolled to its end.
- A typed prefix (or a typed `/more`) lists every Learn command that can do
  something now.
- View → Slash commands (`SlashCommandsSheet.jsx`) shows the same sections,
  each command with an example. A family shows only if it has a ready or direct primitive; a command
  typed by name still says what is unavailable.
- The sheet's search sits at the top of the command list and is focused when
  the sheet opens. It filters as you type by command name and description,
  ignoring a leading `/`. Enter selects the first match, and "No commands
  match" shows when nothing does. Esc clears a typed search first, then closes
  the sheet.
- The list and its search are `CommandList.jsx`, shared with the Agent Bar's
  sheet (project-map-learn.md).
- Every command in the sheet shows a demo (`slash-sheet.js`, pinned by
  `slash-sheet.test.mjs`, which also pins that every registry command is offered
  with a demo or excluded by name):
  - a command that makes cards shows the real card at its canvas size, with a
    tab for each card it can make;
  - `/source` shows the sheet's `/explain` card with its Sources & evidence
    open;
  - a chat command (`/deeper`, `/dive`, `/simplify`, `/example`, `/ask`,
    `/teach`) shows an example exchange that asks exactly its e.g. line.
- The demos keep one thread (the sigmoid, softmax and nanoGPT), and each e.g.
  line asks for exactly the card or answer shown. Every `/compare` tab compares
  sigmoid and tanh.
- Paid media never shows Generate in the sheet and never calls a model or
  provider. It shows committed files:
  - `/animate` plays `public/landing/softmax-overview-v1.mp4` in the real Maths
    animation card;
  - `/motion` (development builds only, `VITE_MOTION_DEV`) plays the same
    clip, which is the landing page's /motion explainer, as a finished
    `/motion 25s explain softmax` (25 s, "Motion explainer"; no renderer or
    sources claimed);
  - `/video` and `/3d` have no committed finished file, so they show a labelled
    picture of the finished card (`public/lesson-assets/slash-video-prism.svg`,
    `slash-3d-frustum.svg`).
  `/video` and `/3d` keep their prism and camera-frustum subjects: generated
  footage and 3D scenes need a physical or spatial subject, which the thread's
  maths does not have.

Execution:

- `/notebook` and `/whiteboard` insert directly.
- `/paper <arXiv id or link>` opens that paper. `/paper <topic>` opens the
  arXiv search with the topic and the learner picks a real paper; a paper is
  never invented.
- `/image <terms>` inserts an Image card that runs a photo search.
- Commands with no family (`/deeper`, `/ask` and so on) go through the
  existing Learn ask as their prompt.
- Family commands call the endpoint above.

`/source` opens the Sources & evidence of the selected card where it sits on
the canvas, and brings the card into view. With no card selected, or a card
without sources, it says so in one line.

## Storage

Learn media is kept apart from production outputs
(`control-plane/src/learn-storage.js`). That covers:

- paper uploads;
- dropped images;
- chat attachments;
- generated clips and scenes;
- shared-board files;
- moment-index records.

`learnMedia(env)` picks the `LEARN_MEDIA` binding where it exists:

| Worker | `LEARN_MEDIA` | Learn media goes to |
|---|---|---|
| Dev and review (`wrangler.dev.jsonc`, `wrangler.parallel.jsonc`) | `small-learn-media-dev` | the dev bucket |
| Production (`control-plane/wrangler.jsonc`) | none; this file is unchanged | `RUNS` (`small-runs`), as before |

`RUNS` stays bound on dev as the live outputs binding. It is used for reads
only: App/Job bundles and run outputs.

`dev-worker.js` refuses to serve when `LEARN_MEDIA` is missing, so a dev
worker never falls back to live storage.

`test/learn-storage.test.js` pins this:

- the dev bucket is not a production bucket;
- production has no `LEARN_MEDIA`;
- no `learn-*.js` module names `RUNS`;
- chat attachments use the helper;
- a live bucket that throws is never touched.

## Checks

- `packages/control-plane/test/learn-artifact.test.js` covers:
  - family resolution;
  - validated blocks for /explain, /quiz, /graph (graph and plot), /diagram
    (flow and Mermaid);
  - server-side rejection with injected `allowedPrimitives`;
  - exactly one repair;
  - clarification;
  - the paid proposal;
  - access before the model.
- `learn-video.test.js` and `learn-scene.test.js`: an unconfirmed start is a
  428 with no provider call.
- `packages/web/src/learn-slash.test.mjs` covers:
  - picker order;
  - direct inserts with no model call;
  - /paper research;
  - the request body (command only, never a primitive list);
  - paid, question and error results that insert nothing.

## Primitive gap table (2026-09-29)

The registry grows per reusable primitive (card type), never per authored card.
NanoGPT cards such as c22 Top-k or c24 Generation loop are content. They can
serve as examples of a schema, but none of them becomes a tool of its own.

| Primitive | Registry | Family (command) | Renderer | Next step |
|---|---|---|---|---|
| explanation | ✅ generated | /explain | ExplanationBody | done |
| table | ✅ generated | /explain, /compare | TableBody | done |
| flashcards | ✅ generated | /flashcards | FlashcardsBody | done |
| quiz | ✅ generated | /quiz, /practice | QuizBody | done |
| challenge | ✅ generated | /practice | ChallengeBody | done |
| explain_back | ✅ generated | /practice | ChallengeBody (explain_back) | done |
| code_sample | ✅ generated | /code | SnippetBody | done |
| flow_diagram | ✅ generated | /diagram, /compare | FlowDiagram (ELK) | done |
| mermaid_diagram | ✅ generated | /diagram, /compare | MermaidDiagram | done |
| walkthrough | ✅ generated | /walkthrough | scene engine, walkthrough_v1 | done |
| interactive_graph | ✅ generated | /graph, /compare | Desmos | done |
| data_plot | ✅ generated | /graph, /compare | Plotly | done |
| maths_animation | ✅ paid proposal | /animate | Manim worker | verified by a real render |
| video_generate | ✅ paid proposal | /video | FAL | works; the sample clip misteaches refraction, owner's call |
| blender_scene | ✅ paid proposal | /3d | Blender worker | verified by a real render |
| notebook, whiteboard, paper | ✅ direct (no model) | /notebook, /whiteboard, /paper | their cards | done |
| image (search), video (existing clip) | ✅ direct | /image, and a found clip | their cards | done |
| code_exercise | ⬜ missing | /code, /practice | CodeBody (setup, starter, checks, hint) | highest priority after the freeze; needs its grading contract (below) |
| knowledge_graph | ⬜ missing | /graph | KnowledgeBody | candidate after the freeze: the learning concept graph only, never the Project Map |
| animation (generic) | ⬜ missing | /animate, /compare | AnimatedScene (scene JSON) | wait: the card agent is still evolving this format (NC cards) |
| narration | ⬜ missing | /explain | AudioBody (text, then paid TTS on Generate) | candidate after the freeze: generating the text is free; the audio is a separate paid action |
| vector_explorer | ⬜ not in any family | none | vector card | goes under an existing family (/graph, or /diagram) chosen from its contract at handoff; never a new /vector |
| image_generate | ⬜ missing | /image | ImageBody generate mode | later, an explicit subtype: /image searches by default; "/image generate …" makes one behind the paid confirmation. Not permanently dev-only; no change now |
| 3d_model | ⬜ not generatable | /3d | ThreeDBody (an existing glTF URL) | direct only: an existing model is inserted, a generated scene is blender_scene; no generic 3d_model generation |
| reference_attention | ⬜ not a tool | /animate | a fixed benchmark scene | reference content: out of /animate's generatable options; the card itself stays |

Frozen until NC9 and NC10 finish (owner, 2026-09-29). Then one short schema
handoff with the card owner, and only the missing primitives whose renderer and
data format are stable get implemented. Generic animation waits for its scene
format to freeze. Anything unstable stays dev-only.

**code_exercise** needs more than a visual schema:

- starter code;
- language and runtime;
- tests or checks, and the expected behaviour;
- the hints the learner sees;
- a grading contract.

Generated output never contains server-side execution instructions. The
existing browser sandbox runs the code.

**Readiness:** `ready` stays false until all five hold:

1. the schema is stable;
2. semantic validation passes;
3. model generation succeeds;
4. a malformed generation gets at most one repair;
5. one representative generated result passes deployed and Figma review.

After that, future instances need no per-card review.

**Deferred: Visual Summary / Concept Map** (`visual_summary`, modes `summary` / `concept_map`, under `/diagram`). Future, not implemented; spec in docs/features/learn-visual-summary.md (on feat/canvas-block-conversations until merge). Do not add it to learn-primitives.js, slash.js, BLOCK_TYPES or Tutor tools yet.

**Video / Motion Generation** (code-driven, source-grounded motion explainers; intuition-first teaching videos). The Motion V1 development harness is authorized by docs/features/rabbit-hole-motion-v1-harness-spec.md, development environment only. Long-term direction: docs/features/learn-video-motion-generation.md. It is not the existing paid `video_generate` primitive. Production `/motion`, production paid rendering, Tutor routing and broad rollout remain deferred.

## Adding a primitive (handoff contract, owner-approved 2026-09-29)

**The card owner supplies,** once a card type's format is stable:

- the primitive id;
- its canonical declarative data shape;
- which fields are required and which are optional;
- one normal valid example and one edge-case valid example;
- the semantic invariants;
- the renderer entry point.

There is no React or code-generation contract.

**Learn (this branch) adds:**

- the schema;
- the semantic validator;
- the renderer adapter (the spec becomes the card);
- the model tool definition;
- at most one repair;
- family allowlist enforcement;
- tests.

The primitive stays `ready: false` until a real generated example passes
review.

**smart-home** adds the primitive to an existing semantic family. A new slash
command only when it is a genuinely new learner intent; the command list never
grows one command per renderer.

**Review:** one generated example, or a small representative set, per
primitive type. For example: interactive_graph with a sigmoid, challenge with
an attention prediction, flow_diagram with a transformer pipeline. Once a
primitive's contract is proven, new content in the same schema needs no
further architectural approval.

**Out of scope here:** when a primitive should be used, tutor persona
selection, learner-state routing and likely-next-tool prediction. This layer
only answers: given a request for tool family X, can Rabbit Hole safely
generate a valid artifact of primitive Y?

## `/motion`, the educational motion explainer

Status: the Motion V1 development harness is authorized by
[rabbit-hole-motion-v1-harness-spec.md](rabbit-hole-motion-v1-harness-spec.md),
the authoritative implementation spec for V1 (development environment only).
The long-term direction is in
[learn-video-motion-generation.md](learn-video-motion-generation.md).

This section keeps the shared artifact policy for `/motion`. It does not
duplicate the V1 implementation; where an implementation detail here
conflicts with the V1 spec, the V1 spec wins for V1.

Still deferred:
- public production `/motion`
- production paid render
- Tutor routing
- renderers other than Remotion (the baseline) and HyperFrames (the priority
  second renderer, M7B)

**`/motion` is the future canonical slash command** for Rabbit Hole's
code-driven educational motion explainers. Do not use `/video` for this
capability. `/video` may later cover generic video media, search or
provider-generated video. `/motion` means one specific thing: an animated
teaching artifact that is pedagogically planned, code-driven and
deterministic.

```
/motion explain softmax
/motion give me an intuition-first animation for attention
/motion turn this card into a 30-second explainer
/motion show visually why gradient descent works
```

### The raw learner prompt never goes straight to the authoring model

"Design a video that explains softmax" is not enough as a production prompt.
A dedicated **Motion Director** turns the learner's request plus the learning
context into a structured production brief:

```
learner
  ↓
/motion "explain softmax"
  ↓
gather learning context
  ↓
MOTION DIRECTOR
  ↓
validated MotionBrief
  ↓
MOTION AUTHOR
  ↓
deterministic animation code/spec
  ↓
preview render
  ↓
visual QA + pedagogical QA
  ↓
optional repair
  ↓
final render
```

The Motion Director and the Motion Author are different responsibilities.

### 1. Motion Director

The Motion Director does not write Remotion code. It turns an underspecified
learner request into a high-quality educational motion-design brief.

**Input:** `/motion explain softmax`, plus whatever Rabbit Hole context is
available:
- the current card and concept
- the current rabbit-hole depth
- the learner's question
- source references
- codebase context
- equations and concepts already introduced or taught
- the learner's current evidence/state, once a Tutor exists

**Example output** (illustrative; the canonical V1 MotionBrief is §5.1 of
the V1 spec):

```
MotionBrief
objective:        Build intuition for Softmax before introducing its formula.
learner_takeaway: Softmax turns arbitrary scores into positive relative shares
                  that sum to one.
teaching_mode:    intuition_first
duration:         25 seconds
visual_metaphor:  Four competitors divide one fixed bar of attention.
causal_sequence:  raw scores → why raw scores cannot directly be probabilities
                  → exponentiate → sum → divide → probability distribution
                  → formal equation
must_show:        scores 2, 1, 0, -1; the negative raw score problem;
                  exponentiation makes every quantity positive; normalized values
                  approximately 0.64, 0.24, 0.09, 0.03; probabilities sum to 1;
                  the final Softmax equation
must_not_imply:   raw logits are probabilities; Softmax chooses only the maximum;
                  negative logits receive zero probability
style:            playful educational motion design, warm paper background,
                  flat semantic colors, no gratuitous glow/gradient effects
progression:      intuition → mechanism → notation → formula
sources:          [...]
```

### 2. Direction, not prompt expansion

The Motion Director is not "raw prompt + make this prettier". It makes real
pedagogical decisions:
- What exactly should the learner understand afterward, and what do they
  already know?
- Should it start with intuition, mechanism, math, code or a story?
- Which visual metaphor helps, and where does it stop being exact?
- Which facts must be source-grounded?
- What moves, what stays constant, and what is the causal sequence?
- Which quantities must visibly change?
- When do the terminology and the formula appear?
- What is the final takeaway?

That is the difference between prompt enhancement and educational direction.

### 3. Context by default

`/motion` is contextual. Invoked on a selected card ("select the Softmax card,
`/motion explain this`"), that semantic object is the Director's primary
target. It may receive:
- concept ID
- the card's objective
- sources
- equations
- code references
- parent concepts
- the current depth
- concepts already taught
- the current canvas/rabbit-hole context

Build a bounded motion-context package. Never dump the whole canvas or
repository into the prompt.

The package comes from the future shared **Learner Intent Resolver**:
learner message → Learner Intent Resolver → Tutor, or the direct `/motion`
route → Motion Director. `/motion` has no separate context or prompt system.
The resolver keeps `raw_user_message` next to the structured interpretation
and uses per-concept evidence, never permanent learner labels. The contract
is "Future shared input layer: Learner Intent Resolver" in
docs/features/adaptive-tutor-v1.md (on main). It is not implemented yet.
Motion V1 builds its motion-facing slice in the shared location, to that
contract, so other specialists can reuse it (V1 spec §4.2).

Explicit named concepts beat ambient context ("/motion explain gradient
descent" on an attention canvas targets gradient descent); deictic words
("this", "here") bind to the selection. Source grounding then decides which
occurrence of a named target is meant, and records branch conditions such as
nanoGPT's flash-attention vs fallback path. If materially different targets
remain, ask one concise clarification.

### 4. Tutor relationship

- **Tutor** decides WHETHER an animation is the right teaching move.
- **Motion Director** decides HOW that animation should teach the concept.
- **Motion Author** decides HOW to implement and render the approved brief.

The Tutor never writes Remotion prompts or animation code. `/motion` also
works without a Tutor: when a learner invokes it by hand, the Motion Director
starts directly.

### 5. Model roles

- **Motion Director:** reasoning, pedagogy, storyboard.
- **Motion Author:** high-agency visual implementation.

A strong coding/creative model such as Opus 5.5 may serve as Motion Author.
Model names are never hard-coded into the artifact contract: provider and
model selection belong in configuration. V1 configures calls by role:
`MOTION_DIRECTOR_MODEL`, `MOTION_AUTHOR_MODEL`, `MOTION_VISUAL_REVIEW_MODEL`
and `MOTION_PEDAGOGICAL_REVIEW_MODEL`.

The visual and pedagogical reviewers are fresh, blind calls. They never
receive the Author's self-assessment, and the Author never grades its own
output.

### 6. The author prompt is generated from the MotionBrief

The request the Motion Author receives is much richer than the learner's.
`/motion explain softmax` ultimately becomes something like:

```
Create a 25-second educational motion explainer.
Learning objective: Make Softmax intuitive before showing the equation.
Audience state: Learner understands scores but has not yet learned normalization.
Primary visual metaphor: Four competitors sharing one fixed unit of attention.
Teaching sequence:
1. Show arbitrary scores 2, 1, 0, -1.
2. Demonstrate why these cannot directly be probabilities.
3. Transform them with exponentiation.
4. Show the positive quantities.
5. Add them.
6. Divide each by the total.
7. Recover 0.64, 0.24, 0.09, 0.03.
8. Show that they sum to 1.
9. Morph the concrete calculation into the Softmax equation.
Important conceptual constraints: [...]
Visual direction: [...]
Source truth: [...]
Validated storyboard: [...]
Implement the storyboard with the allowlisted renderer.
```

This author brief is internal implementation context. The learner never has
to write it.

The Author does not storyboard, render, inspect or repair on its own. The
harness owns every stage: it validates the brief and the storyboard, renders
the preview, sends the frames to fresh reviewers, decides whether a finding
is blocking, and runs at most one repair round (V1 spec §4.8).

### 7. The storyboard is a first-class artifact

The flow is learner request → MotionBrief → storyboard → preview → final
render, and the storyboard comes before any expensive rendering.

Each beat records:
- `start_time`, `end_time`
- `pedagogical_role`
- `visual_state`
- animation/change
- narration/caption
- source grounding
- transition

Example roles: hook, intuition, problem, analogy, mechanism,
bridge_to_formalism, notation, formula, implementation, takeaway.

### 8. Intuition-first is an explicit teaching mode

`/motion` is not just "animate this formula". One of its most important modes
is `intuition_first`:

```
concrete visual/story
↓
causal mechanism
↓
technical vocabulary
↓
simplified representation
↓
notation
↓
formula
```

Motion V1's canonical `teaching_mode` values are `intuition_first`,
`mechanism_first`, `code_walkthrough` and `system_flow`. Use only these
names. Future modes such as `formal_first` and `spatial_3d` may be added
later.

### 9. Analogy correctness

A cartoon, story or metaphor comes with an explicit internal mapping:

| Analogy object | Real concept |
|---|---|
| competitor | logit/category |
| score tag | raw logit |
| share of bar | Softmax probability |
| whole bar | probability mass = 1 |

The mapping also records where the analogy stops being exact. Pedagogical QA
checks it.

### 10. Motion Author responsibilities

The Motion Author receives the validated MotionBrief and storyboard. It makes
implementation-level creative choices:
- easing
- composition
- typography
- staging
- camera
- morph implementation
- character motion
- transitions
- timing refinement

It never silently changes the learning objective, factual content,
conceptual mapping, required sequence or source-backed claims. If
implementation reveals a problem with the brief, it returns a structured
failure or repair request instead of improvising new teaching content.

### 11. Visual creativity stays high

Do not overconstrain the author into template-looking output.
- **The brief fixes:** truth, pedagogy, the required beats and the semantic
  invariants.
- **The author keeps broad freedom over:** visual treatment, timing,
  choreography, transitions, typography, style and composition.

The rule is strict semantic constraints with loose visual execution, not
rigid animation templates. The strongest Opus 5.5 examples appear to benefit
from high creative agency.

### 12. `/motion` lifecycle

Policy-level order. The V1 stage-by-stage harness is §4.8 of the V1 spec;
in V1 the cost estimate and proposal (steps 5–7) are the existing
confirmation gate only.

1. resolve the target and context
2. the Motion Director creates the brief
3. validate the brief
4. generate the storyboard
5. pick the renderer and estimate the cost
6. present a proposal if it is paid
7. the user confirms
8. the Motion Author implements
9. render a low-res preview
10. visual QA
11. pedagogical QA
12. at most one repair
13. final render
14. insert the result onto the Learn canvas

### 13. Cheap planning vs expensive rendering

`/motion` never starts an expensive render straight away. There are three
stages:
- **Planning** (the MotionBrief and storyboard) is cheap.
- **Preview** (a low-resolution render) may be paid or controlled.
- **Final** (the full-resolution video) is paid.

Paid stages later follow the Usage/Credits flow: quote → explicit
confirmation → reserve → render → settle. That flow is not implemented yet.
Today only the confirmation gate (`paidRefusal`, see "Paid generation
boundary") and the `paid_proposal` exist. The Motion V1 development harness
needs no production billing; paid production rendering is deferred until
Usage & Credits exists.

### 14. Potential learner-facing UX

`/motion explain softmax` could answer with a compact proposal:

```
Softmax · 25 sec
Approach
Four scores compete for one whole.
We'll show why raw scores don't work,
then transform them into probabilities,
and finish by revealing the equation.
Style
Intuition-first · animated diagram/cartoon
[Create preview]
```

The internal author prompt is never shown to the learner. Advanced users may
eventually open **View storyboard**.

### 15. A family command, not one command per animation type

Use `/motion` and let the planner pick the visual and rendering strategy.
Do not add `/softmax-video`, `/attention-video`, `/cartoon`, `/remotion` or
`/three-video`.

The registry should eventually keep these four layers apart:
- the user-visible command family
- the generation capability
- the renderer or provider
- production readiness

### 16. Not the existing `video_generate`

- `video_generate` is a provider-generated video.
- `motion_explainer` is a code-driven pedagogical animation.

Both may produce MP4s, but they are different artifact capabilities, and
`/motion` means the second. They share storage and display: a Motion V1
result is stored through the existing LearnVideos / `LEARN_MEDIA` pipeline
and inserted as the existing `type: 'video'` block, not a new card system. A future `/video` family could cover media and
video generation separately if needed.

### 17. Routing principle

The learner states the learning intent ("`/motion explain softmax
intuitively`"), not the renderer technology ("`/motion --remotion --svg
--30fps`"). Renderer selection belongs to the system. Advanced controls may
come later, but they are not the default experience.

### 18. Softmax reference workflow

The successful Softmax storyboard experiment is the quality bar for `/motion`
planning:

```
Hook
→ raw score problem
→ intuitive normalized shares
→ morph characters into bars
→ exponentiate
→ sum
→ divide
→ morph into formula
→ takeaway
```

It works because:
- one metaphor persists throughout
- visual objects become mathematical objects
- the negative score problem is surfaced
- normalization is shown physically
- the formula arrives after understanding

### 19. Architecture principle

**The learner supplies intent. The Motion Director supplies pedagogical
direction. The Motion Author supplies visual execution.**

**Do not require learners to become prompt engineers in order to receive
excellent educational motion design.**

The planner is named the Motion Director, not a "prompt enhancer". The
architecture is:

```
user → Motion Director → pedagogical production brief → Motion Author → renderer
```

not `user → prompt enhancer → model`.

When the Tutor exists, the Tutor decides what teaching move is needed, the
Motion Director designs that move as an animation, and the Motion Author
executes it.

### 20. Status

Motion V1 development harness: authorized by the V1 spec, development
environment only. Production `/motion`, production paid rendering, Tutor
routing and broad rollout: deferred. This section is policy documentation;
it implements nothing.

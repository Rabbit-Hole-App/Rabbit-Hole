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

Execution:

- `/notebook` and `/whiteboard` insert directly.
- `/paper <arXiv id or link>` opens that paper. `/paper <topic>` opens the
  arXiv search with the topic and the learner picks a real paper; a paper is
  never invented.
- `/image <terms>` inserts an Image card that runs a photo search.
- Commands with no family (`/deeper`, `/ask` and so on) go through the
  existing Learn ask as their prompt.
- Family commands call the endpoint above.

`/source` reports that the Source inspector is not reachable from a command
yet.

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

**Deferred: Video / Motion Generation** (code-driven, source-grounded motion explainers; intuition-first teaching videos). Future, not implemented; spec in docs/features/learn-video-motion-generation.md. It is not the existing paid `video_generate` primitive. Do not add slash commands, registry entries, API routes, provider bindings, UI, billing or Tutor routing for it yet.

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

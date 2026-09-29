# Learn Artifact Generation v1

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
| Ready, paid (proposal only) | video_generate, blender_scene |
| Not generated (explicit message, no substitution) | code_exercise, narration, knowledge_graph, animation, reference_attention, maths_animation (its manim worker is not deployed), 3d_model, image_generate |
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

- **Explain on canvas** draws video and scene blocks as *proposed*: "This
  uses paid generation. [Cancel] [Generate]" on the shape. A failed job's
  Retry proposes it again.
- **Cards** (Blender scene, Video generate, Maths animation, Image generate):
  the button opens the same confirmation.
- **A paid `/` proposal** is confirmed in the composer. The card is then
  inserted with `confirmedStart` and starts once.
- **Narration** never autoplays. Explain on canvas, a whiteboard explanation,
  the whiteboard's "Read it aloud" and the Narration card all offer
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
- `/more` or a typed prefix lists every Learn command that can do something
  now. A family shows only if it has a ready or direct primitive; a command
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

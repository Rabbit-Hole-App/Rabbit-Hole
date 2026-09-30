# Rabbit Hole slash commands: shared contract

One command model for every Rabbit Hole input (user, 2026-09-28). The
definitions live in `packages/web/src/agent/slash.js` (pure: no React, no
stores). The Agent Bar reads it on smart-home. The Learn composer reads the
same module; the Learn/card branch owners wire it into their input. Do not build
a second command list.

## Ownership

| Part | Owner |
|---|---|
| Command definitions, labels and descriptions, availability, the semantic request (`learnRequest`), the selection contract, tests (`slash.test.mjs`) | smart-home |
| The `/` picker and sending inside the Learn composer (`ask.jsx`, `LearnPage.jsx`), running Learn actions, exposing selections | Learn/card branches |

smart-home does not edit `ask.jsx` or `LearnPage.jsx`.

## Places

- `home`: Home, Library, Explore (workspace scope).
- `project`: the Project hub and its Map.
- `learn`: the Learn composer.

`placeOf(scope)` maps a bar scope to a place. `commandsFor(place, { catalog })`
lists what a place can use; unavailable commands are not shown (for example
`/run` needs a job, `/new` is Home only). `descFor(command, place)` gives the
one-line description; modes read differently per place.

## Commands

| Command | Group | Places | Resolves to |
|---|---|---|---|
| /ask | mode | home, project, learn | Home/Project: the bar's ask. Learn: `{ mode: 'ask', prompt }` through the existing Learn ask |
| /teach | mode | home, project, learn | Home: the Learn handoff (resolve or create a canvas, open Learn, prefill, never send). Learn: continue teaching |
| /research | mode | home, project, learn | Home, Library, Project: find papers, docs, repositories and resources and return them in the Mothership with Open, Add to project, Add to canvas. Learn: the same, with the current concept and canvas as context; bring evidence onto the canvas without cluttering it with every result |
| /do | mode | home, project, learn | Imperative actions under the confirmation policy |
| /find /open /new /connect /run | shortcut | home, project (/new: home) | The same request as the sentence (`router.js` rule 1b). No /share: v1 is solo (see rabbit-hole-checklist.md, Solo v1) |
| /deeper /simplify /example /practice /quiz /compare | learn | learn | A prompt through the existing Learn ask, about the selection or the current concept |
| /source | learn | learn | `action: 'open_sources'` (open the Source inspector or attach evidence; never dump citations into a card) |
| /explain /flashcards /code /graph /diagram /walkthrough /animate /image /video /3d | create | learn | A tool override: the tutor returns a validated block from the command's family, or asks a clarifying question |
| /notebook /whiteboard /paper | create | learn | Deterministic inserts, no model: `insert_notebook`, `insert_whiteboard`, `insert_paper` (a known paper id) |
| /more | create | learn | `action: 'open_tool_catalog'`: the full tool catalog |

## Learn tool families (user, 2026-09-28)

Auto stays the default. A slash command is an optional override that names the
canvas primitives the tutor may return (`allowedPrimitives`). The model returns
only a validated block from that list, or asks a clarifying question; it never
picks another renderer and never writes renderer code. Primitive ids are
canonical here; the Learn branch maps them to block types.

| Command | Allowed primitives |
|---|---|
| /explain | explanation, table, narration (paid) |
| /flashcards | flashcards |
| /code | code_sample, code_exercise |
| /graph | interactive_graph, data_plot, knowledge_graph |
| /diagram | flow_diagram, mermaid_diagram |
| /walkthrough | walkthrough |
| /animate | animation, reference_attention, maths_animation (paid) |
| /whiteboard | whiteboard (deterministic) |
| /paper | paper (deterministic) |
| /image | image, image_generate (paid) |
| /video | video, video_generate (paid) |
| /3d | 3d_model, blender_scene (paid) |
| /notebook | notebook (deterministic) |
| /practice | challenge, explain_back, quiz, code_exercise |
| /quiz | quiz |
| /compare | table, interactive_graph, data_plot, flow_diagram, mermaid_diagram, animation (the tutor chooses) |

/ask, /teach, /research, /do, /deeper, /simplify, /example, /source and /more have
no family: `allowedPrimitives` is `null` (Auto).

- Paid: `primitive(id)` gives `{ id, paid: true, needsConfirm: true, estimatedCost: undefined }`
  for image_generate, video_generate, maths_animation, blender_scene and narration
  (fish.audio). They
  always need confirmation, even when named with a slash; an explicit command only
  skips the tutor's "would this help?" proposal. `estimatedCost` stays unset: never
  show a guessed amount.
- /practice subtype words narrow the family deterministically: "explain it back" gives
  explain_back, "coding" gives code_exercise, "multiple choice" gives quiz. Plain
  /practice leaves the whole family to the tutor.
- Picker (`LEARN_MENU`), in order. LEARN: /deeper Go deeper, /simplify Explain more
  simply, /example Show a concrete example, /practice Let me try it, /quiz Test me,
  /compare Compare ideas, /research Find supporting sources. CREATE: /explain Add an
  explanation, /code Add code, /graph Add a graph or plot, /diagram Add a diagram,
  /animate Add an animation, /flashcards Add flashcards, /notebook Add a notebook, /more
  More learning tools. /ask, /teach and /do stay available but uncrowded; everything
  else is reached through /more or by name. challenge, explain_back, data_plot,
  mermaid, vector_explorer, reference_attention, maths_animation and blender_scene are
  never in the primary menu.

## Product availability vs review-copy limits

The command list (`places`, `needs`) is what Rabbit Hole offers: `/ask` and
`/research` are valid in every place. The review copy adds safety limits of its
own through `reviewOff(name, kind)`, never through the product list:

- `/ask` on the workspace or an app would write live chat history, so it is off
  while `askLiveOnPreview` is false.
- `/research` outside a canvas would call the live model, so it is off here.

The picker shows such a command dimmed with "Off on this preview" and the full
reason as its tooltip.

## The semantic request

`learnRequest(name, { args, selection })` returns
`{ kind: 'learn', command, family, allowedPrimitives, deterministic, paid, prompt, context, selection }`,
plus `mode` for a mode or `action` for an action command. `context` and `selection` are the
same selection object; `paid` lists the paid primitives in `allowedPrimitives`. For example:

```js
{ kind: 'learn', command: 'teach', family: null, allowedPrimitives: null, deterministic: false, paid: [], mode: 'teach', prompt: 'causal masking', context: null, selection: null }
{ kind: 'learn', command: 'deeper', family: null, allowedPrimitives: null, deterministic: false, paid: [], prompt: 'Go one level deeper on the selected card "Attention · Guided". Focus: into the math.', context: { kind: 'card', id, title }, selection: { kind: 'card', id, title } }
{ kind: 'learn', command: 'practice', family: 'practice', allowedPrimitives: ['code_exercise'], deterministic: false, paid: [], prompt: 'Give me one practice task on the current concept and wait for my answer. Focus: coding.', context: null, selection: null }
{ kind: 'learn', command: 'image', family: 'image', allowedPrimitives: ['image', 'image_generate'], deterministic: false, paid: ['image_generate'], prompt: 'Add an image for the current concept.', context: null, selection: null }
{ kind: 'learn', command: 'notebook', family: 'notebook', allowedPrimitives: ['notebook'], deterministic: true, paid: [], action: 'insert_notebook', prompt: 'for experimenting with softmax', context: null, selection: null }
```

With no selection a learning command acts on "the current concept". A click on a
card's own control (for example "Deep dive") must produce the same request as
typing `/deeper`, so clicks, slash commands and natural language converge.

## Selection context

`context` is what the learner has selected when they send:

| kind | Shape | Available |
|---|---|---|
| `project` | `{ kind, slug, title }` | now (bar) |
| `map_node` | `{ kind, id, label, commit }` | now (bar, Map) |
| `card` | `{ kind, id, title }` | when the Learn branch exposes it |
| `equation` | `{ kind, latex, cardId }` | when a branch produces it |
| `notebook_cell` | `{ kind, index, source }` | when the notebook exposes it |
| `notebook_file` | `{ kind, path }` | when the notebook exposes it |
| `canvas_object` | `{ kind, id, type }` | when the canvas exposes it |

An unknown `kind` is an error, so a new selection type is added here first.

## Wiring notes for the Learn owners

1. Import `commandsFor`, `descFor`, `learnRequest`, `LEARN_MENU` and `primitive` from
   `agent/slash.js`. Do not import `agent/bar.js`: it carries the bar's in-memory turn store.
2. Open the picker on `/` at position 0; show `LEARN_MENU.learn`, a divider, then
   `LEARN_MENU.create`, one short line each (`descFor(command, 'learn')`). Picking inserts
   `/name ` so the learner can add arguments; Enter sends.
3. Send `learnRequest(...)`: a `prompt` goes through the existing Learn ask with
   `context` and `allowedPrimitives`; an `action` runs the matching Learn action with no
   model. Before rendering a returned block, check it is in `allowedPrimitives`, and
   confirm any block where `primitive(id).needsConfirm`.
4. `/do` destructive, external or persistent operations use the Rabbit Hole
   confirmation system.

## Shared composer shell (user, 2026-09-29)

The Mothership and the Learn composer are one system: same composer UI, different scoped behaviour.
Learn keeps its own tutor conversation; it never gets the global Mothership or a second composer.
`packages/web/src/ChatComposer.jsx` owns the shell. smart-home owns it; Learn wires it into `ask.jsx` and
`LearnPage.jsx`.

| Part | Use |
|---|---|
| Frame, input, placeholder, focus, Send and Stop | `<ChatComposer dock multiline onStop={...}>`: about 66px desktop and 58px phone, `rounded-xl`, `border-line-strong`, `shadow-pop`, 36px Send that becomes Stop while busy |
| `+` control (leading) | `COMPOSER_ADD` (36px square, `rounded-lg`, bordered; 32px wide on phones) |
| Auto / mode control (leading, after `+`) | `COMPOSER_PILL` (36px high, `rounded-lg`, bordered, `text-sm`) |
| Width | `DOCK_WIDTH`: centred, at most 780px |
| Footprint | `DOCK_PAD` on the strip under the composer, including the phone safe area |
| Context | Pills such as "Asking about: CausalSelfAttention · 3adf61e" sit above the composer, like the Map scope chips; they never change its size |

Phone order: canvas, then compact canvas controls (zoom, drawing), then the composer. Canvas controls sit
above the composer's footprint or collapse; they never overlap it. The composer is never hidden to make room.
Check: `wp6-composer-parity` in `packages/web/e2e/rabbit-hole-check.mjs` compares the two on the clone.

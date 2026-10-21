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

## Slash-command cleanup (owner, 2026-10-20)

Binding owner requests of 2026-10-20 (the L7 lane, branch `ui/slash-cleanup`). They replace the older rows below where they
disagree; the Commands table keeps its history for the retained commands.

**Removed (17):** /walkthrough, /do, /find, /open, /connect, /run, /new, /research, /more, /ask, /teach, /deeper, /simplify,
/example, /compare, /source, /paper (`REMOVED_COMMANDS`). None is in a picker, the autocomplete, the Slash commands window, an
example or a typed dispatch on any surface. Typed, each says `/<name> is no longer available. Type / to see the commands, or
ask in your own words.` (`unavailableCommand`; on the Home, Library and Project bar, where / lists nothing, `... Ask in your own
words.`) and runs nothing. Ordinary words still ask, compare, simplify, give examples
and explore; saved conversations and cards made by a removed command still open.

**Retained, per surface:**

| Surface | Commands |
|---|---|
| Chat (`learn`, `chat`) | /dive /practice /quiz /explain /flashcards /code /graph /diagram /whiteboard /image /video /cad /3d /notebook /youtube /arxiv /wikipedia; /motion in a development or review build (below); /generate-image only while image generation is on |
| Ctrl+K (`ctrlk`) | /explain /flashcards /code /graph /diagram /image /video /cad /3d /youtube /arxiv /wikipedia; /motion in a development or review build; /generate-image only while image generation is on |
| Insert menu (`insert`) | /youtube /arxiv /wikipedia |
| Home, Library, Project bar (`home`, `project`) | none: the bar takes plain words (`router.js`), and has no Auto picker, mode pill or / commands sheet |

**Two labels, never a `/name`:** `desc` is the menu label (the picker row), `label` the short pill label; a command with no
short label shows its menu label in the pill (`labelOf`). /explain: menu and pill "Add explanation"; /dive: "Open Rabbit
Hole"; /3d: menu "Add 3D scene", pill "3D"; /image "Search images"; /generate-image "Generate image"; /video "Generate
video"; /youtube "Search YouTube". `about` is the Slash commands window's sentence: whether the command creates a card,
opens a Rabbit Hole or searches, and what it needs selected.

**Media:** search and generation are separate commands. /image only searches photos (family `image`) and its card says
"Sourced · Photo by … on Pexels"; /generate-image only generates (family `image_generate`, paid, confirms first) and is
hidden and refused while `IMAGE_GENERATION` is off, which follows `isReady('image_generate')` (false: this cleanup does
not enable paid images); /video only generates (family `video_generate`, paid, confirms first) and its card says
"AI-generated video, not real footage."; /youtube only searches, and its moment card says "Sourced · YouTube".

**The Tutor's material tools** (`MATERIAL_TOOLS`: compare, walkthrough) are no longer typed commands but stay internal: the
Tutor's `create_material` (`materialCommands`, `runMaterials` with `internal: true`), journey steps (`make.command`,
`/api/learn/artifact`), and Ctrl+K's automatic routing from plain words still make comparison tables and walkthroughs.
/practice keeps challenges and explain-backs. `commandsFor(place, { internal: true })` and `resolveCommand(text, surface, {
internal: true })` reach them; nothing a learner types does.

**Removed dispatch paths and their replacements:**

| Removed path | Replacement |
|---|---|
| Bar `router.js` rule 1 (`/ask`, `/teach`, `/research`, `/do` to a mode) | Unknown-command note (`unavailableCommand`). Plain words: a learning request ("teach me …") still routes as teach; a question asks |
| Bar `router.js` rule 1b (`/find`, `/open`, `/new`, `/connect`, `/run`) | Unknown-command note. Their sentences still run: "find nanoGPT", "open my last project", "new canvas", "connect karpathy/minGPT", "run s3-log" |
| Bar Auto picker, mode and shortcut pills, `BarCommandsSheet.jsx` | Removed: the bar has no commands left |
| Chat `LearnPage.jsx` `tutor.slash(...)` for /deeper /simplify /ask /teach | Unavailable notice; the same words without the slash are an ordinary Tutor turn. The Tutor's slash row (`learn-tutor.js` `SLASHES`, `fixedSlash`, `MODE_SLASHES`; worker `EXPLICIT_MODE`) has no UI caller and is left for the Tutor owners to remove |
| Chat /deeper /simplify /example (`{ prompt }` to the Learn ask) | Unavailable notice; ask in words |
| Chat /more (`open_tool_catalog`) | The picker's More learning tools section and the Slash commands window list every command |
| Chat /source (`open_sources`) | The card's Sources & evidence disclosure and its context menu |
| Chat /paper (`insert_paper`) | /arxiv (topic, ID or link) and the arXiv finder; existing paper cards and PDFs are unchanged |
| Chat /compare, /walkthrough | Plain words to the Tutor; the Tutor's material tools (above) |
| Ctrl+K `NOTE_COMMANDS` (/simplify /example /deeper as the note path) and the worker's `PROMPT_ROOM` | Unavailable (`planRoute`, `fixedRoute`); plain words ("explain it more simply") take the note path or JEV routing |
| Ctrl+K typed /walkthrough, /compare | Unavailable; JEV still routes plain words to the walkthrough and compare routes |

## /motion replaces /animate (owner, 2026-10-20, lane L8)

**/motion** is the command for the Motion explainer-video pipeline: the existing `motion_request` operation, which the Motion
orchestrator plans, reviews and renders (rabbit-hole-motion-v1-harness-spec.md). Menu line "Create an animated explainer
video", pill "Motion", Create menu in /animate's place, Slash commands window "AI-generated", e.g. `/motion 15s explain me
softmax func`. The proposal makes no request; Generate inserts the video card already confirmed; LearnVideos keeps the paid
gate (`confirmed`), one generating job at a time and the saved-video limit; the orchestrator keeps its call cap and budget.

**Where it is offered:** a development or review build (`VITE_COACHING_DEV`: the isolated dev clones, local stacks) and the
local Motion stack's build (`VITE_MOTION_DEV`) (`MOTION_DEV` in agent/slash.js). The production build sets neither
(`scripts/prod-release.mjs` strips both), so production and preview have no /motion; typed there it says "Motion (animated
explainer videos) is not available here." and runs nothing. Generate also needs `MOTION_ORCHESTRATOR_URL` and
`MOTION_ORCHESTRATOR_TOKEN` on the worker; only the local Motion stack sets them. Elsewhere the worker refuses the start
before any provider call: the card says "Motion is not available in this environment yet. Nothing was started." and stays
retryable, and nothing is recorded or stored.

**/animate** is removed from every user surface (`REMOVED_COMMANDS`: picker, window, examples, typed lines) and from new
chat-answer suggestions (`chat-answer-meta.js` no longer offers `animate`). It stays a Tutor material tool
(`MATERIAL_TOOLS`), so create_material, journey steps and Ctrl+K automatic routing still make animations, and saved
animation, maths-animation and video cards keep their renderers.

**The window's example** is a real Motion video: the final.mp4 of the verified job 8a2015a4 (M7B production-exact API smoke),
committed at `packages/web/public/lesson-assets/motion-softmax-8a2015a4.mp4` (sha256 `6af0b4b2…437c46`), with that job's
request, title, duration, renderer and sources. Static assets are served without byte ranges, so the window plays it from
a blob URL, which seeks; opening the window fetches only that file.

## Places

- `home`: Home, Library, Explore (workspace scope).
- `project`: the Project hub and its Map.
- `learn`: the Learn composer (the canvas Chat; `commandsFor('chat')` is the same list).
- `ctrlk`: the canvas's inline Ctrl+K editor (Release B, owner 2026-10-16; /walkthrough removed 2026-10-20): exactly
  /explain /code /graph /diagram /flashcards /image /video /cad /3d /motion /youtube /arxiv /wikipedia (/animate removed the same day,
  /motion in development and review builds). Anything
  else typed there is reported as unavailable in Ctrl+K and sends nothing.
- `insert`: the canvas Insert menu's source searches (/youtube /arxiv /wikipedia).

Each command also has a `kind` (`generate`, `source`, `prompt`, `dialog`), an optional `label` (its name in words, as
the pill's "Remove <label>": /video "Generate video", /youtube "Search YouTube", /arxiv "Search arXiv", /wikipedia
"Search Wikipedia"; otherwise the capitalised name) and `hidden` for typed-only commands (/paper). `commandsFor` leaves
hidden commands out unless asked (`{ hidden: true }`); `resolveCommand(text, surface)` turns a typed line into the
same entry a picker lists (`{ command, arg }`), `{ unsupported: name }`, or `null` when the line is not a command.

`placeOf(scope)` maps a bar scope to a place. `commandsFor(place, { catalog })`
lists what a place can use; unavailable commands are not shown (for example
`/run` needs a job, `/new` is Home only). `descFor(command, place)` gives the
one-line description; modes read differently per place.

## Commands

| Command | Group | Places | Resolves to |
|---|---|---|---|
| /ask | mode | home, project, learn | Home/Project: the bar's ask. Learn: `{ mode: 'ask', prompt }` through the existing Learn ask |
| /teach | mode | home, project, learn | Home: the Learn handoff (resolve or create a canvas, open Learn, prefill, never send). Learn: continue teaching |
| /research | mode | home, project (not on canvases, owner 2026-10-06) | Home, Library, Project: find papers, docs, repositories and resources and return them in the Mothership with Open, Add to project, Add to canvas. Learn: the same, with the current concept and canvas as context; bring evidence onto the canvas without cluttering it with every result |
| /do | mode | home, project (not on canvases, owner 2026-10-06) | Imperative actions under the confirmation policy |
| /find /open /new /connect /run | shortcut | home, project (/new: home) | The same request as the sentence (`router.js` rule 1b). No /share: v1 is solo (see rabbit-hole-checklist.md, Solo v1) |
| /deeper /simplify /example /practice /quiz /compare | learn | learn | A prompt through the existing Learn ask, about the selection or the current concept |
| /dive | learn | learn | `action: 'dive'`: open a nested Rabbit Hole from the selected card; with no card it makes a topic anchor card from the request and dives from that; bare /dive with no card and no referent asks what to go deeper into (docs/features/dive-v1.md). No model call |
| /source | learn | learn | `action: 'open_sources'` (open the Source inspector or attach evidence; never dump citations into a card) |
| /explain /flashcards /code /graph /diagram /walkthrough /animate /image /video /3d | create | learn | A tool override: the tutor returns a validated block from the command's family, or asks a clarifying question |
| /notebook /whiteboard /paper | create | learn | Deterministic inserts, no model: `insert_notebook`, `insert_whiteboard`, `insert_paper` (a known paper id opens directly; a topic opens the arXiv search). /paper is typed only since Release B (owner, 2026-10-16): /arxiv is the listed paper search |
| /youtube /arxiv /wikipedia | source | learn, ctrlk, insert | `action: 'open_source'`: the shared source finder opens on that source with the query and searches at once (an empty query waits); results are previewed and nothing is added until the learner adds one. No model call. /arxiv takes a topic or an arXiv ID or link; /youtube finds existing videos, /video generates a new clip. One opener for Chat, Ctrl+K and Insert: `openSourceFinder` (packages/web/src/source-finder.js); a result is previewed on click and added by Add to canvas. The top-bar Search control is gone (owner 5A): `/` outside editable fields focuses the right panel's canvas Find |
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
| /animate | animation, reference_attention, maths_animation (paid); a Tutor material tool since 2026-10-20, no longer typed |
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
- Picker (`LEARN_MENU`), in order. LEARN: /deeper Go deeper, /dive Go down a Rabbit Hole, /simplify Explain more
  simply, /example Show a concrete example, /practice Let me try it, /quiz Test me,
  /compare Compare ideas. CREATE: /explain Add an
  explanation, /code Add code, /graph Add a graph or plot, /diagram Add a diagram,
  /animate Add an animation, /flashcards Add flashcards, /notebook Add a notebook, /more
  More learning tools. /ask and /teach stay available but uncrowded; everything
  else is reached through /more or by name. challenge, explain_back, data_plot,
  mermaid, vector_explorer, reference_attention, maths_animation and blender_scene are
  never in the primary menu.

## Product availability vs review-copy limits

The command list (`places`, `needs`) is what Rabbit Hole offers: `/ask` is valid
in every place; `/research` and `/do` on Home, Library and projects only - never on a
canvas (owner, 2026-10-06), where natural typing with a selected card is the way in. The review copy adds safety limits of its
own through `reviewOff(name, kind)`, never through the product list:

- `/ask` on an app would write live chat history, so it is off while
  `askLiveOnPreview` is false. On Home it is on: a Home question goes to
  `/api/learn/home-ask` (LEARN_DB), as a typed question already did (r28 audit).
- `/research` outside a canvas would call the live model, so it is off here. It
  is also unwired in the bar (`AgentBar.jsx`).

A command refused in a scope is not offered there (r28 audit, owner 2026-10-08:
"if we need to remove any"): `modesFor` lists only the modes the scope can
run, so the bar never offers `/research`, and an app page offers only `/do`.
Typed by name, a refused command still says why. The registry entry, `reviewOff`
and the router rule stay, so turning a limit off brings the command back.

Every command offered by a picker has a demo in that picker's Slash commands
sheet, and every other registry command is named with its reason in
`slash-sheet.test.mjs` (`NOT_OFFERED`: `/research`, and `/more`, which opens the
full list and is never a row).

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
| Width | `DOCK_WIDTH`: centred, at most 780px (the Learn composer). The global dock spans the workspace instead (below) |
| Footprint | `DOCK_PAD` on the strip under the composer, including the phone safe area |
| Context | Pills such as "Asking about: CausalSelfAttention · 3adf61e" sit above the composer, like the Map scope chips; they never change its size |

Phone order: canvas, then compact canvas controls (zoom, drawing), then the composer. Canvas controls sit
above the composer's footprint or collapse; they never overlap it. The composer is never hidden to make room.
Check: `wp6-composer-parity` in `packages/web/e2e/rabbit-hole-check.mjs` compares the two on the clone.

Since 2026-10-06 the global composer is workspace chrome ([workspace-dock.md](workspace-dock.md)): it spans the
workspace from the sidebar to the window edge and passes `flat`, a hairline shadow instead of `shadow-pop`. Height,
radius, border, `+`, Auto and Send stay shared; the Learn composer keeps its float and width. `wp6-composer-parity`'s
shadow comparison predates this and needs the same exception.

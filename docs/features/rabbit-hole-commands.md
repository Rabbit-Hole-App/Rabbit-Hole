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

## The 18 commands (owner spec 2026-10-29, slash commands cleanup)

Binding. It supersedes the Places and Commands rows below, the 2026-10-20 retained-per-surface lists and the Ctrl+K set of
Release B wherever they disagree; those sections are history.

**Catalogue** (`agent/slash.js` `SLASH`, sections `LEARN_MENU`, shared by the Chat picker, Ctrl+K and View > Slash Commands):

| Section | Commands (display name; typed with a leading /) |
|---|---|
| Learn | explain, practice, quiz, flashcards, goal |
| Create | code, graph, diagram, notebook, image, motion, cad, 3d, browser |
| Search | photos, youtube, arxiv, wikipedia |

Stable ids are unchanged: typed /photos is id `image`, typed /image is id `generate-image` (alias /generate-image, not a 19th
command). /image needs the server's image offer and /motion a Motion build; where either is off it is not listed and, typed, says
why on both surfaces. Explain Back is a mode of the Practice card (/practice explain it back: ...), never a command.

**Removed:** /dive, /whiteboard and /video (`REMOVED_COMMANDS`). Typed on any surface, each says it is no longer available and
runs nothing. The Tutor keeps whiteboard and video as internal material tools (`MATERIAL_TOOLS`); saved Whiteboard and Video cards,
Motion, Rabbit Hole navigation and Start Rabbit Hole (the card menu) stay. A Rabbit Hole about a topic with no card (the old
`/dive <topic>` anchor) has no entry point now.

**Added:** /browser, the existing saved webpage capture (`insertWebpage`): no URL opens the address dialog; a URL is checked by the
paste rule (`canvas-paste.js isWebUrl`) and captured; anything else keeps the line and asks for a full https:// address. It is
never a web search and never an interactive browser.

**One dispatcher.** Ctrl+K offers the same list (`inline-ai-command.js ctrlkCommands`) and hands every explicit command to Chat
as its typed line about Ctrl+K's own selection (`submission` -> `{ handoff }`, LearnPage `handoff` -> `chat-workspace ask({ line,
about })` -> LearnSlash `handoff`): Chat runs it through `runLearnCommand` exactly as if typed there, without touching the Chat
draft (a kept line only fills an empty composer). A turn asked while Chat is opening waits for its send loop (up to 8 s); while
another command runs in Chat the line stays in Ctrl+K and says so. Nothing is checked or generated in Ctrl+K for an explicit
command, and the inline `/diagram` shapes alias is never reached by one. The source searches keep Ctrl+K's own finder (result
choice, placement and focus return); plain words keep the inline editor.

**Bare commands and optional words:** /notebook (empty notebook; words never write one), /goal (Learning goals; words prefill an
unsaved goal), /browser (address dialog), /photos (the photo-search card), /youtube, /arxiv, /wikipedia (the finder on that
source) work with no words. The eleven generators need a subject: their words, else the selected card; with neither they ask and
keep the line. A bare /explain about a selected card runs the same explicit Explain job.

**Enter:** a command typed in full (`/notebook`, an exact typed name or alias) runs on that Enter in Chat and Ctrl+K
(`learn-slash.js exactCommand`); a partial word accepts the highlighted suggestion and the next Enter sends.

**Briefs:** explain, practice, quiz, flashcards, code, graph, diagram, image, motion, cad and 3d prepare a brief before anything is
made. Explain, Motion, Image and CAD keep their own planners and approval; the seven simple ones use the compact brief of
`material-brief.js` (docs/features/generation-review-contract.md section 7b).

**Display:** marks and pills show the typed name without its slash (`explain`, `photos`, `3d`); the slash stays in typed syntax,
copyable examples and saved messages. A pill's x is named by the command's title (Remove Photo search).

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
| Chat (`learn`, `chat`) | /dive /practice /quiz /explain /flashcards /code /graph /diagram /whiteboard /photos /video /cad /3d /notebook /youtube /arxiv /wikipedia; /motion in a development or review build (below); /image only while image generation is on |
| Ctrl+K (`ctrlk`) | /explain /flashcards /code /graph /diagram /photos /video /cad /3d /youtube /arxiv /wikipedia; /motion in a development or review build; /image only while image generation is on |
| Insert menu (`insert`) | /youtube /arxiv /wikipedia |
| Home, Library, Project bar (`home`, `project`) | none: the bar takes plain words (`router.js`), and has no Auto picker, mode pill or / commands sheet |

**Typed names and stable ids (owner, 2026-10-26: `/image` generates, `/photos` searches).** Each registry entry has a stable
`name` (its id) and may have `typed` (what a learner types) and `aliases` (more typed names that still work):

| Typed | Id | Menu label | Notes |
|---|---|---|---|
| /photos | `image` | Search photos | The photo search (what /image was until 2026-10-26). Always available; no model |
| /image | `generate-image` | Generate image | The paid generation (four models, asks first). Offered only where the server lists this person (owner-only today) |
| /generate-image | `generate-image` | Generate image | Alias of /image; resolves to the same entry and runs the same flow |
| /imagine | none | none | Not a command: typed, it is "not a Learn command" |

Migration rule (what an old saved chat, link or bookmark does):
- Everything SAVED or sent between parts names an id, and ids never change meaning: a message's `command` metadata, a composer
  draft's pill, a signed proposal's `command`, the chat router's capability ids, Ctrl+K's routes, the Tutor's `create_material`
  commands, journey `make.command` and suggestion chips (`capabilityId`). An old message saved by the old /image has `command: image`
  and still reads as the photo search (pill "Search photos"); `generate-image` messages and proposals still read "Generate image".
  Nothing is rewritten or remapped. The server keeps saving `/generate-image <words>` with `command: generate-image`.
- Only a TYPED line goes through the typed layer (`resolveCommand`, `idOfTyped` in `agent/slash.js`; `explicitCommand` for
  Ctrl+K and the chat route; `lineCommand` in `learn-slash.js`). Every line BUILT from an id goes through `typedOf`
  (`commandLine`, the picker's choose, Use example, `materialLine`, Ctrl+K's request line, the router's `intercept`).
- A saved line with no `command` metadata names an id (`sentCommand`): an old `/image Mount Fuji` is the photo search.
- The one behaviour change is a person typing `/image` (or pasting an old `/image <terms>` into the composer): it is now the
  paid generation, which asks before anything is spent and is owner-only; where image generation is off it says "Image
  generation is not available here. /photos searches for real photos." and runs nothing. Nothing paid ever starts from a typed
  line without the plan card's Generate.
- `unavailableCommand` takes what was TYPED (the string `image` means the generation there); a caller holding an id passes
  `typedOf(id)` (`chat-capability-route.js`, Ctrl+K's route and decide). `slash.test.mjs` and `chat-capability-route.test.js` hold this.

**Two labels, never a `/name`:** `desc` is the menu label (the picker row), `label` the short pill label; a command with no
short label shows its menu label in the pill (`labelOf`). /explain: menu and pill "Add explanation"; /dive: "Open Rabbit
Hole"; /3d: menu "Add 3D scene", pill "3D"; /photos "Search photos"; /image "Generate image"; /video "Generate
video"; /youtube "Search YouTube". `about` is the Slash commands window's sentence: whether the command creates a card,
opens a Rabbit Hole or searches, and what it needs selected.

**Media:** search and generation are separate commands. /photos only searches photos (family `image`) and its card says
"Sourced · Photo by … on Pexels"; /image only generates (family `image_generate`, paid, confirms first) and is
hidden and refused while `IMAGE_GENERATION` is off, which follows `isReady('image_generate')` (false: this cleanup does
not enable paid images); typed while it is off, /image (or its alias /generate-image) says "Image generation is not
available here. /photos searches for real photos." and runs nothing; /video only generates (family `video_generate`, paid, confirms first) and its card says
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
before any provider call: the card says "Motion is not available in this environment yet. Nothing was started.", with
"No credits charged · reservation released", and offers no start action: the server offers none, not even Generate again, while
Motion cannot start (control-plane `learn-video.js` `motionRecovery`: every recovery action and `regenerate` need Motion to be
startable; owner message 38, "only the actions that can run now"). With an orchestrator configured a failed card offers
Generate again. This is a refused Generate, not a refused proposal. A refused PROPOSAL (MOT-22: the server refused the start
for its proposal, for example because a newer version exists) is different: the card is marked "Not generated" with the
reason, is never the card the proposal made, and releases the proposal card's one-press guard, so its Generate works again
after the settings change. Browser checks: `motion-command-check.mjs` step "MOCKED refusal for its proposal (MOT-22)" and step
"REAL refusal".

**Routing in Auto mode (owner, 2026-10-24, ledger 69b00255).** An explicit `/motion` command (typed, picked, Ctrl+K, a
retry) requests the Motion review and confirmation flow in every Chat mode, Auto included: the command's words go to
`/api/learn/ask` with `command: 'motion'` and the chat route proposes it on the shared card (`chat-route.js` `tutorTurn`
`explicit`, set in `ask.jsx` from `reviewRequired(commandName)`); the Tutor's plan route never answers it. Ordinary prose that
merely mentions motion has no command and stays under normal Tutor routing; the Tutor may still offer Motion through its own
paths (create_material, suggestions), each of which ends on the same proposal card. A bare `/motion` asks "What should the video
explain?" inside the command (the line is kept) instead of starting anything. Recognising the command is not permission to
generate: Generate on the card still needs the existing confirmation, readiness and credit checks. Before 2026-10-24 a typed
`/motion` in Auto went to the Tutor and showed no card (from the 2026-10-14 mode-aware routing); regression tests:
`packages/web/src/motion-auto-route.test.mjs`; browser check: `motion-command-check.mjs`.
`/image <words>` (id `generate-image`, where the server offers it) follows the same rule (ledger c030d623): `ask.jsx` routes with
`learn-slash.js` `promptsChat`, the test that also makes the line the chat route's turn, so with an active Tutor in Auto or Tutor mode the
words get the server-made plan card (`imagePlan`), not a Tutor answer. Before this the Tutor answered them and no plan card appeared;
regression test: `packages/web/src/image-auto-route.test.mjs`.

**One submit is one user turn (bug lane 3aba249a, owner report 2026-10-26: one `/motion 15s explain photosynthesis, 16:9` showed two
identical user bubbles).** A submitted `/` line has exactly one owner that records its user message. The Chat records it itself
(`ask.jsx` `recordCommand`, saved through the idempotent `turnSaver`) when `runLearnCommand` runs the command; the chat route records
it (`send` -> `begin`, saved by `/api/learn/ask`) when `runLearnCommand` answers `{ prompt }`. `learn-slash.js` `answersInChat` says
which, and it must agree with `runLearnCommand`. It did not: it listed `motion` in its own `RUN_ACTIONS` and had no case for `/image`
(`generate-image`, where the server offers it), while `runLearnCommand` answers both with `{ prompt }` (`reviewRequired`, and the
`imageGenerationLive()` branch), so both paths recorded the line (a bubble and a persisted message each; the page's copy kept the
`/motion` prefix, the chat turn's did not). Now `answersInChat` reads the same two tests (`reviewRequired`, the capability
declaration's `flow: 'proposal'`, and `/image` where offered), each with words; a bare `/motion` still asks for its words and the Chat
records it. No list of its own: a new proposal capability needs only its declaration. Identical words sent again are a new
submission (a new turn id) and stay a separate turn; nothing is deduplicated by text. The `/api/learn/ask` request carries no client
idempotency key and the page never re-sends it by itself (a Retry after a failed route is a new submission whose first attempt left no
turn), so one owner per line is what keeps the persisted thread to one user message. Tests: `chat-turn-owner.test.mjs` (every Learn
command line, Motion on and image generation offered, is exactly one user turn; fails on 506bdf90), `chat-output-refs.test.mjs`,
`motion-command-check.mjs` (typed `/motion`, the Motion pill, the repeated `/motion` and the reload: one user bubble per turn and no
user message saved by the page itself). Read-only inspection of an affected production thread:
`scripts/chat-turn-inspect.mjs` (SELECT only; persisted messages, proposals, Generate presses and usage rows for a thread).

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
  /explain /code /graph /diagram /flashcards /photos /video /cad /3d /motion /youtube /arxiv /wikipedia (/animate removed the same day,
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
| /explain /flashcards /code /graph /diagram /walkthrough /animate /photos /image /video /3d | create | learn | A tool override: the tutor returns a validated block from the command's family, or asks a clarifying question |
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
| /photos | image |
| /image | image_generate (paid) |
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

## Slash Commands window (owner spec 2026-10-29 sections 7 to 9)

Opened from **View > Slash Commands** (the canvas menubar, `canvas-menus.js` `onSlashCommands`; a canvas with no Chat composer has no
row) and from the / palette's help button; both open LearnPage's `slashHelpOpen` sheet. Opening it leaves the Chat draft as written.

- Copy: title **Slash Commands**; subtitle **Choose a command to see what it does and try an example.**; search **Find a command**;
  **Use example**; **View brief** / **View result**; note **Example preview. Nothing is generated or saved here.**
- It lists `pickerSections('/')` (Learn, Create, Search), so it shows what the picker offers in this build. Each command shows its
  registry title (`desc`), description (`about`) and example (`learn-slash.js` `EXAMPLES`), then one preview on the example's
  subject (`slash-sheet.js` `PREVIEWS`, help/demo data only). Generators show the finished result; View brief shows the same
  stage's brief in the shared `GenerationProposalCard` with no action allowed (`slash-sheet.js` `BRIEFS`, `briefView`).
- Use example closes the window and calls `chat.composer.prepare({ command, text })`: the command pill and the example's words,
  after any draft already written (chat-draft.js A6). It never sends.
- Fit (`SlashCommandPreview.jsx`): the stage is measured (ResizeObserver); a card takes at most its canvas size and at most the
  stage, and a card whose content keeps a shape (an explanation's scene, a video) is narrowed or shortened until the whole card
  fits. No outer scroller. Desktop: dialog `min(1120px, 100vw - 32px)` by `100dvh - 32px`, 16px padding, 224px command column, 16px
  gap, 12px pane padding. Below 900px the column becomes a search and a selector above the preview; on a phone the dialog takes
  the full screen with 12px padding and 44px controls.
- Isolation: Learning Goals runs on coaching of its own whose saves say nothing is saved; the finder is `SearchBar.jsx`'s
  `FinderPanel` presentation on fixture results (no search, no remembered source, Add to canvas adds nothing); the notebook is
  `NotebookBody preview` (no notebook site, kernel or save); Speak, Find, Generate and paid starts inside a card do nothing; the
  practice card's feedback is canned and labelled as an example.
- Previews with no matching saved result say so instead of showing another subject: `/image` and `/cad` show their brief only,
  `/browser` states that no capture ships with the window, and `/photos`, `/youtube` and `/wikipedia` show the search with no
  results ("This window does not search"). `/arxiv` shows arXiv 1706.03762's real record.
- Checks: `slash-sheet.test.mjs`, `canvas-menus.test.mjs`; browser: `e2e/slash-sheet-check.mjs`, `e2e/view-menu-check.mjs` (17).

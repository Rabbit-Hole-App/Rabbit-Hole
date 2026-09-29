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
| /find /open /new /connect /run /share | shortcut | home, project (/new: home) | The same request as the sentence (`router.js` rule 1b) |
| /deeper /simplify /example /practice /quiz /compare | learn | learn | A prompt through the existing Learn ask, about the selection or the current concept |
| /source | learn | learn | `action: 'open_sources'` (open the Source inspector or attach evidence; never dump citations into a card) |
| /notebook | learn | learn | `action: 'insert_notebook'` (insert the embedded Jupyter workspace) |

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

`learnRequest(name, { args, selection })` returns one of:

```js
{ kind: 'learn', command: 'teach', mode: 'teach', prompt: 'causal masking', context: null }
{ kind: 'learn', command: 'deeper', prompt: 'Go one level deeper on the selected card "Attention · Guided". Focus: into the math.', context: { kind: 'card', id, title } }
{ kind: 'learn', command: 'notebook', action: 'insert_notebook', prompt: 'for experimenting with softmax', context: null }
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

1. Import `commandsFor`, `descFor`, `learnRequest` from `agent/slash.js`. Do not
   import `agent/bar.js`: it carries the bar's in-memory turn store.
2. Open the picker on `/` at position 0; show modes, a divider, then the learning
   shortcuts, one short line each. Picking inserts `/name ` so the learner can add
   arguments; Enter sends.
3. Send `learnRequest(...)`: a `prompt` goes through the existing Learn ask with
   `context`; an `action` runs the matching Learn action.
4. `/do` destructive, external or persistent operations use the Rabbit Hole
   confirmation system.

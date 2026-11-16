# Learn sections: the interfaces between lanes

Fixed by the integrator before the lanes start, so no lane invents a variant. A lane that needs a change writes it in BLOCKERS.md under "Decisions taken alone" and keeps to this shape until the integrator changes this file.

## Server actions (CORE, `POST /api/learn/codebase`, in `learn-codebase-source-map.js`)
All take `{ action, app, board, sectionId, ... }` and are charged and refunded like `learn_plan` (same 429 and refund handling).

| action | body | returns |
|---|---|---|
| `learn_section_brief` | `{ sectionId, redo? }` | `{ brief }` (A §4 shape, plus E) or `{ error, words }` |
| `learn_section_compose` | `{ sectionId, redo? }` | `{ composition }` (B §4 shape, plus D) or `{ error, words }` |
| `learn_section_make` | `{ sectionId, itemId }` | `{ item: { itemId, command, lead, follow }, perform, next }` or `{ skipped: { itemId, note }, next }` |
| `learn_section_made` | `{ sectionId, itemId, cardId?, jobId?, highlight? }` | `{ ok: true }`; appends to `made[]` |
| `learn_section_next` | `{ sectionId }` | `{ currentSectionId }`; the dev row **Next section** |

- `next` is the next `itemId` in composition order, or `'notes'` after the last item (G: the section notes, a `document` item Make adds), or `null` when the section is made.
- `itemId: 'notes'` is valid for `learn_section_make` once every composed item is made or skipped.
- Storage: table `learn_sections` (A §8). `checkpoint.learn` gains `currentSectionId` and `sections: [{ id, status }]` only.

## Make: one module per tool (server, `packages/control-plane/src/learn-section-make/<command>.js`)
CORE owns the dispatcher (`learn-section-make.js`) and `explanation.js`, `document.js`. TOOLS owns `code.js`, `diagram.js`, `graph.js`, `notebook.js`, `youtube.js`, `arxiv.js`, `wikipedia.js`, `browser.js`. Each module exports:

```js
export const fields = { /* JSON-schema properties of submit_item beyond lead and follow */ };
export const required = [ /* names in fields that are required */ ];
export const tools = [ /* research tool names this item may call inside the Make turn, from:
  'read_source', 'search_code', 'get_relationships', 'read_arxiv_paper', 'search_arxiv',
  'read_wikipedia', 'search_wikipedia', 'find_video_moments', 'search_web' */ ];
// input: the model's submit_item input (lead, follow and fields). ctx: see below.
// -> { error: 'sentence for the re-ask' } | { perform, record? }   (record: extra fields stored on made[])
export async function validate(input, ctx) {}
```

`ctx = { env, item, beat, brief, composition, section, plan, repo, commit, snapshot, readSource(path, start, end), taught, depth, earlier, turn }`:
- `item`: the compose item (`id, beatId, command, request, requirements, lookFor, why, source, content, after`).
- `beat`: its brief beat; `taught`: the ideas and terms of earlier beats and sections; `depth`: the learner's stored depth.
- `earlier`: this section's items already made (`{ itemId, command, perform, record }`), for `after` pairings and notebook buildup.
- `turn`: what the research tools returned in this Make turn (`{ papers: { id: { pages } }, wiki: { title: { sections } }, videos: [...], web: [...] }`), so a validator checks quotes against what was really read.

CORE's dispatcher adds `lead` and `follow` (C §0 and §4c caps) and validates them itself.

## `perform`: what the browser does (BROWSER, `packages/web/src/learn-section-perform.js`)
`performItem({ canvasApi, slash, perform, item }) -> Promise<{ cardId | jobId, highlight? }>`, then the browser calls `learn_section_made`. Every item also gets its `lead` before the card and its `follow` after, as `doc` blocks (C §11d), tagged `block.learn = { sectionId, itemId, role: 'lead'|'card'|'follow' }` and placed with `besideSpot`.

| `perform.op` | fields | browser does |
|---|---|---|
| `slash` | `line`, `depth?`, `context?`, `madeBy: 'learn-section'` | `slashRef.current.intercept(line, { depth, context, madeBy })` (explanation, code example, diagram, graph); `learn-slash.js` puts `depth`, `context` and `madeBy` on the `/api/learn/artifact` body |
| `codeCards` | `cards: [{ path, start, end, nodeId?, label, ranges: [{ id, start, end }] }]` | `insertCodeCards` with `repoCodeCard({ app, repo, commit, ... })`, connectors between consecutive cards |
| `doc` | `markdown` | `newDocBlock()` + `tryParseMarkdownToBlocks(markdown)` (a reading or the notes) |
| `notebook` | `files: [{ path, content }]`, `activePath`, `runtime: [{ path, cell, package }]` | `canvasApi.insertNotebook(block)` |
| `video` | `videoId, title, channel, start, end` | `canvasApi.addVideo(...)` |
| `paper` | `id, pages: [{ page, quote, figure? }]` | `canvasApi.addPaper({ id, page })` per page, quote stored to paint on open (S) |
| `wiki` | `title, section, quote` | `canvasApi.addWiki({ title, section })`, quote highlight through `learn-wiki-highlights.js` |
| `webpage` | `url, quotes: [string]` | `canvasApi.insertWebpage(url)`, quotes anchored and highlighted when the capture is ready |

Pairing (`item.after`): the browser draws a connector from the `after` item's card to this item's card.

## Artifact request (TOOLS reads, BROWSER sends)
`/api/learn/artifact` body gains optional `madeBy: 'learn-section'` and `context` (already a field). `learn-artifact.js` passes `madeBy` to the primitive checks (O). A client-sent `madeBy` unlocks only the larger code sample; it changes nothing else.

## Research tools inside a turn (CORE, `packages/control-plane/src/learn-section-research.js`)
CORE owns this module: `researchToolDefs(names)` (native tool definitions) and `researchTool(name, input, ctx) -> { content, turn }` that calls the EXISTING functions (`repository-context.js repositoryTool` for the repository tools, `arxiv.js` for `read_arxiv_paper` / `search_arxiv`, `learn-wiki.js` for `read_wikipedia` / `search_wikipedia`, `learn-youtube.js` for `find_video_moments`, `learn-search.js discoverSources` for `search_web`, `searchCanvasSource` for the brief's `search_material`) and records what was read into `ctx.turn`. TOOLS changes the internals of those existing modules (S: `read_arxiv_paper` page text per page; the YouTube window bound) but not this wrapper; a TOOLS validator reads `ctx.turn` only. Exa and model spend go through the existing admission and `exaCost`.

## Notebook runtime list (BROWSER, `packages/web/src/notebook-runtime.js`)
`export const RUNTIME_PACKAGES` (a frozen array of importable top-level module names in today's Pyodide, standard library included) and `export function unavailableImports(code) -> [packageName]`. TOOLS' `notebook.js` imports it from `../../web/src/notebook-runtime.js`, as `chat-tools.js` imports web modules.

## Section-flow tool set (CORE, `chat-tools.js`)
`directTools(env, email, { sectionFlow: true })` returns the ordinary set minus `explain`, plus `explanation`, `notebook`, `document` and `browser`. With no options it returns exactly what it returns today.

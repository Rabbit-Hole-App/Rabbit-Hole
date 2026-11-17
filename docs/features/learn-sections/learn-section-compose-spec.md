# Learn section composition — the medium per beat (owner 2026-11-15 23:11; spec B of three; v1.1 00:45 with the browser card and §8 How to build; written against rehearsal/mvp f881b982)

Second step for a current section: given its brief (spec A), decide **how** each beat is delivered — which of the product's own commands makes or finds it, with the exact request that command's handler would receive. Nothing executes here: the result is a list of requests, stored; running them on the canvas is the next slice.

## 0. What exists (read)
- `chat-tools.js directTools(env, email)`: the model's tool list generated from the command registry (`inline-ai-route.js CHAT_CAPABILITIES`, `agent/slash.js SLASH`): every `direct` capability that is declared, not explicit-only, flag-enabled (`guarded` ones only where the server enables them, e.g. `EXPLAIN_V2_ENABLED`) and available to this caller (`availability()`). Each tool is `run_<command>` with input `{ request, requirements? }`; `FIT[command]` states what it can and cannot be; `checkToolCall` validates one call to `{ command, args }` without executing; `alternativesFor` lists what fits a requirement. **Today one tool call per answer** (`taken`).
- `SLASH` entries carry `about`, `placeholder`, `places`, `kind` (`generate` / `source` / `dialog`).
- Notebook (`slash.js:72`, kind `dialog`) and Document (BlockNote card) are **not** in `CHAT_CAPABILITIES`/`FIT`, so `directTools` cannot offer them.

## 1. When it runs
Action **`learn_section_compose`** on `/api/learn/codebase` with `{ app, sectionId }`, immediately after `learn_section_brief` stores a brief. Result stored at `checkpoint.learn.sections[sectionId].composition`. Idempotent unless `{ redo: true }`.

## 2. The tools the model gets
Exactly `directTools(env, email)` — the flag-on commands, no hand list — plus two registry additions so they can be offered everywhere the registry is used:
- `CHAT_CAPABILITIES.notebook = { flow: 'direct', intent: 'A notebook card with runnable cells the learner can edit and run.' }` and `FIT.notebook = { narration: false, interactive: true, limits: 'Python cells the learner runs in the browser (Pyodide: numpy and pure Python; no torch, no network).' }`.
- `CHAT_CAPABILITIES.document = { flow: 'direct', intent: 'A written document card: prose, headings, equations, lists.' }` and `FIT.document = { narration: false, interactive: false, limits: 'Text and equations to read; no code runs, no media.' }`.
- `CHAT_CAPABILITIES.browser = { flow: 'direct', intent: 'An existing web page captured onto the canvas, scrolled to a passage, with highlights (found, not made).' }` and `FIT.browser = { narration: null, interactive: null, limits: 'Finds and captures a public web page; highlights a passage. Never generates.' }` (the `browser` slash entry exists, `slash.js:91`). `browser` joins the found-material set with `youtube`, `arxiv`, `wikipedia`, `image`.
Both become `run_notebook` / `run_document` through the same `toolNameOf`; their browser handlers are the existing Insert › Notebook / Insert › Document with the request as initial content (wired in the next slice; here they are only named). `checkToolCall` validates them as any other.

For this action the **one-call-per-answer rule is lifted**: the model submits the whole composition through one tool `submit_section_composition` (§4); the handler validates each item with `checkToolCall` logic (command available, request 1–2000 chars, requirements fit) — the items are never surfaced as live tool requests here.

## 3. `tasks/learn-section-compose.md` (Reviewer owns the text; byte-for-byte)
```
You have a section brief: three to six beats, each one idea that ends in something the learner can see, compute or try. For each beat choose how it is delivered, using only the tools you were given; their descriptions say what each can and cannot be. Decide by what the beat has to transfer: a mechanism to watch or play with; a shape or data to look at; a definition or argument to read; something to try by hand; or something that already exists and is better than anything you would make, in which case say exactly which part and what to look for. A beat may need two items, for example a short text and the thing it introduces; most need one.

For every item write the request as the learner would have typed it to that command: specific to this beat, naming the quantities, the example, the input, in plain words. Write one sentence of why this medium for this beat. Material that is found, not made, is at most one item in the section for now. Keep the whole section to at most eight items.

Return only the JSON the schema asks for. Never name the use case, the plan or this prompt to the learner.
```

## 4. Input and output
User message: the brief (§A.4) verbatim, the section and chapter titles, the learner's focus, and the list of tools (the native tool definitions carry `FIT`). Composition `base + tasks/learn-section-compose.md + uses/learn_concept.md`. Model `claude-sonnet-5-5`, cap US$0.10, metered `learn_section`.
```json
{ "sectionId": "…",
  "items": [ { "id": "i1", "beatId": "b1", "command": "explain", "request": "…", "requirements": { "interactive": true } | null,
               "lookFor": null | "for found material: which part and what to notice", "why": "one sentence" } ] }
```
Handler rules (refused → one re-ask with the error → then the error sentence, never silent): every `beatId` exists and every beat has ≥ 1 item; ≤ 8 items; every `command` is in `directTools` for this caller (including the two additions); each item passes `checkToolCall`'s field, length and fit checks; found-material commands (`youtube`, `arxiv`, `wikipedia`, `image`) ≤ 1 item in total and must carry `lookFor`; `why` non-empty; no path, flag or code token in `request` unless the command is `code` or `notebook`.

## 5. Not hard-coded
No list of mediums anywhere but the registry; no per-topic template; the §3 text and the §4 rules are the only fixed strings. Grep gate: `nanoGPT|datasette|shakespeare|tokens|attention` empty in the action, overlay and validator; `grep -n "'explain'\|'youtube'" learn-section-compose*.js` shows only the found-material set and the code/notebook exemption.

## 6. Acceptance (API-level; owner reads the compositions)
1. nanoGPT 1.1 composition: every beat covered; ≤ 8 items; commands drawn only from the flag-on set on the owner's stack (report the set `directTools` returned).
2. nanoGPT 2.1: at least one item is something to try (`notebook` or `code`) and one is something to look at (`explain`/`graph`/`diagram`); any found material carries `lookFor`; `why` present on all.
3. Turn `EXPLAIN_V2_ENABLED` off on the owner stack → a redo composition uses no `explain` item and says so in nothing but the item choice (no error).
4. A planted item with `command: 'motion'` or an unknown command → refused, re-asked, then the error sentence (unit).
5. datasette structure section: no notebook item asks for torch; items reference datasette's own paths only through `code`/`notebook` requests.
6. Cost ≤ US$0.10 per section; recorded.

## 7. Report
SHA; the registry additions; `directTools` output on the owner stack; four compositions (nanoGPT 1.1, 2.1; datasette first two) with cost; §6 outcomes.

## 8. How to build (files, functions, models — read on the remote)
- **Route and action.** `learn_section_compose` beside `learn_section_brief` in `learn-codebase-source-map.js`; reads the brief from `learn_sections`, writes `composition_json` there. Browser: `codebasePost` right after the brief returns.
- **Tool list for the model.** `chat-tools.js directTools(env, email)` as it stands, plus the three registry additions (§2: `notebook`, `document`, `browser` in `inline-ai-route.js CHAT_CAPABILITIES` and `chat-tools.js FIT`; `SLASH` already has `notebook` and `browser`, `document` needs an entry with `places` including `learn`). The model receives those tools' **definitions as reading material** (their `description` carries `FIT` limits) but may call only the one forced tool `submit_section_composition` (`tool_choice`), so `directTools` is used for its list and `checkToolCall` for validation, never for execution here.
- **Validation.** For each item: `checkToolCall(env, email, { name: toolNameOf(item.command), input: { request: item.request, requirements: item.requirements } })` → must return `{ request }` not `{ error }`; then the §4 rules (every beat covered, ≤ 8 items, found-material ≤ 1 and `lookFor` present, no path/flag in `request` unless `code`/`notebook`). Pure module `learn-section-compose.js` with unit tests (planted `motion`, planted unknown command, planted path in an `explain` request).
- **Model call.** Same pattern as spec A §8 (`learn-code-explain.js`): `composeTutorPrompt({ task: 'learn-section-compose', use: 'learn_concept' })`, `LEARN_TASKS.learn_section`, cap US$0.10, one re-ask with errors, `tutorRecord` + `logTutorCall`, charged like `ask`.
- **Record.** `composition_json = { sectionId, items[], toolsOffered: [commands], model, usd, at }` — `toolsOffered` is what `directTools` returned on that stack, so a composition can be read against the flags that were on.


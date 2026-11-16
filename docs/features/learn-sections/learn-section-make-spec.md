# Learn section — Make: how the Tutor uses each tool (owner 2026-11-15 23:24; v1.1 00:45 complete for ten tools with §11 How to build; written against rehearsal/mvp f881b982 + codeexplain/trace-required 8aecd51c)

Third step for a current section: brief (`learn-section-brief-spec.md`, what) → compose (`learn-section-compose-spec.md`, which medium per beat) → **make** (this file: each composed item made through its tool, as the learner's own slash command would make it). One section below per tool; filled in as we visit them. Placing the results on the canvas and the learner's signals are later slices; here the rule is only *what the Tutor sends to the tool and what comes back*.

## 0. Common rules (all tools)
- An item is made **exactly as the slash command makes it today** — same client call, same server job, same card type. No new renderer, no new card kind. Where the command has a confirmation step in some configuration, a section item carries `madeBy: 'learn-section'` and skips it: on the owner's production stack `/explain` + Enter makes the card with no further click, and section items behave the same everywhere.
- Items are made **one at a time, in composition order**; the next starts when the previous card is made (the card exists, even if still rendering). Stop on the learner's allowance (the existing refusal sentence) or on Cancel; cards already made stay.
- The item's `request` (from compose) is the tool's input, rewritten by the §tool rules below into the exact field the tool reads; the beat's anchors ride as context refs where the tool accepts them; the learner's depth setting applies where the tool has depth.
- Nothing topic-specific in code: templates below are the overlay's text, filled from the brief and the anchors. Grep gate as the other specs.
- **Flow text (owner 23:44).** A made card never stands alone: every item carries `lead` (1–N short paragraphs the reader meets before the card: what to look at and why it follows from the previous beat) and `follow` (0–N paragraphs after it: what they just saw, the hand-over to the next beat). The Tutor writes them in the Make call for the item, in the section's voice, continuing the brief's `from`/`to`; they are stored with the item and rendered as `document` (BlockNote) cards before and after the card when placement lands. Rules: plain words; terms only from the beats taught so far; no file names or flags; `lead` ≤ 120 words, `follow` ≤ 80 words. A pure text beat is a `document` item with no card and only `lead`.
- Every made item is recorded on the section: `checkpoint.learn.sections[id].made[] = { itemId, command, cardId|jobId, cost, at }`.

---

## 1. `/explain` — a visual explanation card

### 1a. How it is called (read: `explain-client.js`, `explain-job.js`, `explain-brief.js`, `ExplainPending.jsx`)
`POST /api/learn/explain/jobs` action `create`, body `{ prompt, depth, context_refs, madeBy: 'learn-section' }`, the same call the `/explain` command's handler makes. The job's own pipeline (brief → author → validate → render → review) decides the visual's kind, components and references — **the Tutor never chooses the visual**; it only writes the request well. `depth` is `brief | balanced | detailed` (`chat-depth.js validDepth`): the learner's stored setting (`readDepth`) unless the beat is `background`, then `brief`. `context_refs`: the beat's anchors as repository refs (`explain-context-refs.js`, evidence kind `repository`), so the card is grounded in the source lines; for a document source, the heading ref. The depth words are the pipeline's own (`chat-depth.js` explanation-card set, injected by `explain-brief.js`): the Tutor writes no depth text, only the `depth` field. `madeBy` makes the job skip any plan/confirmation stage where a stack has one (`explain-job.js` stages); on a stack without one it is ignored.

### 1b. What the Tutor writes as `prompt` — the template (in `tasks/learn-section-make.md`, not in code)
```
<the beat's idea, phrased as the question a learner would ask — one sentence>
Show it on <the concrete example from the anchors: the real sizes, values or input the source uses>.
The reader already knows: <terms introduced in earlier beats and sections — do not define them again>.
Do not cover: <the next beat's idea; the next section's title>.
Afterwards the reader should be able to: <the beat's `shows`>.
```
Rules the handler checks before the call: one idea (one question mark at most); ≤ 600 characters; numbers only ones present in the anchors or the brief; **no file names, paths, flags or code tokens** in the prompt (the anchors go in `context_refs`, never in the text); "already knows" lists only terms from earlier beats/sections of this plan; `depth` valid. A failing prompt is re-asked once with the error, then the item is skipped with a one-line note in the section record (never silent; the Tutor says "I skipped the picture for this part" in chat).

### 1c. What comes back
The job id; the card appears through the existing `ExplainPending` → card path. The section record stores `{ itemId, command: 'explain', jobId, cardId when known, cost }`. A job that fails or is refused for allowance records the reason; the Tutor's sentence is the pipeline's existing one.

### 1d. Acceptance (API-level now)
1. nanoGPT 2.1 brief → compose → an `explain` item → one job created with `madeBy: 'learn-section'`; on the owner's stack a card appears with no click.
2. The sent `prompt` has no path/flag/code token, ≤ 600 chars, one question; `context_refs` are the beat's anchors; `depth` equals the learner's setting (or `brief` for a background beat).
3. A planted prompt with `train.py` in it is refused and re-asked (unit).
4. Two explain items in one section are made in order, the second starting after the first card exists.

---

## 2. Code — the source's own lines, or a made example (owner 23:44)
Two different cards; compose marks each `code` item `source: 'repository' | 'example'`. Either may appear more than once in a section.

### 2a. `source: 'repository'` — the source's own code, highlighted (read: `code-card.js repoCodeCard`, `insertCodeCard`, `insertCodeCards`)
- A `repo-code` card per anchor the beat rests on: `repoCodeCard({ app, repo, commit, path, start, end, nodeId?, label })` — reads the lines through the owner-checked server route at the pinned commit; never runs; **no model call, no cost**. Card range = the enclosing symbol or the anchor widened to it (as the code-explain spec widens); **the beat's exact lines are highlighted** inside it (`highlight: { start, end }` on the block; add the field and its rendering in `CodeCard.jsx` if absent — the code-explain card's range highlight is the same rendering). `label` = the beat's idea in ≤ 6 words. Several anchors in one beat → several cards, in anchor order, linked by connectors as the code-explain spec links satellites.
- When the code-explain card lands (`codeexplain/trace-required`), a repository code item upgrades to a code-explain card (code + explanation at the learner's depth) with the same anchors; until then, the bare highlighted card plus the item's `lead`/`follow` text carry the explanation.
- Handler rules: every anchor exists at the commit; `highlight` lies inside the card's range; no card wider than 200 lines (split or narrow the anchor).

### 2b. `source: 'example'` — a made Python example (`/code`, primitive `learn-primitives.js code_sample`)
- The `/code` command's own call with the request below; the primitive makes a `snippet` block: title, one-line brief, code. **Shown, not run; it never states output** (the primitive's rule). Use only when the beat's idea is clearer in a few self-contained lines than in the source, and never when the beat says *try* or *compute* — that is the notebook's job.
- Request template (overlay text, not code):
```
Write a Python example that <the beat's idea as a doing-sentence>.
Use these sizes and values: <from the anchors or the brief>. Standard library and numpy only; nothing imported from the source.
One comment per step, in the words the reader already knows: <terms taught so far>.
Do not print or state any output.
```
- Handler rules: ≤ **100 lines** (raise `code_sample`'s check from 60 to 100 for items made by the section flow; the typed `/code` keeps 60 unless the owner says otherwise); no import of the source's modules; no output claim; the brief's title ≤ 60 chars; numbers only from the anchors/brief. Refused → one re-ask with the error → then the item is skipped with the Tutor's one-line note.

### 2c. Acceptance (API-level now)
1. nanoGPT 2.1 brief with an anchor on the batch function → one `repo-code` card whose range is the enclosing function and whose highlight is the anchor lines; `lead` text present; no model cost recorded for the card.
2. A beat with two anchors → two cards in order with a connector between them.
3. An `example` item → a `snippet` block ≤ 100 lines, no `print` of results, no `import model` / `import train`; a planted 120-line answer is refused and re-asked (unit).
4. A planted `highlight` outside the card's range is refused (unit).
## 3. Notebook — runnable code the learner executes to see the idea (owner 23:46, 23:54)
Not practice: every cell runs as given; the learner presses Run (and may change a value and rerun) to **see** the idea. Read: `learn-notebook.js` (`newNotebookBlock`, `notebookFromCode`; block = `{ notebook_id, files[], active_path, ipynb_path, ipynb }`, a JupyterLite workspace that can hold several files), `NotebookCard.jsx`, `inline-notebook-edit.js`. Today's runtime is Pyodide (Python, numpy, pure Python; no torch, no network) — **a limitation of today, not a rule**: the Tutor plans the notebook the idea needs and the handler marks cells the current runtime cannot run (§3d); when the runtime grows, the mark goes away and nothing in this spec changes.

### 3a. Three kinds of notebook content (compose marks each item `content: 'source' | 'authored' | 'buildup'`)
1. **`source`** — files from the connected source, standalone or a part, that the learner can run with a few different parameters: the source's script or function copied into cells at the pinned commit (the anchors), its parameters lifted into a first cell as plain assignments the learner edits (the same knobs the Run card knows for a repository), a last cell that runs it. Nothing rewritten except what is needed to run in a notebook (imports resolved, the entry call added).
2. **`authored`** — files or examples the Tutor writes because they make the idea clearer than the source does: a toy-size re-creation with the source's real values, or a small experiment around one function of the source. Part of the section, not of the source.
3. **`buildup`** — a notebook that continues the previous sections' notebooks: imports or copies their functions (as files in the same workspace, or re-stated cells) and adds this section's piece, so across the plan the learner assembles the thing — for a repository, the pipeline; for a paper (PDF source, later), the method, part by part, until the final sections run nearly the whole paper. The section record keeps `notebookLineage: [sectionIds]` so the Tutor knows what exists to build on.

### 3b. Shape
- **A notebook is an explanation that runs, not a script with captions** (owner 23:58). Markdown cells carry the teaching: the theory and the equations (LaTeX) the next cell implements, how the code maps to them line by line, what to look at in the output, and the hand-over to the next step. They sit before, between and after code cells as the idea needs; a code cell may be followed by a markdown cell that reads its output back against the equation. Code cells are complete and runnable with no edits; no "your code here". Roughly as many markdown cells as code cells; a markdown cell ≤ 150 words.
- One or more files in the workspace (`files[]`): a `.ipynb` per notebook; `.py` helper files when functions are shared across cells or sections; several notebooks in one card when the section needs them, the first as `active_path`.
- Values from the anchors or the brief (the source's real sizes, defaults, names); every printed value is one the reader can tie to a highlighted line in the repo-code card beside it.
- 3–16 cells per notebook; a code cell ≤ 40 lines; optional plot cells when a shape or curve is the point; a final markdown cell with one "change this and rerun" invitation (still seeing, not a task).
- Markdown says what to look for, never what the output *is*: the notebook is not executed before it is shown (the primitive rule: an unrun output is a claim).

### 3c. Request template (overlay text, not code)
```
Make a notebook that lets the reader see <the beat's idea> by running it.
Content: <source | authored | buildup — and for buildup, which earlier notebook it continues>.
Use these values and names: <from the anchors/brief>.
Explain in markdown cells as you go: the theory or equation (LaTeX) the next cell implements, how the code lines map to it, what to look at in the output, and the link to the next step — before, between and after the code cells as needed.
Each code cell runs as given. Parameters the reader may change go in the first cell as plain assignments.
Last cell: one value to change and rerun.
```

### 3d. Handler rules
- Valid nbformat 4 with the Python kernelspec; every file in `files[]` present; `active_path` among them; cells 3–16 with at least as many markdown cells as code cells and a markdown cell first; no empty or placeholder code cells; code cells ≤ 40 lines; no infinite loop pattern (`while True` without break), no network call.
- Imports are **not refused**. The handler checks each import against the runtime's known packages (a list the notebook site publishes; today Pyodide's) and marks a cell `runtime: 'unavailable'` with the package name; the markdown cell before it gets one appended sentence from the copy table: *"This cell needs {package}, which the notebook can't run here yet; read it, and run it in your own environment."* Nothing is silently dropped, nothing blocks the section.
- For `source` content: cell text matches the anchor lines at the commit (diff only in the resolved imports and the added entry call); the parameter cell lists every parameter the source exposes for that part.
- For `buildup`: every function it relies on is present in the workspace (a file or a cell) or imported from a previous section's helper file copied in; the lineage recorded.
- Refused → one re-ask with the error → then the item is skipped with the Tutor's one-line note.

### 3e. Acceptance (API-level now)
1. nanoGPT 1.1 (`source`): the prepare script's logic in cells, its paths/values in a first cell, a run cell; runnable in Pyodide as is (no torch there).
2. nanoGPT 2.1 (`authored`): a batch-cutting notebook on a 20-token toy sequence with the source's `block_size`; markdown before each cell; last cell invites changing one value.
3. A `buildup` notebook for a later section imports a helper written in an earlier section's workspace; lineage recorded.
4. A cell with `import torch` is kept, marked `runtime: 'unavailable'`, its markdown carries the sentence; the section is not blocked (unit + one real section).
5. A planted `while True:` cell is refused and re-asked (unit).
6. Two notebooks in one card: `files[]` has both, `active_path` the first.
## 4. Document — the BlockNote card for prose, headings and equations (owner 00:08, 00:10)
Read: `canvas-doc.js` (`type: 'doc'`, `newDocBlock`, `DOC_BLOCK_TYPES` = paragraph, heading, quote, bullet/numbered/check/toggle list items, codeBlock, table, divider; no media), `RunbookEditor.jsx` (`tryParseMarkdownToBlocks`: Markdown in, blocks out), `learn-runbook.js` (a document filled from data). The Tutor writes **Markdown**; the browser parses it into the card.

**Schema change (owner 00:10): add BlockNote's inline and block math (KaTeX) to the doc schema** — `DOC_BLOCK_TYPES` gains the math block, the inline content gains inline math, Markdown `$…$` / `$$…$$` parse to them, and the Runbook/Insert › Document paths are untouched otherwise. Equations may **also** appear in notebook markdown cells; repetition across a document and a notebook is fine — the two are read at different moments.

### 4a. Three roles, one card
1. **Flow text** — the `lead` / `follow` paragraphs around every other item (§0). Continuous prose, no headings.
2. **A reading** — a beat whose idea is best read: a definition, an argument, a derivation, the reason behind a design. 2–6 paragraphs, headings allowed, a `quote` where the source's comment or README says it, a `codeBlock` only for a 1–3 line excerpt with its line reference, equations where a line computes one. Two textbook pages, never an article.
3. **Section notes** — one document at the end of each section: what was learned in the section's own words, the terms it introduced, and the hand-over — what the learner re-reads next week. Made with the section's last item.

**Paired with `/explain` (owner 00:25):** a paragraph of a reading or of section notes may be followed by an `/explain` card made for that exact text when the idea wants a picture — the paragraph (or its equation) is the explain prompt's example, the document card is its `context_refs` evidence (kind `doc`, the block id), connector between them. Compose expresses it as two items on one beat; only when the beat needs it.

### 4b. Request template (overlay text, not code)
```
Write <lead | follow | reading | notes> for <the beat / the section>.
It must carry: <from the beat's idea and `shows`, or the brief's from / to>.
The reader already knows: <terms taught so far>; do not define them again. Do not cover: <next beat / next section>.
Plain words first; a symbol only when the code uses it. Equations in $…$ or $$…$$ where a line computes one, with the line's role said in words beside it. Headings only in a reading.
```

### 4c. Handler rules
Markdown that parses to the allowed block types (anything else → paragraph, never dropped silently; the record notes the fallback); word caps: lead ≤ 120, follow ≤ 80, reading ≤ 600, notes ≤ 300; no file names, paths or flags in prose (a path only inside a codeBlock with its line); every equation has a one-sentence reading in words next to it; no statement about an output nobody ran; the "already knows" list comes from the plan's earlier beats. Refused → one re-ask → then the item is skipped with the Tutor's one-line note (a missing `lead` is replaced by one default sentence from the copy table so a card never stands alone).

### 4d. Acceptance (API-level now)
1. nanoGPT 2.1: every non-document item has a `lead`; at least one `follow`; the section ends with notes ≤ 300 words naming the terms introduced.
2. A reading for a definition beat parses to headings + paragraphs + one quote from the source's comment; no path in prose.
3. An equation in a reading renders as KaTeX in the doc card; the same equation in the notebook's markdown renders there too.
4. A planted unknown block type becomes a paragraph and the fallback is recorded (unit); a planted path in prose is refused (unit).
## 5. YouTube — a video, cued to the part that teaches the beat (owner 00:12, 00:13)
Read: `learn-youtube.js` — `find_video_moments(query)` (Exa restricted to youtube.com → captions → transcript windows scored against the query → passages with timestamps) and `show_video(videoId, start?, end?, reason, confidence)` (a `video` card whose embed starts and stops at the window; no window when captions were unreadable); `learn-moment-retrieve.js` (60 s windows, 30 s stride). The product already finds *moments*, not just videos.

### 5a. When
Only for a beat the brief marked `material: { kind: 'video' }` (someone else shows this better than we would make it), and within compose's one-found-item-per-section rule for now.

### 5b. The call
The two existing tools, in the Make turn: `find_video_moments` with the beat's `material.query`; the Tutor chooses the video and the window **from passages it actually read**; `show_video` with `reason` and `confidence`. The card is the existing `video` block.

### 5c. Window
As long as the beat needs (owner 00:13): a 40-second cut, a 12-minute segment, or **the whole video** when the beat is served by all of it — the Tutor decides from the passages and says so in the `lead`. `show_video`'s current 5 s–5 min bound on `end − start` is **lifted for section items** (`madeBy: 'learn-section'`): any window inside the video, or no window at all for the whole video. A window still comes only from passages read; a video without passages is offered whole, never with an invented window.

### 5d. What rides with the card
`lead`: what to watch for, where to start if the whole video is offered, and the speaker's words for our terms when they differ. `follow`: what they saw tied back to the highlighted lines or the notebook. Both from the template:
```
Find a video that teaches <the beat's idea> to a viewer who already knows <terms>.
Query: <material.query>. From the passages, pick the part that shows exactly this — a short cut, a segment, or the whole video if all of it serves the beat — and say which in the lead.
In the lead, say what to watch for and the speaker's words for our terms.
```

### 5e. Fallbacks, never silent
No result with `confidence ≥ 0.6` → the item is dropped and compose is called once more for that beat with "no video found" so it picks a made medium; recorded. Captions unreadable but the video right → whole video, `lead` names where to start if known. Exa and model spend recorded (`exaCost`).

### 5f. Acceptance (API-level now)
1. A video beat → `find_video_moments` once, `show_video` once; the card's window matches passage timestamps or is absent for a whole-video offer; `lead` names what to watch for.
2. A planted window outside the video's passages is refused (unit); a 12-minute window for a section item is accepted (unit — the chat bound stays 5 min).
3. No confident result → compose re-run for that beat, the drop recorded, the section continues.
## 6. arXiv / PDF — papers, opened at the pages to read, with the passage or section highlighted (owner 00:17, 00:20)
Read: `arxiv.js` — `search_arxiv`, `read_arxiv_paper` (PDF text + figures), `show_paper(id, page)` (a `paper` card open at a 1-based page; "read the paper first so the page number is real"); `LearnPaper.jsx` + `pdf-highlights.js` (`putHighlight`, `locateQuote`: a quoted text located on the page and painted as a highlight); `learn-paper-figures.js` (renders the cited page and crops the figure, no model image); `pdf` block (`assetKey`) for an uploaded PDF.

### 6a. Which papers
1. **The source's own paper(s)**: a README reference, a docstring's arXiv link, a `CITATION` file — found **by rule at index time** and stored with the catalogue as `papers[]` (id, title, where cited). The Tutor uses these first.
2. **A relevant paper** the brief asked for (`material: { kind: 'paper' }`) via `search_arxiv`, chosen by the Tutor from the results it read.
Several papers in a section are fine; compose's one-found-item rule counts a paper, not a page.

### 6b. Pages, not the paper
The Tutor reads the paper (`read_arxiv_paper`) and names the pages that carry the beat. **One `paper` card per page**, placed in reading order (the same paper opened at several pages is the mechanism), each with:
- **a highlight on what to read** — a passage: the quoted sentences, verbatim; **a section**: the section's text on that page (a section running over pages → one card per page, each highlighting its part); the browser locates the quote (`locateQuote`) and paints it through the existing highlight store. Never a highlight for text the Tutor did not quote.
- **the figure crop** beside the card when the beat is a figure (`learn-paper-figures.js`), so the figure is seen without hunting.
- `lead`: where we are in the paper ("§3.2, Scaled dot-product attention"), what to look for, the paper's words for our terms; `follow`: how it maps to the highlighted code lines or the notebook cells (for a `buildup` notebook: "§3.2 is cells 4–6").
**Paired with `/explain` (owner 00:20):** a highlighted passage or section may be followed by an `/explain` card made for it — the `/explain` prompt (§1b) then takes the quoted passage as its example ("Show it as the paper states it in §3.2: …") and the paper card is its `context_refs` evidence (kind `paper`), so the picture explains exactly the text the learner just read. Compose expresses this as two items on one beat (paper page → explain) and the connector links the explain card to that page card.
For a **PDF source** (later): the same cards point into the source PDF (`pdf` block, same page + highlight shape); nothing else changes.

### 6c. Template (overlay text, not code)
```
For <the beat's idea>, point the reader into <the paper: id / the source's cited paper>: the pages to open and, on each, the exact passage or the section to read, for someone who already knows <terms>.
Per page: the quoted text verbatim (sentences, or the section's text on that page), what to look for, the paper's words for our terms, and whether a figure on the page is the point.
```

### 6d. Handler rules
`id` from `papers[]` or this turn's search result and actually read; every `page` ≤ the paper's page count; every quote located on its page (`locateQuote`) — not found → the card opens at the page with no highlight and the record says `highlight: 'not_found'` (never silent; the `lead` still says what to read); quotes ≤ 60 words per passage, a section highlight ≤ one page of text; ≤ 4 page cards per paper per section; `lead` on every card; never "read the whole paper" as an item. Exa/model spend recorded.

### 6e. Acceptance (API-level now)
1. nanoGPT's source papers found by rule from its README (the GPT-2 / attention references present there) and stored as `papers[]`.
2. A paper beat → N `paper` cards at real pages of a paper read this turn; each highlight located; a figure beat yields the crop.
3. A planted quote that is not on its page → card without highlight, `highlight: 'not_found'` recorded (unit); a page beyond the count refused (unit).
4. A section spanning two pages → two cards, each highlighting its part, `lead` naming the section.
## 7. Wikipedia — a background definition, one section highlighted, paired with `/explain` when needed (owner 00:23, 00:25)
Read: `learn-wiki.js` — `search_wikipedia`, `read_wikipedia`, `show_wikipedia(title, section)` (a `wiki` card scrolled to a section heading; "read the article first so the section is real"); `learn-wiki-highlights.js` (highlights stored as text quotes with context, "in a shape a tutor tool can read or write").

### 7a. When
A `background` beat whose idea is a definition or standard concept the source assumes (a term in our text that may be new), or a `material: { kind: 'article' }` beat. Never for the source's own mechanism — that is ours to explain. It is the "already knows" repair.

### 7b. The call and the card
`read_wikipedia` first, then `show_wikipedia(title, section)`: **one section, highlighted** — the Tutor quotes the 1–3 sentences that carry the definition (verbatim, ≤ 60 words); the browser paints them through the quote-highlight store. One card per article; a second section of the same article is a second card. A section, never the article; a definition needing more than one section is a reading (§4), not a wiki card.
`lead`: why this term matters for the next beat and what Wikipedia calls it if the source uses another name; `follow`: back to the code line that uses it.

### 7c. Paired with `/explain` (and with a notebook)
Same pattern as §6: when the concept wants a picture, the highlighted section is followed by an `/explain` card made for that exact text — the quote is the explain prompt's example, the wiki card its `context_refs` evidence (kind `wiki`), connector between them. Or followed by a notebook cell that computes the defined thing on the source's values. Compose expresses it as two items on one beat; the pairing is used only when the beat needs it.

### 7d. Template (overlay text, not code)
```
For <the term / background idea>, point the reader to the Wikipedia section that defines it, for someone who already knows <terms>: the article, the section, and the exact sentences to read (verbatim). Say what the article calls it if the source uses another name. Say whether a picture of it would help.
```

### 7e. Handler rules
Title and section from an article read this turn; the quote located on the card (not found → no highlight, `highlight: 'not_found'` recorded, `lead` still says what to read); ≤ 2 wiki cards per section; never for a beat that has anchors; `lead` present. Spend recorded.

### 7f. Acceptance (API-level now)
1. A background beat (e.g. a standard term the source assumes) → one `wiki` card at a real section with the defining sentences highlighted; `lead` names the next beat it serves.
2. A paired beat → wiki card then an `/explain` card whose prompt contains the quoted sentence and whose refs name the article; connector present.
3. A planted quote not in the section → card without highlight and `highlight: 'not_found'` recorded (unit); a wiki item on a beat with anchors refused (unit).
## 8. Diagram — structure or order as nodes and arrows (owner 00:27)
Read: `learn-primitives.js` — `flow_diagram` (2–12 nodes with tone input/step/repeat/output/note, edges in the direction of flow, auto-laid-out) and `mermaid_diagram` (plain Mermaid source, fixed set of types, no handlers); the `/diagram` command's own call.

### 8a. When
A beat whose idea is **what connects to what, or in what order** and nothing more needs explaining: the source's pipeline (prepare → train → sample), the call order inside a function, which file reads what another writes, the shape of a training loop. Static. When the beat is a *mechanism to understand* (why, how the numbers move) it is `/explain` (§1) instead, whose pipeline may draw a diagram itself with labels and steps; `/diagram` is the cheap, planning-free picture for a structure the reader just needs to see. A diagram is also the natural pairing after a `design`/structure reading (§4) or beside a `source` notebook (§3) to show where the cell they are running sits.

### 8b. How
`flow_diagram` by default (nodes from the beat's anchors: one node per step/file/function, labels in plain words ≤ 60 chars, `detail` for the file name when the reader will look there next, tones true to the role); `mermaid_diagram` only when the shape is one `flow_diagram` cannot draw (a sequence diagram of calls over time, a state machine). Edges only for relationships the anchors show. 3–10 nodes; one diagram per beat.
Template (overlay text):
```
Draw the structure of <the beat's idea>: the <steps | files | calls> as nodes and the <flow | calls | reads/writes> as arrows, in the order the source runs them. Labels in plain words the reader already knows: <terms>. Only connections the given code shows.
```
Handler rules: every node maps to an anchor or a term already taught (no invented components); edges ≤ 20; the primitive's own checks; no file paths in labels (file name in `detail` only). `lead`: what to follow with the eye and where the reader is in it; `follow`: the node they will open next.

### 8c. Acceptance
1. nanoGPT chapter-1 beat "from a book to a stream of tokens" → a 4–6 node `flow_diagram` (text → characters → vocabulary → ids → binary files) with tones input/step/output; no path in labels.
2. A planted node with no anchor or taught term is refused (unit).

## 9. Graph — a quantity plotted (owner 00:27)
Read: `learn-primitives.js` — `interactive_graph` (Desmos: expressions, parameter sliders, axes; "for functions and their parameters") and `data_plot` (Plotly: numeric line/scatter/bar from supplied numbers; `illustrative: true` unless every number comes from the context); the `/graph` command's own call.

### 9a. When
A beat whose idea is **how one quantity changes with another**: a function the source computes (the learning-rate schedule over steps; softmax over a few logits at different temperatures; the loss curve), or real numbers the record holds (the rehearsal's loss per step, step times). Not for structure (§8) and not for a mechanism that needs words and steps (§1).

### 9b. How — two cases, decided by where the numbers come from
- **A function the source defines** → `interactive_graph`: the expression taken from the anchored lines, the parameters the code exposes as sliders with the source's defaults and ranges (warmup iterations, decay, min learning rate), axes named in the reader's words. The reader drags what the code lets them change.
- **Numbers that were actually measured** → `data_plot` with `illustrative: false` **only** when every value is in the record (rehearsal metrics, step times) or computed in a notebook cell shown beside it; otherwise `illustrative: true` and the `lead` says so in words ("the shape, not measured values").
One graph per beat; a graph whose point is a single number is a sentence, not a graph.
Template (overlay text):
```
Plot <the beat's idea>: <the function from the anchored lines with its parameters and defaults | the measured values from the record>. Axes in the reader's words: <x>, <y>. Sliders only for parameters the source exposes. If any number is not from the source or the record, mark the plot illustrative.
```
Handler rules: an `interactive_graph` expression must reference only parameters present in the anchors (names and defaults checked); a `data_plot` with `illustrative: false` must have every value traceable to the record or to a notebook cell in the same section (the handler checks the numbers against the record; otherwise it sets `illustrative: true` and records the correction — never silent); the primitives' own checks. `lead`: what to look at (the knee, the slope, the gap); `follow`: the code line that produces it.

### 9c. Acceptance
1. nanoGPT training-chapter beat on the schedule → an `interactive_graph` of the learning rate over steps with sliders for the parameters the source exposes, defaults matching the config.
2. A `data_plot` of the rehearsal's loss per step → `illustrative: false`, every value from the record; a planted plot with one invented value is corrected to `illustrative: true` and the correction recorded (unit).
3. A graph item on a structure beat is refused by compose's fit check (unit).

## 10. Browser card — a web page captured, scrolled to the passage, highlighted; found with Exa; paired with `/explain` (owner 00:28)
Read: `WebpageCard.jsx` (`type: 'webpage'`: a saved capture of a public page as tiles + text layer, scroll position, the PDF reader's highlight store `pdf-highlights.js` / `textAnchor`), `webcard-api.js` (`capturePage`), `webpage-capture.js`; `learn-search.js SEARCH_SOURCES` (Exa restricted to youtube / arxiv / wikipedia today).

### 10a. When
Two cases. **(1) Recency (owner 00:30):** the beat needs something the model cannot know reliably — a recent release, a changed API or default, current numbers, news about the source or its field, what a version did after the model's knowledge ends. The web page is then the *evidence*, not a nicer explanation: the Tutor searches, reads, cites the page and dates it in the `lead` ("as of <page date>"), and never states the recent fact from memory. The brief marks such a beat `material: { kind: 'article', reason: 'recency' }`. **(2) A better existing explanation:** a `material: { kind: 'article' }` beat whose best explanation lives on the web and is not Wikipedia or a paper: the source's own docs site, a maintainer's blog post on the design, a tutorial page, a standard's page, the source's issue or PR that explains a decision. Same bar as §5–7: someone wrote it better than we would make it, and the reader needs *a passage*, not a site.

### 10b. Finding it
`SEARCH_SOURCES` gains **`web: { domain: null, noun: 'web pages' }`** (Exa unrestricted, same `RESULT_LIMIT`, same cost accounting), used only by the section flow and the Tutor's own tools; the Tutor reads the result's text before choosing. A page the source itself links (README, docs URL, a comment's link) is preferred over a search and needs no Exa call.

### 10c. The card
The `/browser` command's own capture (`capturePage(url)`), then: **scrolled to the passage** and **the passage highlighted** — the Tutor quotes the sentences verbatim (≤ 80 words), the browser anchors them in the text layer (`textAnchor`) and paints the highlight; a section of a page = its text highlighted, several passages = several highlights on one card, a second page = a second card. `lead`: what to read and what the page calls our terms; `follow`: back to the code or the notebook. Pairing as §6–7: a highlighted passage may be followed by an `/explain` card made for that exact text (the quote as example, the webpage card as `context_refs` evidence kind `webpage`), connector between them, when the beat needs a picture.

### 10d. Template (overlay text, not code)
```
For <the beat's idea>, point the reader to the web page that explains it best, for someone who already knows <terms>: the URL (the source's own link if it has one), the exact sentences to read (verbatim), what to look for, and the page's words for our terms. Say whether a picture of it would help.
```

### 10e. Handler rules
For a `recency` beat the page's date is read and shown in the `lead`, and the Tutor's own text makes no claim about the recent fact beyond what the highlighted passage says. URL public and captured (a capture that fails → the item is dropped and compose re-run for the beat, recorded — never a blank card); the quote located in the capture's text layer (not found → card scrolled to the top, `highlight: 'not_found'` recorded, `lead` still says what to read); ≤ 2 webpage cards per section; prefer source-linked pages over search; Exa spend recorded.

### 10f. Acceptance
1. A beat pointing at the source's own docs page (linked from its README) → a webpage card scrolled to the passage with it highlighted, no Exa call.
2. A beat with no source link → one Exa `web` search, a page read, a card with the highlight, `lead` naming the page's terms.
3. A paired beat → webpage card then an `/explain` card whose prompt contains the quoted sentence; connector present.
4. A failed capture → compose re-run for that beat, the drop recorded (unit).

## 11. How to build (files, functions, models — read on the remote)
### 11a. Shape of the work
Make is **one server turn per item** (`learn_section_make` with `{ app, sectionId, itemId }`, sequential, called by the browser after the previous item's card exists) that (1) writes the item's `lead` / `follow` and the tool-specific request from the §1–10 templates, (2) performs the server-side half where the tool has one, and (3) returns `{ item, perform }` — what the browser must do to make the card. Recorded in `learn_sections.made_json` (spec A §8 table). The browser runs `perform` with the pieces below, then calls `learn_section_make` for the next item. Nothing new is rendered; every card is an existing block type.

### 11b. The model call (all items)
Pattern of `learn-code-explain.js`: `composeTutorPrompt({ task: 'learn-section-make', use: 'learn_concept' })` with the per-tool template inside `tasks/learn-section-make.md`; one forced tool `submit_item` whose schema is the union of `lead`, `follow` and the tool's fields (§1b prompt+depth, §2b code request, §3c notebook files, §4b markdown, §5–7/10 quotes + locations, §8–9 diagram/graph requests); tools available inside the call where the item needs reading: repository tools (`repository-context.js repositoryTool`), `read_arxiv_paper` / `search_arxiv` (`arxiv.js`), `read_wikipedia` / `search_wikipedia` (`learn-wiki.js`), `find_video_moments` (`learn-youtube.js`), `searchCanvasSource('web', …)` (§10b). `LEARN_TASKS.learn_section`, cap US$0.10 per item (US$0.15 for a notebook), re-ask once with the validator's errors, `tutorRecord` + `logTutorCall`, charged like `ask`. Validators are pure modules per tool (`learn-section-make/*.js`) with unit tests for the planted cases in each §acceptance.

### 11c. Per tool — the server half and the browser `perform`
| Tool | Server does | Browser `perform` (existing functions) |
|---|---|---|
| `/explain` §1 | validates prompt; nothing else | `explain-client.js` create (`EXPLAIN_ROOT` `/api/learn/explain/jobs`) with `{ prompt, depth, context_refs, madeBy: 'learn-section' }` → the card arrives through `ExplainPending.jsx` as today. `explain-job.js` honours `madeBy` by skipping the plan stage where a stack has it. |
| Code §2a repository | resolves anchors to `{ path, start, end, nodeId, label, highlight }` at the commit | `code-card.js insertCodeCard(ops, repoCodeCard({ app, repo, commit, path, start, end, nodeId, label }))` (several → `insertCodeCards`); `highlight` field added to the `repo-code` block and drawn in `CodeCard.jsx`; connectors via the canvas `onConnect` as the code-explain satellites. |
| Code §2b example | validates ≤ 100 lines, no source imports | `slashRef.current.intercept('/code ' + request)` — the same runner `ask.jsx:942` uses for a tool request; `learn-primitives.js code_sample` check raised to 100 for `madeBy: 'learn-section'`. |
| Notebook §3 | builds the nbformat files, marks `runtime: 'unavailable'` cells from the notebook site's package list | `canvasOps.insertNotebook` (`AdaptiveCanvas.jsx:2367`) with a block from `learn-notebook.js newNotebookBlock()` whose `files[]`, `active_path`, `ipynb` are the server's; helper `.py` files written into the workspace through the card's bridge (`NotebookCard.jsx` `init` with `workspace: { path: { type, format, content } }`, the same shape the preview uses). |
| Document §4 | validates markdown + word caps | `canvas-doc.js newDocBlock()` + `editor.tryParseMarkdownToBlocks(markdown)` (`RunbookEditor.jsx:252/356` pattern) into `blocks`; the KaTeX schema change in `CanvasDoc.jsx` / `DOC_BLOCK_TYPES`. |
| YouTube §5 | runs `find_video_moments` → `show_video` (window bound lifted for `madeBy`) | the existing video insert (`AdaptiveCanvas.jsx:2815`: `{ type: 'video', videoId, title, channel, start, end }`), exported on `canvasApi` as `addVideo`. |
| arXiv/PDF §6 | `read_arxiv_paper`, pages + quotes; `papers[]` found by rule at index time (catalogue) | paper insert (`AdaptiveCanvas.jsx:2365`: `{ type: 'paper', paper: { id, page } }`, export `addPaper`); highlight via `pdf-highlights.js putHighlight` after `locateQuote` (`learn-wiki-highlights.js`) on the rendered page; figure crop via `learn-paper-figures.js`; `pdf` block (`AdaptiveCanvas.jsx:2330`) for an uploaded source later. |
| Wikipedia §7 | `read_wikipedia`, section + quote | wiki insert (`AdaptiveCanvas.jsx:2791`: `{ type: 'wiki', title, section }`, export `addWiki`); highlight stored as a quote through `learn-wiki-highlights.js`. |
| Diagram §8 | validates nodes against anchors/terms | `slashRef.current.intercept('/diagram ' + request)` → `flow_diagram` / `mermaid_diagram` primitives. |
| Graph §9 | checks `illustrative` against the record's numbers | `slashRef.current.intercept('/graph ' + request)` → `interactive_graph` / `data_plot`. |
| Browser §10 | `searchCanvasSource('web', …)` (new `SEARCH_SOURCES.web`), reads the page, quotes | `addWebpage(url)` (`AdaptiveCanvas.jsx:3078`) → `webcard-api.js capturePage`; on capture ready, `textAnchor` + `putHighlight` for the quote and scroll to it. |
Pairings (§4, §6, §7, §10 → `/explain`): the second item's `context_refs` carries the first card's id/kind; the connector is drawn with the canvas `onConnect` from the first card to the explain card.

### 11d. Flow text and placement
`lead` / `follow` become `doc` blocks (§4) inserted before and after the item's card. Placement (where each lands) is the next slice; until then the browser uses `beside-placement.js besideSpot` relative to the previous card so nothing overlaps, and the section's cards are tagged `block.learn = { sectionId, itemId, role: 'lead'|'card'|'follow' }` so the placement slice can rearrange them.

### 11e. Registry and flags
`inline-ai-route.js CHAT_CAPABILITIES` + `chat-tools.js FIT` gain `notebook`, `document`, `browser` (compose spec §2); `learn-search.js SEARCH_SOURCES.web`; `learn-youtube.js show_video` bound lifted for `madeBy: 'learn-section'`; `explain-job.js` `madeBy` skip; `learn-primitives.js code_sample` 100-line check for section items; catalogue gains `papers[]` by rule (README / docstring arXiv links, `CITATION*`). All behind the existing `VITE_REHEARSAL_TRIGGER` dev flag until the owner's click-through.

### 11f. Grep gate
`nanoGPT|datasette|shakespeare|tokens|attention|word2vec|softmax` empty across `learn-section-*.js`, `tasks/learn-section-*.md` and the per-tool validators; no kind→template table with topic words anywhere.


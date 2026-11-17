# Learn sections: decisions over the specs (Reviewer 2026-11-16 00:45; owner overnight build 00:44)

Where a spec and this file disagree, this file wins. Specs: `learn-section-brief-spec.md` (A), `learn-section-compose-spec.md` (B), `learn-section-make-spec.md` (C).

## Order, trigger, cost
- A. Brief, then compose, then make; API-level; all behind `VITE_REHEARSAL_TRIGGER`. Make tools in this order: `/explain` (written), repository code, document, diagram, graph, notebook, YouTube, arXiv, Wikipedia, browser. Each tool gets the validator unit cases from its section's acceptance plus one real section.
- B. A dev row **Make section** under the accepted plan starts Make. Nothing makes cards on Accept. Brief and compose do run on Accept for 1.1 (A §1), and on the dev row **Next section**.
- C. US$5 total for acceptance runs (all lanes together). Report actual spend per stage.

## Schema changes
- D. Compose items gain `source: 'repository'|'example'` (required on `code` items), `content: 'source'|'authored'|'buildup'` (required on `notebook` items) and `after: itemId|null` (this item is made for the text of that earlier item: paper/wiki/document/browser, then explain). The validator checks all three.
- E. Brief `material` gains an optional `reason: 'recency'`.
- F. The found-material cap (at most 1 per section) counts only beats that carry `material`. A Wikipedia card on a background beat is separate, at most 2 per section.
- G. `lead`, `follow` and the section notes are made by Make only. They are not compose items and do not count toward the 8. The notes are appended as the section's last document.
- H. `directTools(env, email, { sectionFlow: true })` adds `notebook`, `document` and `browser` for the section flow only. Ordinary chat's tool list stays byte-identical to prod; nothing is added to `CHAT_CAPABILITIES` or `CHAT_ROUTES`.
- I. `tasks/learn-section-make.md` is drafted from C §1-10 and sent to the Reviewer for a byte review before any real Make run.

## Make, per tool
- M. C §1 means the written `/explain` (the `explanation` command, `agent/slash.js:55`), never `/interactive` (`explain`). The browser runs `slashRef.current.intercept('/explain <prompt>')` with the learner's depth, exactly as a typed `/explain`. `madeBy` and the `explain-job.js` change are dropped. The Make turn reads the anchor lines server-side at the pinned commit (repository tool) and sends them in the artifact request's `context` as `<path>:<start>-<end>` plus the lines. The prompt text itself stays free of paths.
- N. Add `FIT.explanation`. `explain` (visual `/interactive`) stays out of the section flow's tool set.
- O. `code_sample` allows 100 lines and 4000 characters for section items (`madeBy: 'learn-section'` on the artifact request). Typed `/code` keeps 60 lines and 2000 characters.
- P. Repository code cards use the existing `ranges: [{ id, start, end }]` (`code-card.js`). There is no `highlight` field.
- Q. `canvasApi.insertNotebook(block?)` takes an optional block. The Pyodide package list ships as data in the web package.
- R. Export `addVideo`, `addPaper` and `addWiki` on `canvasApi`.
- S. A paper quote rides on the item and is painted when the learner opens that page; `not_found` is recorded then. The server also checks the quote against `read_arxiv_paper`'s page text at Make time and re-asks once if it is not on the page.
- T. Web search reuses the unrestricted Exa search `discoverSources` (`learn-search.js:167`); no `SEARCH_SOURCES.web`.
- U. `papers[]` is found by regex at index time (README, docstrings, `CITATION*`), last item of the arXiv slice.
- J. KaTeX math in the document card ships last in the document slice. Runbook is untouched.
- K. Fetched web page text is data in the Make prompt: add the same sentence the base prompt has for repository text. The browser card ships last.
- L. The `learn_sections` migration is applied locally (8878) only. Nothing runs against prod D1 without the owner's go.

## Reviewer second round (01:00)
- M (final). The anchors ride as text in `context`: per anchor one header line `<path>:<start>-<end> @ <commit>`, then the numbered lines. Cap: 8000 characters, the artifact route's own limit (CODE-CHECKS.md); the spec's 300 lines is replaced. Pairings put the quoted passage plus the earlier card's id and kind in `context` the same way. Anchors reach the card as text, not verified evidence; the brief already checked them at the commit.
- `explain` (visual `/interactive`) remains a compose choice only where `EXPLAIN_V2_ENABLED` is on, and is not in the section flow's default set.
- H (final). `SECTION_TOOLS` table in `chat-tools.js`.
- U (until papers[] exists). The source's papers are found with `search_arxiv` on the README's title words.
- tool_choice: copy `learn-code-explain.js:323`: auto, exactly one tool call. No forced turn.

## Owner overnight message (00:52)
- Three agents. Make runs tonight use the draft `tasks/learn-section-make.md`, marked "pre-review". Acceptance runs: nanoGPT 1.1 and 2.1, the datasette canvas's first two sections; brief, compose and every tool as it lands. Morning report in one pushed file: SHA range; built per spec section; the eight briefs and compositions and every made item as returned; costs; BLOCKERS.md; each §acceptance PASS / FAIL / UNRUN.

## Engineering decisions (accepted)
- Research loop with `tool_choice: auto`, then a final forced `submit_*` turn. Test forced `tool_choice` on Sonnet 5.5 once, first, before building the loops. If it returns 400, use auto plus one re-ask, as `learn_plan` does.
- The notebook package list comes from the notebook site if it publishes one; otherwise the Pyodide list as data.
- `learn_section_*` actions get `learn_plan`'s refund and 429 handling.
- `checkpoint.learn` keeps only `currentSectionId` and the section ids with status; briefs, compositions and made lists live in the new `learn_sections` table (`MAX_CHECKPOINT` is 16000 today, still too small for them).

## Reviewer, 10:50 (rehearsal/sections 18831c15 reviewed)
1. `tasks/learn-section-make.md` is accepted as v1 unchanged; the "pre-review" labels can go.
2. An identifier present in the anchored lines may appear in backticks in beat ideas, explanation prompts and leads. Paths, file names and flags are still refused. Update `validateBrief` and `explanation.js`; re-run the datasette 1.2 brief and nanoGPT 2.1 i1.
3. quiz, flashcards and practice are OUT of the section tool set (practice is a later slice).
4. Cost: the 3 bytes a token section estimate and 2 research reads per turn are accepted as is.
5. pdf.js in the Worker: no. Remove the 3.7 MB bundle. Paper quotes resolve in the browser on open (S); the server records `highlight: 'unverified'`; the page count comes from arXiv metadata.
6. Words accepted: the compose-failed sentence, `LEAD_DEFAULT`, the skip note.
7. `after` is allowed on a notebook item too (Make §7c).
8. `purgeTutorRows`: delete `learn_sections` rows, guarded by table existence, before any prod migration is ever discussed.
9. Nothing to main. The owner's click-through on 8878 is the gate.

## Reviewer, 11:00 (on 754a29bbe)
1. One-sentence rule loosened. A beat idea is one idea in one or two short sentences, at most 220 characters. The overlay's sentence 2 of paragraph 2 becomes exactly: "A beat is one idea, said in one or two short sentences, in the order a reader needs them, and each beat ends in something the learner can see, compute or try." `validateBrief`: at most 2 sentences and 220 characters. Re-run the datasette 1.2 brief, then compose it.
2. Numbers in explanation prompts: the rehearsal record's values (vocabulary size 65, token counts, losses, step times) are the source's own facts and are allowed. The Make context gains RECORDED RUN lines from the record, and the explanation validator accepts a number present in the anchors, the brief or the record. The `tasks/learn-section-make.md` paragraph 3 sentence becomes: "A number you write is one that appears in the source lines, the brief or the recorded run." Re-run nanoGPT 2.1 i1.
3. The three pre-existing explain-suite failures are listed in BLOCKERS with their failing assertions. Nothing to main.

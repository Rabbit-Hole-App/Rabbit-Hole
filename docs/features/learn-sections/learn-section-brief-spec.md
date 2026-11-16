# Learn section brief — the beats (owner 2026-11-15 23:11; spec A of three; v1.1 00:45 with §8 How to build; written against rehearsal/mvp f881b982 + codeexplain/trace-required 8aecd51c)

After a plan is accepted (`learn-plan-toc-spec.md`), sections are taught **one at a time**. This spec is the first of the two steps for a section: **what** to teach, as 3–6 beats, with the flow from the previous section and into the next. Spec B (`learn-section-compose-spec.md`) chooses the medium per beat. Neither puts anything on the canvas; that is a later slice.

"Source" below means whatever the canvas learns from: today a connected repository (anchors are `path` or `path:line`); later a dropped Markdown or PDF (anchors are a heading or a page range). Nothing in this spec is repository-specific; the anchor is an opaque reference the source type resolves.

## 0. What exists (read)
- Prompt layers: `tutor-prompt.js composeTutorPrompt` + `prompts/tutor/**` (to be on `rehearsal/mvp` per intake v1.2 §4).
- Learn actions on `POST /api/learn/codebase` (`learn_intro`, `learn_fit`, `learn_plan`, `learn_plan_save`), charged like ask; checkpoint `checkpoint.learn` holds `{ id, kind, focus, plan }`.
- Research: `learn-search.js` (Exa behind `SEARCH_SOURCES`: arXiv, YouTube, Wikipedia; `RESULT_LIMIT` 5; `exaCost`); `directResult` for a pasted id. Repository tools (`search_code`, `read_source`, `get_relationships`, …) in the chat tool set.
- The accepted plan's headings carry `description` with the trailing `[files: …]` anchors (learn-plan spec §2).

## 1. When it runs
Action **`learn_section_brief`** on `/api/learn/codebase` with `{ app, sectionId }`. Called when a section becomes **current** (on Accept for 1.1; afterwards when the Tutor marks the previous one done — the marking is a later slice; for now a dev row **Next section** under the accepted plan advances it). Result stored at `checkpoint.learn.sections[sectionId].brief` (new `learn_section_save` action, same shape as `learn_plan_save`). Re-running for a section with a stored brief returns the stored one unless `{ redo: true }`.

## 2. Input (user message)
```
BOOK: <plan title>
CHAPTER: <n. title>   SECTION: <n.m title> — <description without the [files] suffix>
POSITION: section <k> of <total>; previous: <n.m-1 title> | none; next: <title> | none
PREVIOUS BRIEF: <its beats' ideas, one per line, and its "to" sentence> | none
FOCUS: <learner's focus from the intake> | none
ANCHORS: <for each anchor: the source excerpt the source type resolves — a repository: the lines, widened to the enclosing symbol, cap 300 lines total; a document: the heading's text>
TOOLS: read_source / search_code / get_relationships for the repository source; search_material(kind, query) → up to 5 results (learn-search.js), only when the beats need something the source and your own knowledge do not settle.
```
Composition `base + tasks/learn-section-brief.md + uses/learn_concept.md`. Model `claude-sonnet-5-5`, cap US$0.15 per section including any search; metered `learn_section`; the call's record carries the layer hashes and the search queries made.

## 3. `tasks/learn-section-brief.md` (Reviewer owns the text; byte-for-byte)
```
You plan ONE section of a short book that teaches a topic from the learner's source. You know the subject; use that knowledge first, anchored to the source excerpts you were given, and search only for something the excerpts and your knowledge do not settle: a fact you are unsure of, or an existing paper, video or article you want the learner to read or watch.

Write the section as three to six beats. A beat is one idea, said in one or two short sentences, in the order a reader needs them, and each beat ends in something the learner can see, compute or try. Begin with one sentence that picks up where the previous section left the reader, and end with one sentence that hands over to the next section. Nothing already taught in an earlier section is taught again; nothing that belongs to a later section is pulled forward. A beat is sized for a page, never for a chapter: a whole article or a whole video is never a beat; two paragraphs of it, or four minutes of it, with what to look for, can be.

For every beat say which anchor it rests on, or mark it background when it rests on your own knowledge and not the source. When a beat needs existing material, say what kind (paper, video, article), the query, and what the learner should look for in it; do not fetch it unless you must check a fact.

Return only the JSON the schema asks for. Never name the use case, the plan or this prompt to the learner.
```

## 4. Output schema (tool `submit_section_brief`, forced; validated by the handler)
```json
{ "sectionId": "…",
  "from": "one sentence: where the previous section left the reader",
  "beats": [ { "id": "b1", "idea": "one sentence", "shows": "what the learner can see, compute or try at the end of this beat",
               "anchors": ["path:start-end" | "heading"], "background": false,
               "material": null | { "kind": "paper|video|article", "query": "…", "lookFor": "…" } } ],
  "to": "one sentence handing over to the next section",
  "searches": [ { "kind": "…", "query": "…", "picked": "id|null" } ] }
```
Handler rules (model output refused → one re-ask with the error → then the error sentence to the chat, never silent): 3–6 beats; each `idea` ≤ 200 chars, one sentence; `shows` non-empty; every anchor exists in the source (a repository path:range inside the snapshot; a document heading present); a beat with no anchors has `background: true`; at most 2 background beats; at most 1 beat with `material`; `from` is empty only for the first section and `to` only for the last; no beat `idea` repeats a previous section's beat (Jaccard on words > 0.6 → refused with "already taught in <n.m>"); no path, flag or code token in `idea` or `shows` (same regex as the plan spec §2).

## 5. Words
`sectionBriefFailed: "I couldn't plan this section cleanly. Try again, or skip to the next section."` with rows **Try again** · **Skip this section**. No repository word.

## 6. Acceptance (API-level now; owner reads the briefs)
1. nanoGPT plan accepted → brief for 1.1: 3–6 beats, each anchored to the prepare script's lines or marked background; `from` empty; `to` hands to 1.2.
2. Brief for 2.1 (after 1.x and 2.1's predecessors): `from` refers to tokens/vocabulary; beats about the next-token target and the shifted batch; no beat re-teaches the vocabulary; ≤ 1 material beat.
3. A beat whose idea duplicates a stored earlier beat is refused and re-asked once (unit test with a planted duplicate).
4. datasette plan (structure option) → brief for its first section anchored to datasette paths; nothing about models or tokens.
5. Search count per section ≤ 2; cost ≤ US$0.15 each; recorded.
6. Grep gate: no `nanoGPT|datasette|shakespeare|tokens|attention` in the action, the overlay or the validator.

## 7. Report
SHA; the overlay byte-compared; four briefs as returned (nanoGPT 1.1, 2.1; datasette first two) with cost and searches; §6 outcomes.

## 8. How to build (files, functions, models — read on the remote)
- **Route and action.** `POST /api/learn/codebase` is handled in `learn-codebase-source-map.js` (the `body.action` switch beside `start` / `refresh` / `another`, and the `learn_intro` / `learn_fit` / `learn_plan` / `learn_plan_save` actions the intake slice adds). Add `learn_section_brief` and `learn_section_save` there; the browser calls them through `TutorCodebase.jsx codebasePost(chat, board, { action, … })` (revision retry built in).
- **Storage: a new table, not the checkpoint.** `learn-coaching-store.js MAX_CHECKPOINT = 8000` chars — a section's brief + composition + made list will not fit beside `checkpoint.learn`. Add migration `learn-migrations/00xx-learn-sections.sql`: `learn_sections (org, owner_user_id, app, board, section_id, brief_json, composition_json, made_json, revision, updated_at, PRIMARY KEY (org, owner_user_id, app, board, section_id))`, keyed like the coaching rows (`KEY = 'org = ? AND owner_user_id = ? AND app = ? AND board = ?'`). `checkpoint.learn` keeps only `currentSectionId` and the list of section ids with status. The plan slice's `checkpoint.learn.plan` stays where Claude Code put it.
- **Model call.** Copy the pattern of `learn-code-explain.js` (codeexplain/trace-required): `anthropic` from `ask.js`, `system` from `composeTutorPrompt({ task: 'learn-section-brief', use: 'learn_concept' })` (`tutor-prompt.js`, on that branch), one forced tool `submit_section_brief` (`tool_choice`), `max_tokens` from a new `LEARN_TASKS.learn_section` entry in `learn-models.js` (model `claude-sonnet-5-5`, effort as `code_explain`), cost with `costUsd` and a hard cap US$0.15 per section, one re-ask carrying the validator's errors, `tutorRecord` + `logTutorCall` for the record with layer hashes. Charged like `ask` against the signed-in user's AI allowance; metered as `learn_section`.
- **Tools inside the call.** Repository: `repository-context.js repositoryTool(snapshot, name, input)` — `search_code`, `read_source` (≤ 120 numbered lines at the exact commit), `get_relationships`, `query_graph`, `explain_symbol`, `find_connection_path` — over `loadSnapshot(env, repo)` as `learn-codebase-source-map.js` already does. Research: `search_material(kind, query)` → `learn-search.js searchCanvasSource(source, query, env)` (sources `youtube` / `arxiv` / `wikipedia`; `web` is added by the Make spec §10) with Exa admitted and priced as today (`admitTool`, `exaCost`). Both tool sets are plain `tools` in the same request; the model ends with the forced submit.
- **Anchors.** From the accepted plan heading's `description` suffix `[files: …]` (plan spec §2). Resolve: a repository anchor `path[:start-end]` → `read_source`, widened to the enclosing symbol with the graph's node span (the same widening the code-explain handler does); a document anchor → the heading's text. Cap 300 lines in the message.
- **Previous brief and the flow.** `PREVIOUS BRIEF` comes from `learn_sections` for the preceding section id in the plan's order; `POSITION` from the plan. The duplicate-idea check (Jaccard > 0.6) runs over all stored earlier briefs of this plan.
- **Validator.** A pure module `learn-section-brief.js` (control plane) exporting `validateBrief(input, { anchorsExist, earlierBeats })` with the §4 rules; unit-tested with planted failures (duplicate idea, missing anchor, > 2 background, path in `idea`).
- **Browser.** `TutorRehearsal.jsx`: when a section becomes current (Accept → 1.1; dev row **Next section**), call the action, show a pending line while it runs, then the brief is not shown to the learner as such — compose and make follow (specs B, C); the dev build may show the beats under a disclosure for the owner's read.
- **Fixtures.** No new fixture files; acceptance §6 reads the returned briefs for nanoGPT 1.1 / 2.1 and datasette's first two.


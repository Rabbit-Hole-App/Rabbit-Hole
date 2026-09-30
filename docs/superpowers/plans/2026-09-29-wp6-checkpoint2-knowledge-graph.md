# WP6 Checkpoint 2: Map knowledge-graph layers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The project Map shows Code by default and, through a light Layers control, Decisions, Questions and Sessions linked to code. The right Context/Conversation panel shows why/questions/sessions with provenance, and the Mothership stays the only input. Work memory runs on labelled dev fixtures.

**Architecture:** Pure helpers in `src/map-memory.js`: permission filter, per-node lookup, layer graph and fixture answers. Fixture records live in a preview-only data chunk loaded behind the literal `VITE_COACHING_DEV` guard, the same way `home/review-fixtures.js` loads its data, and only with `?fixtures=1`.

The pieces are wired as follows:
- RepositoryPage merges the enabled layers into the graph it passes to RepositoryGraph.
- The Selected panel gains Why, Questions and Sessions sections, plus entity panels.
- The Conversation panel gains starter prompts.
- A page handler `answerLocally` lets the Agent Bar answer an exact fixture prompt without a network call. The answer is labelled, and a fixture answer never mixes with a model answer.
- The server's repository prompt gains the honest line for real "why" questions.

**Tech Stack:** React 19, Vite 8, Tailwind v4, d3-force (RepositoryGraph), node:test, Playwright harness `e2e/rabbit-hole-check.mjs`, Cloudflare Worker control plane.

**Spec:** docs/features/rabbit-hole-checklist.md, section "Map = conversational knowledge graph (user, 2026-09-28)", plus the user's 2026-09-29 instruction:

> Proceed immediately with the already-scoped knowledge-graph layer: Code, Decisions, Questions, Sessions, provenance, right-side Context/Conversation, Mothership as only input. Use labelled fixtures where real capture does not exist. No Knowledge Capture backend, no tutor-agent work, no new architecture tonight.

## Global Constraints

- **No backend capture.** No Knowledge Capture backend, no new DB tables, no ingestion, no transcript capture, no tutor agent (user, 2026-09-29).
- **Two truths, never mixed.**
  - An answer is either a model answer, where the evidence is code only, or a fixture answer, labelled `Fixture · UI preview` and made with no network call.
  - Fixture data never goes to the model or to any API.
- **Labelling.**
  - `Fixture · UI preview` appears at layer level (the Layers control) and at panel level (entity panels, the Why/Questions/Sessions sections and fixture answers).
  - Fixture participants are roles ("Project maintainer", "Claude Code"), never real names.
- **Permissions invariant:** "A graph answer may only use session/question/decision evidence the requesting user is authorized to access." A private record owned by someone else never reaches the layer graph, a panel list or an answer's evidence.
- **Real behaviour for why-questions.**
  - The model explains what the code does and may infer technical reasons from source, labelled as inference.
  - With no captured evidence it says: "I don't have a recorded project decision explaining why the team chose this."
- **One input.** No text input in the right panel. Starter prompts and prior questions send through the Mothership.
- **Evidence hierarchy** (order in every fixture answer): recorded decision; recorded question/session; code/source evidence; inferred relationship; model explanation.
- **Edges.** Recorded and extracted relations are solid; inferred ones are dashed with confidence.
- **Keep the hairball down.** The default Map shows Code only.
- **Bundles and writes.**
  - The live build ships none of this: live-bundle-check markers.
  - D7: no live D1/R2 writes from the preview. Fixture answers make no request.
- **Commits and deploys.**
  - Plain commits with `git commit --only`, no double quotes in messages.
  - Run `make test-unit` before commits.
  - Deploy only to `small-cp-dev-smart-home`.
- **Out of scope:** no edits to Learn-owned files (LearnPage.jsx, ask.jsx, AdaptiveCanvas.jsx, CanvasMenubar.jsx).

## Review Focus

1. **Fixtures off (the default for any real user).** Layers show Decisions/Questions/Sessions as none recorded. The Selected panel says no recorded decision. Starter prompts still send real questions. Nothing says "Fixture".
2. **A private fixture session of another user.** Absent from the graph, the lists and the answer evidence. It is tested in `map-memory.test.mjs`.
3. **Selecting a fixture entity node** (decision/question/session). The Mothership chips keep the last code node and never carry a fixture id to the model.
4. **An exact fixture prompt sent while fixtures are on.** No `/api/learn/ask` request, and a labelled answer in the panel. Any other text still goes to the model.
5. **Another repository (not karpathy/nanoGPT) with fixtures on.** No memory, so the layers show none recorded and no fixture answers.

## Decisions (rulings made while planning)

- **Sections, not tabs.** Why/Questions/Sessions are sections inside the existing Selected tab; the spec allows "Sections or tabs". Five-plus tabs do not fit a 420px panel.
- **Fixtures follow the existing Review fixtures switch** (`?fixtures=1`, `small.preview:review-fixtures`). Memory exists only for `karpathy/nanoGPT`, keyed by real snapshot node ids (verified on repo-06745f10-nanogpt @ 3adf61e).
- **Fixture answers are served for three kinds of text only:**
  - "Why does this exist?" on a code node with decisions;
  - a prior question's exact text;
  - the starter "Which decisions shaped this codebase?".
  Everything else goes to the model.
- **Deferred (ponytail):** natural-language graph commands ("show every decision related to attention", "what did engineers struggle with here", /research why).
  - The panel gives the same actions as buttons: a decision's code chips select the code, and Questions and Sessions list per node.
  - /research stays off outside canvas (WP5 decision).

## File Structure

- **Create** `packages/web/src/map-memory.js`: pure helpers `visibleMemory`, `memoryFor`, `layerGraph`, `fixtureAnswer`, `STARTERS`, `WHY`, `MEMORY_KINDS`.
- **Create** `packages/web/src/map-memory.test.mjs`: unit tests.
- **Create** `packages/web/src/home/map-memory-data.js`: preview-only fixture records for karpathy/nanoGPT.
- **Modify** `packages/web/src/home/review-fixtures.js`: `useMapMemory(on)` loader (the same literal guard).
- **Modify** `packages/web/src/RepositoryGraph.jsx`: memory node shapes, RECORDED solid, memory and linked code nodes kept in the overview.
- **Modify** `packages/web/src/RepositoryPage.jsx`: the Layers control, merged graph, Selected sections, entity panels, starter prompts, the `answerLocally` handler, and entity selection that keeps the bar on code.
- **Modify** `packages/web/src/agent/AgentBar.jsx`: `small:bar-ask` event (sends through submit) and the `answerLocally` interception in `ask()`.
- **Modify** `packages/web/src/agent/ResultSheet.jsx`: renders `t.fixture` label and `t.evidence` list.
- **Modify** `packages/control-plane/src/repository-context.js`: the honest why line in `REPOSITORY_SYSTEM`. Test: `packages/control-plane/test/repositories.test.js`.
- **Modify** `packages/web/e2e/rabbit-hole-check.mjs`: `wp6-kg-*` checks.
- **Modify** `packages/web/e2e/live-bundle-check.mjs`: markers `data-map-layers`, `Which decisions shaped this codebase?`, and a fixture data string.

---

### Task 1: map-memory helpers

**Interfaces:**
- **Produces:**
  - `visibleMemory(memory, email) -> memory`, for memory shaped `{decisions, questions, sessions}`.
    - Each record has `{id, fixture: true, visibility: 'project'|'private', owner}`.
    - It drops private records not owned by `email`, and drops references to dropped sessions and questions.
  - `memoryFor(memory, nodeId) -> {decisions, questions, sessions}`.
    - A record links code through `code: [{id, confidence: 'RECORDED'|'INFERRED', score?}]`.
  - `layerGraph(graph, memory, layers) -> {nodes, edges}`.
    - `layers` is a `Set` of `'decisions'|'questions'|'sessions'`.
    - Memory nodes: `{id, label, kind: 'decision'|'question'|'session', record}`.
    - Edges: `{source: entityId, target: codeId, relation: 'decided'|'asked_about'|'touched', confidence, score, context}`.
    - Only code ids present in `graph.nodes` are linked.
  - `fixtureAnswer(text, {node, memory, graph}) -> {text, evidence: [{kind, label, detail}]} | null`.
    - `kind` is one of `decision`, `question`, `session`, `code`, `inferred`, `model`, in that order.
  - `STARTERS` (5 strings), `WHY = 'Why does this exist?'`, `DECISIONS_STARTER = 'Which decisions shaped this codebase?'`, `MEMORY_KINDS`.

- [ ] Step 1: write `map-memory.test.mjs`. It covers:
  - private filtering, including a question pointing at a hidden session;
  - `memoryFor` returns only linked records;
  - `layerGraph` adds only enabled kinds and skips unknown code ids;
  - RECORDED vs INFERRED edges;
  - `fixtureAnswer` for WHY, a prior question (resolved and unresolved), DECISIONS_STARTER, any other text (null), and a node without decisions (null);
  - evidence order follows the hierarchy;
  - hidden records never appear in the evidence.
- [ ] Step 2: run `node --test src/map-memory.test.mjs` from packages/web. Expected: FAIL, module missing.
- [ ] Step 3: implement `map-memory.js`.
- [ ] Step 4: rerun. Expected: PASS.
- [ ] Step 5: commit `feat(web): map-memory helpers - permission filter, per-node memory, layer graph, labelled fixture answers`.

### Task 2: fixture records and loader

- [ ] Step 1: extend `map-memory.test.mjs`. Every record in `home/map-memory-data.js` must have:
  - `fixture: true`;
  - code ids from the verified nanoGPT id list;
  - no private record owned by the test viewer.
  At least one private record must belong to another owner.
  Run it. Expected: FAIL, data module missing.
- [ ] Step 2: write `home/map-memory-data.js`:
  - 6 decisions: fused QKV, flash attention with fallback, LayerNorm optional bias, weight tying, 2-D weight decay, exec configurator;
  - 6 questions, one of them private to another owner;
  - 4 sessions, one private to another owner.
  Keyed by repo `karpathy/nanoGPT`.
- [ ] Step 3: add `useMapMemory(on, repo)` to `review-fixtures.js`. It dynamically imports the data only when `on && import.meta.env.VITE_COACHING_DEV === 'true'`, and returns `memory[repo.toLowerCase()] || null`.
- [ ] Step 4: run the tests. Expected: PASS. Commit.

### Task 3: graph layers and panel

- [ ] Step 1: add browser checks `wp6-kg-layers`, `wp6-kg-selected`, `wp6-kg-entity` and `wp6-kg-starters`, plus the live-bundle markers.
  - `wp6-kg-layers`: with fixtures off, Decisions/Questions/Sessions are disabled as none recorded and no `Fixture` text shows. With `?fixtures=1`, turning on Decisions adds `[data-memory-node=decision]` nodes and shows `Fixture · UI preview` in `[data-map-layers]`.
  - `wp6-kg-selected`: CausalSelfAttention shows Why (2), Questions and Sessions counts with fixtures on. With fixtures off it shows the no-recorded-decision line.
  - `wp6-kg-entity`: selecting a decision node shows its fields and provenance, and a code chip selects the code node. The bar chip never names the decision.
  - `wp6-kg-starters`: the empty Conversation lists the 5 starters. Clicking one puts the question in the conversation through the bar, with the ask held.
  Run them against the current clone. Expected: FAIL.
- [ ] Step 2: RepositoryGraph.
  - Memory kinds render as shapes: decision diamond, question rounded square, session ring, each with `data-memory-node={kind}`.
  - Solid when confidence is EXTRACTED or RECORDED.
  - The overview keeps memory nodes and their linked code nodes ahead of the degree sort.
  - The info menu gets a shape legend.
- [ ] Step 3: RepositoryPage.
  - A `data-map-layers` toggle row in graph mode: Code (always on), Decisions n, Questions n, Sessions n. With fixtures off they are disabled with the title "None recorded yet". With fixtures on and any layer active, a Fixture pill shows.
  - The merged graph goes to RepositoryGraph.
  - `choose(node)`: a memory node sets `selected` only. `asking`, and so the bar chip, stays on code.
  - The Selected panel shows, for a code node:
    - header and path:line;
    - Why (n) with provenance badges;
    - Questions (n): each click sends through the bar;
    - Sessions (n): each click selects the session;
    - Relationships with extracted/inferred;
    - `[Why does this exist?]` (sends through the bar);
    - `[Learn this]`.
  - For an entity it shows the entity panel with fields, provenance and code chips.
  - The Conversation empty state shows starter buttons.
- [ ] Step 4: run the checks. Expected: PASS. Commit.

### Task 4: fixture answers through the Mothership

- [ ] Step 1: add browser check `wp6-kg-why`. With fixtures on and CausalSelfAttention selected, clicking `[Why does this exist?]`:
  - shows a user turn and an answer labelled `Fixture · UI preview` in the panel;
  - lists evidence in hierarchy order;
  - makes zero `/api/learn/ask` requests.
  With fixtures off, the same click makes exactly one (held) request. Expected: FAIL.
- [ ] Step 2: AgentBar.
  - `small:bar-ask` `{text}` calls `submit(text, 'ask')`.
  - In `ask()`, after the availability check: `const local = getSurface().handlers?.answerLocally?.(text, scope)`. If it returns an answer, add the user and answer turns with `{done: true, fixture: true, text, evidence}` and return. There is no network call.
- [ ] Step 3: ResultSheet `Turn` renders `t.fixture` as a `Pill` "Fixture · UI preview" above the text, and `t.evidence` as `<ol data-evidence>` rows `{kind label} · {label} - {detail}`.
- [ ] Step 4: RepositoryPage publishes `handlers.answerLocally`. It returns `fixtureAnswer(...)` only when the scope is this project and fixtures memory is loaded.
- [ ] Step 5: run the checks. Expected: PASS. Commit.

### Task 5: honest real why-answers

- [ ] Step 1: in `control-plane/test/repositories.test.js`, assert `REPOSITORY_SYSTEM`:
  - includes "I don't have a recorded project decision explaining why the team chose this.";
  - asks for inference from source to be labelled.
  Expected: FAIL.
- [ ] Step 2: append the rule to `REPOSITORY_SYSTEM`. Expected: PASS. Commit.

### Task 6: verify, deploy, capture

- [ ] Full unit suite. Deploy feature/smart-home to `small-cp-dev-smart-home`, using the parallel-deploys procedure and building with the dev flags. The clone then no longer carries the Learn integration merge; that build is kept only as evidence.
- [ ] Run the live-bundle check (it must fail against dist-dev to prove the markers), then the full rabbit-hole suite.
- [ ] Captures, with captions saying real vs fixture:
  - K1 Map default code layer (real)
  - K2 selected code node (fixture sections)
  - K2r selected code node with fixtures off (real: no recorded decision)
  - K3 "Why does this exist?" in the bar with scope chips
  - K4 the fixture answer in the right panel
  - K5 a recorded Decision linked to code
  - K6 Questions layer
  - K7 a prior question answered
  - K8 Sessions layer with a relevant session
  - K9 inferred vs recorded relation
  - K10 onboarding starter prompts (real)
  - K11 Learn this leading to Learn (real)
- [ ] Inspect the pixels, then Figma section `WP6 · checkpoint 2 (knowledge graph)` on page 32:222. Send the exact node URL and stop for review.

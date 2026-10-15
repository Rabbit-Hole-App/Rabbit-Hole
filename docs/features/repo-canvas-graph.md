# Repository learning inside the canvas: graph companion panel and contextual suggestions

(Owner brief, received 2026-10-15 after the References release. Saved verbatim below the implementation notes.)

## Implementation notes (lead, Release 1)

### What existed before (brief section 1), on production main 6f7f8c59

- **Start from a repository:** "Start a rabbit hole", Repository tab: GitHub URL, Check repository, Branch, then a "Connect owner/repo" confirm (StartDialog.jsx, agent/commands.js).
  - Endpoints: `GET /api/repositories/branches`, then `POST /api/repositories`.
  - The repository is a project row, `repository_apps`, named `repo-<8hex>-<name>`. Its Main canvas is `learn_boards` app=<name>, board main, created in the same batch.
  - Other canvases link to it through `canvases.project`, set only at creation. There is one repository per canvas and no attach-later path.
- **Graph view:**
  - `/apps/repo-*` rendered RepositoryPage with a Files | Graph | Learn switcher (Graph by default; `?tab=learn` was the canvas).
  - RepositoryGraph.jsx is hand-rolled SVG with d3-force. Nodes are the indexer's file types, symbols and externals, plus fixture memory kinds. Edges carry `{relation, confidence}`; EXTRACTED or RECORDED draws solid, anything else dashed.
  - Selection was single. Double-click or Shift+Enter explores one hop. Search, zoom, pan and node drag.
  - Actions: Back, Zoom in, Zoom out, Reset graph, Graph information; Layers (fixtures); Repository details (Refresh branch / Retry import); More (the card menu).
  - Inspector actions: Learn this, Open source, Ask about this, Ask why, and the Source / Chat tabs.
- **Indexing:**
  - Durable Object RepositoryImports drives the lesson renderer: an anonymous `git ls-remote`, then a codeload zip.
  - The snapshot (graph plus file texts) is stored in R2 `REPOSITORY_SNAPSHOTS`, keyed per commit and listed in D1 `repository_versions`.
  - Limits: 20 MB zip, 2000 files, 10,000 nodes, 30,000 edges.
  - Reads: `GET /api/repositories/<name>/snapshot` and `POST .../file`. Every route is owner-only. Imports are public GitHub only.
- **Chat:**
  - Ask on a repo-* canvas goes to `repositoryAsk` with tools (search_code, read_source, query_graph, get_relationships…) over that snapshot, and `repository_context` holds one selected object.
  - Project canvases get the same tools in apiAsk (`projectRepository`).
- **Context lifecycle:**
  - Temporary canvas selection is `canvas_target`.
  - Pinned "Add to chat" refs are useChatContext's `context_refs`: deduplicated by sourceId plus range, at most 20, per thread; New chat starts with none. Code refs are `code:<repo>@<commit>:<path>`.
- **Curious:** NextStepsCard / useNextSteps, `POST /api/learn/tutor/next-steps`. It is debounced, cached per basis hash and edge-cached. It had no repository input.
- **Chat suggestions:** the model's `<answer_meta>` trailer, drawn by AnswerSuggestions. AnswerFooter's buttons are fixed.

### Old links (decision 2 and its correction)

- `/apps/repo-*`, at any `?tab`, opens the canvas.
- `?tab=map|graph|agent|overview|sources` opens Graph beside Chat once. `?tab=code` opens Files once (the correction's wording; historically `?tab=code` was the code page, which opened on its Graph view).
- The URL then becomes the plain one, so a reload opens neither viewer. `?canvas=<canvas>` keeps its project canvas.
- The card menu's project item "Map" is now "Explore codebase", which opens the canvas with Graph.

## Goal

Make the canvas the main workspace when someone starts a Rabbit Hole from a repository.

Keep the repository graph as an optional tool for exploring code and choosing question context. Move it into the existing companion panel beside Chat—the same panel area used to inspect context and referenced files.

Also distinguish two kinds of suggestions:
- “Curious where this goes?” proposes deeper technical learning directions grounded in the repository and current learning activity.
- Suggestions inside Chat help investigate the repository’s implementation and continue the conversation.

Do not hardcode subjects, repository names, example questions or trigger phrases.

## 1. Inspect the existing implementation first

Trace and document briefly:
- How “Start Rabbit Hole from repository” connects a repository to a canvas.
- The existing Graph view, its node types, relationship types, selection handlers and unique actions.
- Repository indexing, revision tracking, file retrieval and permissions.
- The Chat panel and its existing companion/context viewer.
- Temporary selection context versus explicitly attached chat context.
- The current “Curious” generation, caching, refresh and context-building paths.
- Existing chat follow-up suggestions and answer actions.

Reuse these paths. Do not build a second repository ingestion system, graph renderer, chat composer or suggestion service.

Before removing the old Graph entry point, account for every useful action it currently exposes and preserve it in the new flow.

## 2. Canvas is the main repository workspace

“Start Rabbit Hole from repository” remains available.

After the existing connection/setup flow:
- Open the associated canvas.
- Keep its repository association available to Chat and Curious.
- Allow the user to ask about the repository without opening the graph or selecting a node.
- Do not force a graph view before the user can begin learning.

Remove Graph as a separate top-level workspace destination once its functionality is available through the new panel.

Preserve existing saved graph state and repository associations. Handle old Graph URLs with an appropriate redirect or compatibility route to the associated canvas and graph panel, subject to normal access checks.

The Rabbit Hole map remains unchanged. It represents parent/child learning navigation and is distinct from the repository graph.

## 3. Graph entry point in the chat composer

For a canvas with a connected repository, add a graph icon to the existing chat composer controls.

- Tooltip: “Explore codebase”.
- Accessible name: “Explore codebase”.
- Follow existing icon sizing, spacing, hover, focus and active-state conventions.
- Place it in the existing contextual tool controls without crowding the composer.
- Show it when a repository is connected, including a repository added after canvas creation.
- Do not base its visibility solely on how the canvas was originally created.
- Hide it when the canvas has no repository association.

Clicking it opens the graph in the existing companion panel next to Chat.

Opening the graph must not send a message, generate an answer or make a paid model call.

If multiple repositories can already be associated with a canvas, preserve that capability and make the active repository explicit. Do not silently choose the first repository.

## 4. Exact panel layout

This is NOT:
- a graph above Chat;
- Chat split into upper and lower halves;
- a new full-screen Graph workspace;
- a floating answer window;
- a third side panel.

Use the existing companion viewer where context documents or referenced code appear.

The layout is:
- the canvas remains the main workspace;
- Chat remains in its existing right-side panel;
- the graph occupies the adjacent companion/context panel.

Reuse the current resizable panel components and layout rules.

When a PDF or file is already open in that companion panel, opening Graph switches the companion content. It does not remove the attachment or open an additional panel.

Requirements:
- Chat history and draft remain intact.
- Graph and Chat remain usable together on desktop.
- The actual canvas viewport updates to the available width.
- Do not reposition saved canvas objects when panels open or resize.
- Do not introduce the earlier bug where cards are clipped before the real canvas boundary.
- On narrow screens, use the existing responsive viewer/navigation behaviour rather than squeezing both panels into unusable columns.

## 5. Graph interactions and state

Reuse the existing graph’s supported interactions.

At minimum, preserve:
- node selection;
- existing multi-selection behaviour;
- zoom and pan;
- available node search;
- relationship inspection;
- opening the corresponding source file or symbol.

Fit the graph to the companion panel on first opening when no saved state exists. Do not repeatedly reset its camera when Chat streams, the panel resizes or the user returns from a source file.

Keep graph gestures within the graph. Panning or selecting in the graph must not also pan or select objects on the canvas behind it.

Preserve the graph’s position, zoom and selection when switching between Graph and a file preview during the session.

Use stable repository/node identities. Labels alone are insufficient.

Do not introduce document or graph persistence migrations solely for temporary viewer state without demonstrating the need.

## 6. Selecting graph nodes prepares chat context

Selecting a supported node adds temporary selection context above the composer.

The chip should identify the selected file or symbol clearly, with repository/path information available where needed.

For several nodes:
- preserve each distinct identity;
- use a compact presentation with an inspectable overflow list;
- avoid filling the composer with a long row of chips.

Selecting a node must not:
- send a message;
- call an AI model;
- automatically create a canvas card;
- erase the user's draft;
- replace explicit attachments;
- remove the canvas context package.

### Temporary selection versus Add to chat

Reuse the same context lifecycle as other selection surfaces:

- Graph selection supplies temporary context.
- “Add to chat” pins the selected items to the active conversation.
- Pinning changes the existing chip’s state; it does not create a duplicate chip.
- Clearing graph selection removes temporary graph context, but leaves pinned attachments.
- Removing a pinned chip removes that attachment. It must not immediately reappear because the graph still holds the same selection; use the existing explicit-removal behaviour or clear the associated temporary selection.
- Explicit attachments remain scoped to the correct chat thread.
- New Chat does not inherit the previous thread's pinned attachments.

Use a canonical context identity based on repository, revision and file/symbol identity. Different files with the same name are not duplicates.

Closing the companion viewer preserves pinned context and the draft. Clear temporary graph selection context on close so an invisible selection does not silently influence a later question.

The UI and request payload must agree: one visible attachment must not become two copies in the model input.

## 7. Repository context in questions

The graph selects context; it does not define the entire search boundary.

### With no selected node

The user can ask a repository-wide question. Use the existing repository retrieval path to find relevant code.

Do not require a selection and do not send the whole repository indiscriminately.

### With a selected node

Supply or resolve:
- repository identity;
- indexed commit/revision;
- file path;
- symbol identity and relevant range, where supported;
- relevant source code;
- known graph relationships and their provenance.

Do not send only a node label or a screenshot of the graph and expect the model to infer the implementation.

### With multiple selected nodes

Include the selected entities and useful relationships. Retrieve other files when necessary to answer correctly.

### On every turn

Combine repository context with:
- the user's explicit request;
- recent conversation;
- explicit attachments;
- the existing whole-canvas context package.

Respect the existing context budget and accurate coverage labels.

Selection must not hide the rest of the canvas or prevent retrieval outside the selected files. A request on another subject must remain allowed.

Never describe unavailable or omitted source code as inspected.

## 8. Revision consistency and permissions

All repository reads must use the existing authorization rules.

- A graph node or client-supplied path is not proof of access.
- Recheck access when retrieving source or answering a question.
- Do not expose private file names, snippets or relationships through shared canvases.
- Preserve the existing public/shared repository restrictions.
- When access is revoked, show an unavailable state and stop further reads.

Do not silently combine a graph from one commit with source code from another.

Show the indexed revision and any stale/indexing status in a compact form. If the repository is updated, reconcile selected nodes and attachments. A missing symbol should become unavailable rather than silently pointing at different code.

A graph edge must retain its actual meaning: import, call, dependency or whatever the existing index supports. Distinguish indexed relationships from model-inferred relationships.

## 9. Answers and source navigation

Answers appear in the existing Chat conversation.

Clicking a code citation:
- opens the corresponding file in the companion panel;
- uses the cited revision;
- highlights or scrolls to the relevant range;
- provides “Back to graph”.

Returning to Graph restores its prior position and selection.

Viewing a citation must not automatically pin that file to Chat or replace the user's question context.

Reuse existing answer actions where relevant:
- Add as card;
- Draw the flow;
- Start Rabbit Hole;
- other supported actions appropriate to the answer.

Do not show the same fixed action set beneath every answer. Do not generate anything merely because an action is suggested.

## 10. “Curious where this goes?”: deeper technical learning

For a repository-started canvas, the initial three Curious options should be grounded in the connected codebase.

Their purpose is to help the user understand the technical concepts behind the implementation.

For an AI/ML repository, possible directions include:
- why a particular attention mechanism is used;
- how an implemented training objective affects representations;
- trade-offs in a retrieval architecture;
- the mathematical idea behind a loss function.

These are examples only. Generate suggestions from concepts supported by the actual repository.

Do not assume every repository is AI/ML:
- a compiler may lead to parsing, type systems or optimization;
- a graphics project may lead to rendering or geometry;
- another field should surface its own relevant technical concepts.

Avoid filling Curious with routine code-navigation questions such as “Where is login handled?” Those belong in Chat.

### Suggestion context

Use the existing suggestion pipeline with:
- repository identity and indexed revision;
- relevant README/documentation and retrieved implementation evidence;
- selected graph entities when present;
- live canvas content;
- recent learning activity and relevant conversation.

Keep the three options meaningfully different, with concise wording and a clear learning direction.

Do not create a new AI request for every hover, selection movement or keystroke. Reuse caching, refresh and debouncing mechanisms.

A repository title is only a weak hint. Suggestions must follow what the user is actually working on.

If the user moves to another topic, Curious adapts. A connected repository must never become a topic restriction.

## 11. Suggestions inside Chat: implementation and follow-up

Chat suggestions have a different purpose: help the user investigate this codebase and continue the current conversation.

Examples, only when supported:
- trace a real request through its handlers;
- inspect how a particular state change is persisted;
- identify callers of the selected function;
- compare two implementations;
- explain a relevant test or failure path.

Generate these from:
- the current question and answer;
- selected files or symbols;
- retrieved code;
- recent conversation.

Reuse the existing chat suggestion UI. Do not add another permanent suggestion widget.

Keep follow-up questions distinct from action buttons:
- a question continues the conversation;
- an action creates or opens something.

Use the existing submission and confirmation behaviour. Neither type should execute automatically.

## 12. Loading, empty, stale and error states

Handle these explicitly:

- Repository indexing: show indexing status. Do not fabricate repository-specific suggestions.
- No graph data: explain what is unavailable; keep repository questions available if retrieval works.
- Node without retrievable source: identify the limitation.
- File removed or revision stale: show the actual state and an appropriate refresh path.
- Lost repository permission: show unavailable without leaking private metadata.
- Graph load failure: offer Retry; preserve Chat and the draft.
- Suggestion failure: keep a clear retry/refresh state without replacing good existing suggestions with invented content.

Late responses from another canvas, repository, thread or revision must not update the current panel, selection or suggestions.

## 13. Performance

- Lazy-load the graph when its icon is used.
- Reuse already loaded/indexed graph data where safe.
- Avoid rebuilding the graph on every Chat token.
- Avoid re-fetching unchanged source files on every render.
- Keep typing, graph interaction and canvas interaction responsive.
- Key caches by repository revision and authorization scope as appropriate.
- Do not mix different users' private cached context.
- Opening, closing, panning and selecting in the graph require no paid model calls.

Report any material loading or responsiveness limitation encountered during implementation.

## 14. Focused verification

Extend the existing checks that exercise these flows.

Verify:
1. Repository start opens the canvas and exposes the composer Graph icon.
2. The graph opens in the companion panel beside Chat, not above it.
3. Chat draft/history survive panel switching and resizing.
4. Selecting a node updates temporary context without a model call.
5. Add to chat pins without duplicate chips or duplicate request content.
6. Clearing selection and closing the viewer follow the defined context lifecycle.
7. A repository-wide question works without a selected node.
8. Selection questions include the correct repository, revision and code.
9. Code citations open the correct file/range and return to the preserved graph.
10. Private/shared permissions and revoked access hold.
11. Late responses cannot mix canvases, threads or repositories.
12. Curious proposes technical learning directions while Chat proposes relevant implementation follow-ups.
13. Suggestions adapt to a new topic rather than enforcing the repository's topic.
14. Existing Rabbit Hole navigation and map behaviour remain intact.
15. Narrow layouts, global panel hiding and canvas viewport resizing work.

Use deterministic checks for UI, context payloads, permissions and lifecycle behaviour.

A scripted response proves plumbing, not the quality of real generated suggestions. Report those separately. Any real-model verification must use an explicitly authorized budget.

## Deliverable

Provide:
- the exact implementation commit;
- a concise account of how existing graph actions were preserved;
- screenshots of the graph beside Chat, selected-node context, source-file navigation and a narrow layout;
- implementation versus verification results;
- any remaining limitations.

Do not expand this into a new graph visualization engine or a general knowledge-graph feature.

## Graph → Add to canvas

Add an “Add to canvas” action for selected graph nodes:
- In the graph’s selection controls.
- In the node right-click menu.
- Use an icon with a tooltip where space is limited; use the full label in the menu.

Keep it distinct from “Add to chat”:
- Add to chat attaches code context to the conversation.
- Add to canvas creates a persistent code-reference card on the current canvas.

### Card contents

For each selected node, create a card containing:
- file or symbol name;
- repository and file path;
- referenced commit/revision;
- relevant code excerpt when available;
- an “Open source” action that opens the corresponding file/range in the companion panel.

Reuse the existing code/card components and syntax highlighting.

Do not generate an AI explanation automatically. This action should make no paid model call.

The saved card must retain a structured source reference, not just a text label or screenshot. Selecting it or using Add to chat must resolve the same source context, subject to permissions.

### Multiple nodes and placement

- One selected node creates one card.
- Multiple selected nodes create a compact group of cards.
- Preserve indexed relationships between selected nodes using labelled connectors where supported. Do not invent relationships or include unselected neighbours automatically.
- Place the new cards in available canvas space using the existing placement logic, accounting for open panels.
- Do not overlap or move existing objects.
- Fit or pan to the new group only as needed to reveal it.
- One Undo removes the entire insertion; Redo restores it.

### Persistence and access

Cards survive reload and retain their referenced revision. Do not silently replace their code with a newer revision.

An existing equivalent reference on the canvas should be revealed/highlighted rather than accidentally duplicated.

Creating a card does not grant repository access. Audit how saved excerpts behave on shared, published or copied canvases: private code must not become visible to someone merely because the card was added or copied. Reuse the existing repository-sharing safeguards.

### Verification

Cover single and multiple selection, correct source/revision, placement, Undo/Redo, reload, duplicate prevention, source opening and unauthorized access.

Keep Graph → Add to canvas independent from Chat: it must not send a message, pin attachments or clear the draft.

# Clarification: code-file cards AND interactive graph cards

Support two distinct canvas objects:

1. A code-file card, created from a repository file/symbol or an uploaded code file.
2. An interactive graph card, containing the whole available repository graph or a selected subgraph.

An interactive graph card is not a screenshot and is not automatically converted into individual code cards.

## 1. Explicit Add to canvas choices

In the repository companion panel:

- Files/source viewer: “Add code card”.
- Graph controls: “Add graph to canvas”.
- Graph selection controls/right-click menu:
  - “Add selection as graph”.
  - “Add code card” when the selected node represents retrievable code.

“Add graph to canvas” includes the whole available indexed graph. If indexing or loading is partial, say so; do not describe the loaded viewport as the whole repository.

“Add selection as graph” includes selected nodes and known relationships between them. Do not silently add neighbours.

These actions do not send a chat message or make a paid model call.

## 2. Dropping code files onto the canvas

Support dropping a code file from the user's computer onto the canvas.

Reuse the existing file-drop decision dialog. Do not silently open a notebook or execute the file.

- Offer “Code card”.
- Preserve existing notebook/import options where the file type supports them.
- Cancel/Escape adds nothing.
- If multiple files are dropped, make the intended import clear before creating cards.
- Show upload/import progress and a useful failure state.
- Use the existing storage, size limits and permissions.
- Do not pretend a failed upload is saved.

For repository files, support dragging from the file browser or using “Add code card”. Both use the same creation path.

Distinguish external file drops from normal canvas-object dragging.

## 3. Code-card behaviour

Show:
- file name and language;
- syntax-highlighted code;
- repository/path/revision for repository-backed files;
- uploaded-file provenance for local uploads;
- appropriate controls such as Expand, Copy and Add to chat.

For repository-backed cards, Open source opens the correct revision and range in the companion panel.

For uploaded files, Open source opens the stored file viewer. Do not invent a repository association.

Long files need a bounded preview and an expanded viewer. Preserve the complete stored file, and clearly indicate when only an excerpt is displayed or supplied to AI.

Code is inert by default. Adding, selecting or opening a code card never executes it.

Reuse existing Open in Notebook support where compatible. Running code remains an explicit action in the notebook.

For this MVP:
- Treat the imported source snapshot as read-only.
- Allow card title and annotation changes.
- Do not write changes back to GitHub or overwrite the uploaded original.
- If existing AI editing creates a revised code version, preserve it as a distinct derived version with clear provenance.

## 4. Interactive graph-card behaviour

Reuse the existing graph renderer and data model.

Users must be able to:
- pan and zoom inside the graph;
- select one or several nodes;
- inspect supported relationship types;
- search within the card's graph;
- open a node's source;
- add selected code to Chat;
- create a code card from a node;
- expand the graph into the companion viewer;
- start a Rabbit Hole from supported selections.

Keep controls compact. Use tooltips and accessible names for icon-only controls.

The graph card must show:
- repository name;
- referenced revision;
- whether it represents the whole indexed graph or a selected subgraph;
- loading, stale, partial or unavailable status when applicable.

Do not invent relationships or silently expand the graph's scope.

## 5. Canvas selection versus graph-node selection

Make the two interaction levels clear:

- Selecting the card selects the graph as a canvas object.
- Interacting inside the graph selects graph nodes.
- Dragging the card header moves the card.
- Dragging the graph background pans the graph.
- Graph interactions must not also pan the outer canvas or drag the card.
- Canvas resize handles resize the card; graph layout must respond without losing selection.
- Scope keyboard handlers to the active surface.

Escape should first close an open menu, then clear an internal graph selection when present. It must not simultaneously clear unrelated canvas state.

Delete/Backspace must never delete repository files or silently remove graph nodes. Deleting the canvas card is allowed only through the normal canvas-object selection behaviour.

Verify keyboard access as well as pointer interaction.

## 6. Context from cards and internal selections

Use one consistent context system across:
- the companion graph;
- graph cards;
- code cards;
- explicit chat attachments.

When graph nodes are selected, temporary chat context identifies those nodes.

When the graph card itself is selected without internal nodes, context identifies the graph's scope. Retrieve relevant code for the question rather than sending every file.

For a selected code card, context identifies its actual stored source or pinned repository revision.

“Add to chat” pins context without creating duplicate chips or duplicate request content.

Use canonical identities to deduplicate a file selected in both a graph and a code card. Different revisions or different selected ranges must remain distinguishable.

Closing an expanded viewer must not leave invisible temporary selection context influencing the next question.

The existing whole-canvas context package still accompanies questions. A selected file or graph does not restrict the user to that subject.

## 7. AI and learning actions

Ctrl+K Explain can use:
- the graph card as a whole;
- selected nodes;
- a selected code card or supported code range.

Resolve actual source code and indexed relationships. A node label alone is insufficient.

Disable graph-structure Edit for this MVP. There is no defined meaning for AI editing the repository graph, and it must not mutate the repository.

“Start Rabbit Hole” uses the selected component or graph scope as the starting context. Carry its repository/revision reference into the child canvas through the existing flow.

Existing Curious suggestions should respond to this learning context:
- deeper technical concepts in Curious;
- implementation investigation and conversational follow-ups in Chat.

Opening or exploring a card makes no paid model call. AI generation remains an explicit user action, subject to existing controls.

## 8. Persistence and graph storage

Persist enough information to reopen the same graph scope at the same repository revision.

Do not serialize renderer objects or duplicate an entire large repository graph inside every board save.

Inspect the existing graph storage/cache first. Prefer a durable, permission-checked reference to a versioned graph snapshot, plus compact card state:
- snapshot/repository identity;
- revision;
- whole-graph or selected-subgraph scope;
- selected node IDs defining that subgraph;
- card title and dimensions;
- useful graph camera/layout state.

Do not confuse a transient renderer cache with durable persistence. If a referenced snapshot is unavailable, show a recoverable state rather than silently loading a different revision.

Account for the existing board size limit. Propose additional storage only if the current infrastructure cannot support this safely.

A newly reopened card should not resurrect temporary chat selection automatically.

## 9. Placement, duplication and Undo

Use the existing placement engine.

- Place at the drop location when usable; otherwise find nearby free space.
- Button-based insertion uses available space in the actual canvas viewport.
- Account for open side panels and the central BlockNote document when visible.
- Do not move existing objects to make room.
- One import action is one Undo operation.
- Redo restores the same imported object and source reference.
- Do not re-upload or regenerate merely because the user uses Redo.

Prevent accidental double-click/network-retry duplicates using the insertion operation identity.

Do not forbid intentional duplicates: users may want the same file or graph in two canvas locations. The normal Duplicate action should work while sharing the underlying immutable source asset where appropriate.

## 10. Permissions and sharing

Adding a card does not grant access to its repository or underlying files.

Check permissions for:
- graph metadata and node labels;
- code excerpts;
- expanded source views;
- AI retrieval;
- shared, published, copied and forked canvases.

A private code excerpt stored directly in public board JSON would leak even if Open source is protected. Inspect and prevent that path.

Never expose private node names, paths, relationships or source content to an unauthorized viewer.

On revoked access, show an unavailable state and prevent further reads. Do not claim already downloaded content can be retroactively erased.

Deleting a card removes the canvas reference. It must not delete repository files or a shared source asset still used elsewhere.

## 11. Performance and lifecycle

- Lazy-load graph rendering.
- Avoid re-rendering every graph card as Chat streams.
- Suspend expensive rendering/layout work for off-screen cards where supported.
- Use bounded rendering for large graphs.
- Do not silently truncate graph scope; report any display limit.
- Preserve card state when expanding and returning.
- Late loads must not populate a deleted card or another canvas.
- Reloading must restore the card without new AI generation.

## 12. Focused verification

Extend existing checks to cover:
- local code-file drop, confirmation, cancellation and reload;
- repository file insertion with correct revision;
- whole-graph and selected-subgraph insertion;
- graph interaction without accidental outer-canvas movement;
- node context, Add to chat and deduplication;
- source navigation and expansion;
- Undo/Redo and intentional duplication;
- correct placement beside existing objects and the editor document;
- private/shared/revoked-access cases;
- loading failures, deleted cards and late responses;
- large-graph responsiveness and board-size behaviour.

Report what was implemented separately from what was verified. Most of these checks require no paid model calls.

---

# Owner decisions (received 2026-10-15 ~8:50 AM PT, verbatim)

We ARE proceeding with the graph changes. BlockNote and references are completed; preserve them.

Decisions: 1A, 2A, 3A, 4A, 5A, 6A, 7A, 8B, 9A.

## 1. Panel layout — A

Put Context, Files and Graph in a resizable companion column immediately to the LEFT of Chat.

This is a horizontal arrangement:
Canvas → companion viewer → Chat.

It is not an upper/lower split.

Requirements:
- Chat and its composer remain visible while reading a PDF, viewing a file or exploring the graph.
- Reuse one companion column for these viewers; do not open three separate columns.
- Clicking the graph icon in the composer opens Graph there.
- Opening a file or PDF switches that companion viewer appropriately.
- Preserve each viewer’s state when switching: PDF page, file position, graph camera and selection.
- Closing the companion column leaves Chat open.
- Hiding the whole right-side workspace must work regardless of which viewer is active.
- Account for both columns when centering, fitting or inserting canvas content.
- On narrow screens, use a clear switching/back behavior instead of squeezing both columns until unusable.
- Preserve the completed Context and references functionality.

## 2. Repository page — A

Open repository workspaces on Learn, meaning the canvas.

Remove Graph from the top Files | Graph | Learn switcher. Keep Files for this release.

Graph remains available through the composer’s graph icon and companion viewer.

For old links:
- ?tab=graph opens the canvas with Graph visible in the companion column.
- Inspect what ?tab=code historically opened before changing it. If it meant Files/code, preserve that intent by opening Files, not Graph.
- Preserve file paths, node identifiers and other meaningful deep-link parameters where possible.

Do not silently redirect all historical code links to the graph.

## 3. Connecting a repository — A

Do not add Connect repository in this release.

Show the graph entry point based on whether the canvas has an attached repository, not which creation flow produced the canvas.

Handle absent, loading, failed and unavailable repository data explicitly.

## 4. Multiple graph nodes — A, with consistent shortcuts

Add graph multi-selection, but match our established selection conventions:

- Plain click selects one node.
- Shift-click adds or removes a node from the selection.
- Clicking empty graph space clears the selection.
- Escape clears graph selection when the graph has focus, after closing any inner menu.

Do not introduce Ctrl-click as a second arbitrary multiselect rule. Ctrl/Cmd is already associated with selecting inside groups in our canvas conventions.

Selection must support:
- Add to chat;
- Add selection as graph;
- creating code cards for selected nodes that resolve to actual source.

Selecting nodes alone must not start an AI request.

Use one deduplicated context representation for temporary selection and explicitly pinned Add to chat attachments.

## 5. Repository permissions — A, with a clear content distinction

Use consistent server-enforced repository access for repository-backed code and graph cards.

A viewer without repository access must not receive protected:
- code bodies;
- paths;
- node names;
- graph snapshots;
- search snippets;
- thumbnails or cached previews containing that information.

Show “Repository content unavailable” without leaking the hidden metadata.

However:
- Do not apply repository restrictions to ordinary text/code cards or locally uploaded source files merely because they contain code.
- Distinguish repository-backed content from independent canvas content.
- Implement a consistent repository-access decision for member pages; do not accidentally make all legitimate members lose access because /c/ currently lacks that path.
- Enforce access on source/snapshot endpoints as well as board responses.
- A redacted board received by a restricted editor must never overwrite or erase the underlying protected content when saved.

Document how existing repository code cards are identified and handled. Do not silently destroy them or reinterpret all code cards as repository-backed.

The fact that a GitHub repository is public does not replace the canvas’s repository-access setting.

## 6. Dropped code files — A

Accept the listed common source/config formats within the existing size limits.

Reuse the import dialog. Dropping a file must not immediately execute it or silently choose a notebook.

Requirements:
- Offer only destinations supported for that file type.
- Preserve exact code, whitespace and filename.
- Use the existing Shiki installation for display.
- Reject binary or oversized content with a clear explanation.
- Do not install dependencies, run scripts or start kernels on import.
- Store imported files durably so the card survives reload.
- Keep local-file cards distinct from repository-backed cards.
- Do not add a separate editor/highlighting system where an existing component fits.

## 7. Work split — A

Use the proposed two releases:

Release 1:
- companion-column layout;
- graph composer entry point;
- selection and Add to chat;
- file/source navigation and citations;
- Curious versus Chat suggestions;
- repository landing/navigation changes.

Release 2:
- code cards;
- supported dropped code files;
- whole-graph and selected-subgraph cards;
- Add to canvas interactions.

Keep each release independently usable. Release 1 must not expose unfinished Release 2 controls.

## 8. Production — B

Bring each release to preview and report:
- exact commit;
- checks actually passed;
- observed behavior;
- known limitations;
- migration requirements, if any.

Stop at preview for my review before production.

Do not interpret the previous production approval as blanket approval for these releases.

## 9. Real AI checks — A

Approve up to $3 TOTAL across both releases, using the approved dev key on local stacks only.

This is a combined cap, not $3 per agent or per release.

Record actual spend and outstanding reservations in the shared ledger. Coordinate helpers so concurrent calls cannot exceed the cap.

Use a small targeted set to verify:
- Curious suggests technical learning directions grounded in the repository.
- Chat suggests relevant implementation follow-ups grounded in the conversation.
- Both adapt when the user changes subject.
- A repository title or earlier topic does not restrict an explicit new request.
- Selected-node questions use actual source context.

Use AI/ML topics when the repository supports them; do not force AI/ML suggestions onto unrelated repositories.

Report actual answers separately from scripted wiring checks. No repeated broad evaluation campaign.

## Additional implementation clarifications

### Graph-card persistence

Reusing the existing embeddable graph block is appropriate.

A saved reference is sufficient only if the referenced snapshot is:
- durable;
- addressable by repository and exact revision;
- available after reload and on another device;
- protected by the correct permissions;
- retained while saved cards depend on it.

Do not assume an existing cache is durable storage.

Save the card’s scope, selected node IDs and camera independently from the snapshot. If the snapshot is unavailable, show a recoverable unavailable state rather than silently replacing it with a different commit.

Report any migration requirement before applying it.

### Repository context caching

Reuse per-commit caches where suitable.

Keep context bounded and relevant. Do not inject the whole README and repository snapshot into every request.

Cache keys must distinguish repository and revision, and retrieval must enforce current access.

The repository informs the answer; it does not restrict the subjects users may ask about.

### Timing and checks

Your estimates are planning estimates, not delivery guarantees.

Run focused local checks before pushing, reuse valid exact-commit CI evidence through the established mechanism, and avoid duplicate full gates or proof runs.

Report elapsed time separately from runner minutes.


---

# Owner correction to decision 2 (received 2026-10-15 ~8:55 AM PT, verbatim)

Correction to decision 2: remove the ENTIRE Files | Graph | Learn switcher, including Files.

The navigation should be direct:

Home / Library / Explore → Canvas

There must be no intermediate repository page, file browser or graph landing screen.

This applies to:
- opening an existing repository-backed canvas;
- starting a new canvas from a repository;
- opening a canvas from Library or Explore;
- opening a shared or forked canvas.

For a new repository, open the canvas immediately and show indexing/loading progress there. Do not make users wait on a separate repository screen.

Repository tools remain available inside the canvas:
- Files opens in the companion column beside Chat.
- Graph opens in that same companion column through its entry point.
- Selecting a file or graph node supplies context to the existing Chat.
- The repository badge opens GitHub in a new browser tab.

Preserve meaningful old links:
- An old Files/code link opens the canvas with Files visible and the requested file selected where possible.
- An old Graph link opens the canvas with Graph visible and its requested selection restored where possible.
- An ordinary repository/canvas link opens the canvas without forcing either viewer open.

Reuse the existing canvas identity and saved state. Navigation must not create duplicate canvases or reset conversations, BlockNote content, references or camera state.

This replaces the earlier instruction to keep Files in the top switcher. Everything else in the brief remains unchanged.

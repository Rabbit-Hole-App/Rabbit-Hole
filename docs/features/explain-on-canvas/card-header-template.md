# Card header template (owner 2026-11-07)

Every canvas card draws one shared header, `packages/web/src/CardHeader.jsx`, modelled on the Explanation card's pinned head: the card type's **icon**
(`card-icons.js`, one modern lucide icon per family, never the old dot), the card's **title** (the learner's name from Rename, else the card's own title, else a
muted italic **placeholder** such as "Untitled note" that is never stored), and under it one **meta line** (a file card: file name first, then kind, format, size,
encoding; other cards: their type label and the facts they already know). The title is double-click renamable through the same in-place editor the right-click
Rename opens (`CardRename` context, provided by `AdaptiveCanvas.jsx`; absent on a read-only board or a local copy, and in the Slash Commands window).
Titles: `card-rename.js` `headerTitleOf` / `placeholderTitle`. A file, PDF or slide's label is its FILE NAME, so its header title is the learner's name or the
placeholder and the file name goes in the meta line; a quiz question or practice prompt is the card's content (it can hold TeX), so it is never repeated as the title.

Pinned means the header sits outside the card's scroll region, or is `sticky top-0` inside one (the generic lesson cards, via `Kicker` in `LearningBlocks.jsx`,
which is now an adapter over `CardHeader`). Nothing here was seen in a browser; sticky behaviour and spacing are unverified visually.

## Per card type

| Card type | Icon | Title source | Meta line | Pinned | Status |
| --- | --- | --- | --- | --- | --- |
| explanation | Lightbulb | customTitle / title | "Explanation" (+ source link action) | yes (structural, `data-explanation-head`) | done |
| PDF excerpt (explanation + excerpt) | Quote | customTitle / title | "Excerpt" | sticky | done |
| practice (challenge, explainBack) | Dumbbell | customTitle, else placeholder | "Practice" | sticky | done |
| quiz | ListChecks | customTitle, else placeholder | "Quiz" | sticky | done |
| flashcards | GalleryVerticalEnd | customTitle, else placeholder | "Flashcards" | sticky | done |
| table | Table2 | title | "Table" | sticky | done |
| snippet / code | Braces / Code | title | "Code" | sticky | done |
| graph (interactive) | SquareFunction | title | "Interactive graph" | sticky | done |
| knowledge | Network | title | "Graph" | structural (no scroll wrapper) | done |
| flow / mermaid | Workflow / Waypoints | title | "Diagram" | structural | done |
| animation (sequence) | Clapperboard | title | "Explanation" or sequence position | structural | done |
| audio | AudioLines | title | "Narration" | sticky | done |
| whiteboard (board) | PenTool | title | "Whiteboard" | structural | done |
| scene activity (a `scene` block with `spec.type: 'interactive_scene'`, `LearningBlocks.jsx:2341`) | Boxes (the scene icon; not told apart from a Blender scene) | title | "Activity" | structural | done |
| scene (Blender) / model3d | Boxes / Box | title | "Blender scene" / "3D model" | structural | done |
| image / imageGenerate | Image | title | "Image" | sticky | done |
| video (generated) | Film | title | "Video" | sticky | done |
| plot, vector, pipeline, walkthrough, mathAnimation, animation* | Spline / Blocks / Route / Pi / Clapperboard, Focus | title | their generic body's label | per body | icon mapped; each type's own body label **not checked individually** |
| file: text, markdown, table, workbook, document, presentation | FileText, Table2, FileSpreadsheet, Presentation | customTitle, else "Untitled file" | `file name . kind . format . size . encoding` (file name first) | yes (own pinned header) | done (`FileDocCard.jsx`) |
| file: image, media, excerpt | Image / AudioLines / Film | customTitle, else placeholder | `file name . type` + Download | yes | done (`AdaptiveCanvas.jsx` FileCard) |
| file: attachment | Paperclip | customTitle, else placeholder | `file name . File attachment . size` + Download | yes | done |
| file: model | Box | customTitle, else placeholder | `file name . kind` + viewer buttons | yes | done (`ModelCard.jsx`) |
| pdf | FileText | customTitle, else placeholder | `file name . PDF` | yes | done |
| slide | Presentation | customTitle, else placeholder | `file name . page N` | yes (above the page image) | done |
| video (YouTube moment) | Film | title | "Video" + "contents unverified" badge | yes | done (`YouTubeMoment`) |
| wiki | BookOpenText | customTitle (the article it loads is NOT renamed) | `Wikipedia . article` | yes | done |
| webpage | Globe | customTitle, else capture title | host link, Truncated flag; lock, refresh, open buttons | yes | done (`WebpageCard.jsx`) |
| notebook | BookText | customTitle, else placeholder | "Notebook . Python" + its action buttons | yes | done (`NotebookCard.jsx`) |
| repo-code | FileCode | customTitle / file name | language and where the lines come from | yes | done (`CodeCard.jsx`) |
| repo-graph | GitBranch | customTitle, else placeholder | repository, commit, scope | yes | done (`GraphCard.jsx`) |
| cad | Cuboid | title | "CAD model" | structural | done (`CadCard.jsx`) |
| animation3d | Rotate3d | title (block, then model) | "Animation" + experience / example badges | structural | done (`Animation3DCard.jsx` Header) |
| whiteboardVideo | Projector | title | "Whiteboard video" | structural | done (both phases) |
| canvas-ref | Link2 | customTitle | (own destination row) | n/a | **not done**: a fixed 320 x 86 card (`REF_CARD`, used by placement); a header would change its footprint. It keeps `CardCustomTitle`. |
| divider | Minus | customTitle / label | n/a | n/a | **not done**: a rule with a centred label, not a card header |
| heading | Heading | text (editable in place) | n/a | n/a | **not done**: the heading is its own text |
| chat card (exchange) | none | n/a | n/a | n/a | **not done**: not a block; not renamable |

## Slash command -> card type -> icon

Source: `COMMAND_CARDS` in `card-icons.js`, checked by `card-icons.test.mjs` (every command in `agent/slash.js` SLASH and MATERIAL_TOOLS has a row; every
card resolves to a non-default icon; two command families never share an icon unless they share a card type). `referenceAttention` got its own icon (Focus) so it
no longer shares Clapperboard with `animation`.

| Command (typed) | Creates | Icon |
| --- | --- | --- |
| /explain | explanation, table, animation, audio (narration) | Lightbulb, Table2, Clapperboard, AudioLines |
| /practice | explainBack (a `challenge` block), quiz, code | Dumbbell, ListChecks, Code |
| /quiz | quiz | ListChecks |
| /flashcards | flashcards | GalleryVerticalEnd |
| /goal | no card (opens the goal manager in Progress) | none |
| /code | snippet, code | Braces, Code |
| /graph | graph, plot, knowledge | SquareFunction, ChartLine, Network |
| /diagram | flow, mermaid | Workflow, Waypoints |
| /notebook | notebook | BookText |
| /image (id generate-image) | image (generated) | Image |
| /motion | video (mode generate, `generation-proposal-chat.js` ADAPTERS) | Film |
| /cad | cad | Cuboid |
| /animation | animation3d | Rotate3d |
| /whiteboard (id whiteboard-video) | whiteboardVideo | Projector |
| /3d | model3d, scene | Box, Boxes |
| /browser | webpage | Globe |
| /photos (id image) | image (photo search) | Image |
| /youtube | video (YouTube moment) | Film |
| /arxiv | paper (`insertPaper`) | FileText |
| /wikipedia | wiki (`insertWiki`) | BookOpenText |
| Tutor tools: compare | table, graph, plot, flow, mermaid | as above |
| walkthrough | walkthrough | Route |
| animate | referenceAttention, mathAnimation | Focus, Pi |
| whiteboard (board) | whiteboard | PenTool |
| video | videoGenerate (saves as a `video` block) | Film |

**Not traced to an insert call** (named from `BLOCK_TYPES` labels and the primitive's own name, not from the code that inserts the block): `code_exercise` -> code,
`knowledge_graph` -> knowledge, `3d_model` -> model3d, `narration` -> audio. They are not in `learn-slash.js` `CARD_OF`.

## View > Slash Commands examples (`SlashCommandPreview.jsx`)

The window draws each card with the canvas's own card body inside a frame that mimics the canvas shell (rounded border, drag handle strip), so the header flows in
wherever it lives inside the card component.

| Preview family | Drawn by | Header now | Change |
| --- | --- | --- | --- |
| explanation, practice, quiz, flashcards, code, graph, diagram, image, motion video, scene | `LearningBlockBody` (same body as the canvas) | shared header via `Kicker` | none needed in the preview; fixtures given real titles (practice, quiz, flashcards `customTitle`) |
| CAD, 3D animation, whiteboard video | `LearningBlockBody` -> lazy card components | shared header inside each card | none needed |
| notebook | `NotebookBody` | shared header inside the card | fixture given `customTitle` "Cooling of a hot coffee" |
| YouTube | `YouTubeMoment` (shared with the canvas) | shared header inside it | none needed |
| webpage | `WebpageCard` | shared header inside it | none needed |
| Wikipedia | `LearnWiki` under the preview's OWN copy of the old dot strip | shared `CardHeader` (article title, "Wikipedia . article") | changed: the old strip is replaced |
| Learning Goals | `GoalManager` (a panel) | n/a | not a card; unchanged |
| Source finder | `FinderPanel` (a panel) | n/a | not a card; unchanged |
| Generate review | `GenerationProposalCard` (a review card, not a canvas card) | n/a | unchanged |

Differences NOT closed: the preview frame is its own wrapper, not `CanvasNode`: it has no selection ring, resize handles, Prompt control or selected-card
toolbar; the rename double-click is intentionally absent (examples are read-only). Nothing was checked in a browser.

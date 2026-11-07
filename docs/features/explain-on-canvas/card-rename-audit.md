# Card rename audit (owner 2026-11-07: right-click Rename on every card)

Scope: the right-click **Rename** (`canvas-actions.js` id `rename`, `targets: ['card']`, `applies: ctx.canvas.renamable?.(t.object)`; `AdaptiveCanvas.jsx` `renamable: object => !localCopy && renamable(object)`). A "card" is a canvas **block** (a typed object) or a **chat card** (an exchange). Items (text, sticky, equation), shapes and groups are not cards (groups have their own `renameGroup`).

Line numbers are the tree at branch `sprint3/rename` after this change. Anything I did not read is marked **not checked**.

## The API (stable, for the next lane)

All in `packages/web/src/card-rename.js` (pure, no JSX):

| Export | Returns |
| --- | --- |
| `customTitleOf(block)` | the trimmed `block.customTitle` or `''` |
| `renamable(block)` | `true` for any block (has a string `type`); `false` for a chat card (exchange) |
| `titleKey(block)` | the field a rename writes: `'title'` when the card has a string `title` and is not `wiki`/`webpage`; `'text'` for a heading; otherwise `'customTitle'` |
| `startTitleOf(block, derived)` | what the inline editor opens on: custom name, else title / heading text, else the derived name |
| `renameBlock(blocks, id, text)` | new blocks array; trims, caps at 200 characters; unchanged or empty keeps the same array, except an empty name on a custom title clears it (the original returns) |
| **`cardTitleOf(block)`** | **the one name to show**: `customTitle`, else the derived name (string `title`; file/PDF/slide `label`; heading `text`; quiz `question`; practice `prompt`; whitespace collapsed, at most 80 characters), else a neutral type placeholder (`PLACEHOLDERS[type]`, e.g. `Untitled note`, `Untitled notebook`, `Untitled file`) or `PLACEHOLDER` (`Untitled card`). **Computed, never stored.** Computing it writes nothing. |
| `PLACEHOLDERS`, `PLACEHOLDER` | the placeholder text map and the fallback |

Field: **`block.customTitle`** (string, at most 200). It is a display name beside the model's own fields; `title`, `label`, `question`, `url`, file name and article name are never overwritten by it. It persists with the block: the board is saved as one JSON text (`control-plane/src/learn-boards.js` `saveOwn` → `stateText(body?.state)`, no per-field whitelist; client `canvas-persist.js` `lightBlocks` only strips a large `data:` `src`). Test: `card-rename-render.test.mjs`.

Two shared display helpers: `describeBlock(block)` (`LearningBlocks.jsx`) now returns `title: customTitle` when set (chat context names, input pills, search, the contents chip); `CardCustomTitle.jsx` is the shared title line (`data-drag-zone`, `text-sm font-medium`) used by cards that have no title line of their own.

## Per card: before, after, and where the header renders

"Shell" is the wrapper that draws the card frame. "Scroll" says whether the title scrolls with the body or is pinned.

### Generic lesson cards (shell: `LessonBlockCard` generic `CanvasNode`, `AdaptiveCanvas.jsx:943-` ; body `LearningBlockBody` `LearningBlocks.jsx:2332-`)

Title line: `<p data-drag-zone class="cursor-grab text-sm font-medium">{block.title}</p>` under a `<Kicker>` (type label). Renames `title`.

| Type (body, title line) | Meta line shown | Scroll |
| --- | --- | --- |
| audio (`AudioBody` `LearningBlocks.jsx:1410`) | Kicker "Narration" | title **inside** the scroll region (`:1408`, `data-scroll`): scrolls with body |
| scene activity (`SceneActivityBody` `:1437`) | Kicker "Activity" | no scroll wrapper found above it (not checked further) |
| whiteboard (`WhiteboardBody` `:1451`) | Kicker "Whiteboard" | no scroll wrapper found above it |
| animation (`AnimationBody` `:1474`) | Kicker (sequence) | no scroll wrapper found above it |
| flow (`FlowBody` `:1499`) | Kicker "Diagram" | no scroll wrapper found above it |
| mermaid (`MermaidBody` `:1517`) | Kicker "Diagram" | title above an `overflow-auto` diagram box (`:1518`): diagram scrolls, title pinned |
| knowledge (`KnowledgeBody` `:1533`) | Kicker "Graph" | no scroll wrapper found above it |
| scene (`SceneBody` `:1588`) | Kicker "Blender scene" | no scroll wrapper found above it |
| model3d (`ThreeDBody` `:1670`) | Kicker "3D model" | no scroll wrapper found above it |
| image (`ImageBody` `:1772`) | Kicker "Image" | inside `data-scroll` (`:1770`) |
| video, hosted (`VideoBody` `:1935`) | Kicker "Video" | inside `data-scroll` (`:1933`) |
| table (`TableBody` `:2001`) | Kicker "Table" | inside `data-scroll` (`:1999`) |
| **explanation** (`ExplanationBody` `:2044`) | Kicker + source header | **pinned**: the title `<h3>` (`:2043-2044`, `block.anchor` changes size) is outside the `data-scroll` body (`:2046`) |
| PDF excerpt (`ExcerptBody` `:2077`) | Kicker "Excerpt" | inside `data-scroll` (`:2075`) |
| graph (`GraphBody` `:2132`) | Kicker "Interactive graph" | inside `data-scroll` (`:2130`) |
| snippet (`SnippetBody` `:2153`) | Kicker "Code" | inside `data-scroll` (`:2151`) |
| code exercise (`CodeBody` `:2185`) | Kicker "Code" | inside `data-scroll` (`:2179`) |
| whiteboardVideo (`WhiteboardVideoCard.jsx:85, 100`) | title only, `-mx-4 -mt-3` strip | not checked |
| animation3d (`Animation3DCard.jsx:74-87` `Header`) | Header: "Animation", title, experience, prompt | the region under the viewport scrolls only when it has content (`:308`); header pinned |
| cad (`CadCard.jsx:295`) | `{block.title \|\| 'CAD model'}` | not checked |

Before: renamable (string `title`). After: unchanged, still writes `title`.

### Generic lesson cards with NO string `title` (shell and body as above)

Before: not renamable. After: renamable, writes `customTitle`, shown by `CardCustomTitle` placed before the body (`AdaptiveCanvas.jsx:958`, `typeof block.title !== 'string'`).

| Type (body) | What the card shows today | Scroll |
| --- | --- | --- |
| quiz (`QuizBody` `LearningBlocks.jsx:1338`) | Kicker "Quiz" (`author="tutor"`), the question in the body; `describeBlock` title is the question | whole body scrolls (`data-scroll` `:1342`) |
| flashcards (`FlashcardsBody` `:2265`) | cards; `describeBlock` title `N cards` | `data-scroll` `:2275` |
| challenge / practice (`ChallengeBody` `:1270`, `ExplainBackCard` `:962`) | the prompt; `describeBlock` title is the prompt | `data-scroll` `:1172`, `:1342` (not checked which) |

### Cards with their own component and shell (each builds its own `CanvasNode`)

| Type | Title field | Where the header renders | Text / meta line | Scroll | Rename: before → after |
| --- | --- | --- | --- | --- | --- |
| **wiki** (`WikiCard` `AdaptiveCanvas.jsx:842`) | `title` = the article it loads | `:856` header strip: dot + "Wikipedia" (the **title is not shown**) | none (now `Wikipedia` + custom name) | the embedded article scrolls (`data-pointer-body` below the strip) | no → yes, **`customTitle`** (article untouched) |
| **webpage** (`WebpageCard.jsx:265`) | `title` = the capture's | `const title = customTitleOf(block) \|\| block.title \|\| host` | host / URL (not checked beyond `:265`) | frame `data-webcard-frame` scrolls (`:303`) | no → yes, **`customTitle`** |
| **file, document kinds** (`FileDocCard.jsx:145-149`, shell `CanvasNode` in `LessonBlockCard`) | `label` (the file name) | fixed `<header data-drag-zone class="shrink-0">` `:145`; title `data-file-doc-title` `:147` | meta `data-file-doc-meta` `:148`: `KIND · FORMAT · size · meta`, e.g. "Markdown · MD · 21 KiB · utf-8" | **pinned header, body scrolls**: `data-scroll` `:218` (text), `:265` (table) | no → yes, **`customTitle`** shown in the title span; `label` kept (download/upload name) |
| file, model (`ModelCard.jsx:182`) | `label` | header strip `:182` (`block.label`, small grey) | none beyond the name | viewer `overflow-hidden` `:193` | no → yes, `customTitle` |
| file, image / other (`FileCard` `AdaptiveCanvas.jsx:663`, lines `:689`, `:704`) | `label` | `:704` strip: dot + type ("Excerpt" / media / "Image") + `label`; `:689` name line for a non-media file | the file name | not checked | no → yes, `customTitle` |
| pdf (`PdfCard` `:624`) | `label` | `:641` strip: dot + "PDF" + `label` | none | embedded viewer (iframe) | no → yes, `customTitle` |
| slide (`SlideCard` `:589`) | `label` + `number` | **no title shown**, only the page image (`:602`) | alt text `label, page N` | none (image) | no → yes, `customTitle` via a caption line `:601` |
| divider (`DividerCard` `:611`) | `label` | `:616` centred label between rules | the label | none | no → yes, `customTitle` replaces the label |
| notebook (`NotebookCard.jsx:138`, wrapper `NotebookCard` `AdaptiveCanvas.jsx:876`) | none | `data-notebook-header` `:138`: "Notebook", "· Python" + action buttons | language | the notebook iframe `:156` | no → yes, `customTitle` shown beside "· Python" |
| repo-code (`CodeCard.jsx:69-70`) | `title` (file name) | `data-code-card-title` `:69` | `data-code-card-provenance` `:70`: repo › path:lines · commit | `pre data-scroll` `:84` below a fixed header | yes → yes (`title`) |
| repo-graph (`GraphCard.jsx:64`, shell `AdaptiveCanvas.jsx:940`) | none | header line shows `repository.repo` + commit (`:64-65`) | repo and commit | the graph | no → yes, `customTitle` (`CardCustomTitle` `:941`) |
| canvas-ref (`CanvasRefCard.jsx`, shell `:937`) | none (shows the linked canvas's title) | `CanvasRefCard.jsx:22-26` destination row (path, Open) | linked canvas title and path | none | no → yes, `customTitle` (`CardCustomTitle` `:937`) |
| heading (`HeadingCard` `AdaptiveCanvas.jsx:555`) | `text` | the heading text itself (editable in place) | none | none | no → yes: rename writes **`text`**, which is what the contents read |
| video, YouTube moment (`VideoCard` `:727`, line `:766`) | `title` | strip: dot + "Video" + `title` (`:766`) | title | the iframe | yes → yes (`title`) |
| **chat card** (`ChatCard` `:479`, exchange) | none (the question) | not a block | question / answer | not checked | **not renamable**, see below |

## What did NOT change, and why

- **Chat cards (exchanges):** `renamable` is `false` for them. An exchange lives in page state owned by `LearnPage.jsx` (the canvas receives `exchanges` and only `onMove`/`onSize`/`onReply`), which is outside this lane. Making them renamable needs a callback from the page to write an exchange field (and a header line in `ChatCard`).
- **Read-only boards, visitors, local copies:** unchanged (`!localCopy`; the editor is not shown when `readOnly`).
- **Title-bearing cards:** still write their own `title` (so the contents, context and download names behave as before).
- **`describeBlock` for cards it never described (wiki, webpage, file, pdf, slide, notebook, repo-*, canvas-ref):** still `null`; only the visible header changes for those.

## For the shared-header lane (do not restate decisions here)

Today there is no common card header. Three header styles exist: (1) a title `<p data-drag-zone>` under a Kicker, **scrolling with the body** for most generic cards; (2) a pinned `<header shrink-0>` with title and meta (`FileDocCard.jsx:145`, `CodeCard.jsx:69-70`, Explanation `LearningBlocks.jsx:2043`); (3) a small type strip with the name beside the type label (PDF, file, wiki, video, notebook). Cards with no visible title at all: slide, wiki (shows "Wikipedia" only), quiz, flashcards, practice (shown by the body), notebook, repo-graph (repo name), canvas-ref (linked title).
Use `cardTitleOf(block)` for the title text and the placeholder; write names with `renameBlock`; keep `customTitle` as the stored field.

# Learn Tool Performance v1

Rendering speed of the canvas's learning tools (the + palette), measured and
improved as infrastructure the future Tutor will consume. This is not tutor
behaviour: no router, no learner state, no intent-based prefetch, no artifact
reuse policy (those wait for the tutor architecture session).

## What is measured

Every card records four User Timing marks, `rh:<blockId>:<phase>`
(`packages/web/src/learn-perf.js`):

| Mark | Meaning |
|---|---|
| `insert` | the insertion was requested (click in the + menu, `/` command, or tutor) |
| `visible` | the card's shell is on screen: the start of the frame after its first paint |
| `content` | its first meaningful content is drawn: the graph, the page image, the laid-out diagram |
| `interactive` | the learner can use it: type, drag, select text, run code |

Cards that draw everything on their first paint (explanation, quiz, table, and
so on) report all three at once. Heavy cards report `content` and
`interactive` when their library has actually finished:

- graph, when Desmos or Plotly has drawn;
- flow, when ELK has laid out and React Flow has drawn;
- Mermaid, when its SVG is in place;
- paper, when page one is painted (content) and its text layer is selectable
  (interactive);
- whiteboard, when tldraw has mounted;
- 3D, when the model has loaded;
- video, when the first frame is decoded;
- notebook, when JupyterLite reports `loaded`.

**Time to visible** is `visible − insert`. **Time to interactive** is
`interactive − insert`. Cold is a fresh browser with no HTTP cache. Warm is a
second insert on the same page.

`packages/web/e2e/plus-render-timing.mjs` inserts all 28 + items on the
parallel clone, cold and warm. It also records:

- the bytes, requests and main-thread long tasks (time beyond 50 ms) from the
  click until the card is interactive;
- initial Learn load;
- any request to a paid endpoint, which must be none.

The old "card stopped resizing" number (`settled`) is kept only to compare
with the first baseline. `ONLY="Interactive graph,…"` re-measures a subset.

## What changed

- **Idle warm-up** (`learn-warmup.js`). The initial Learn load fetches nothing
  extra. Once the page has been quiet for at least 3 seconds (no typing,
  scrolling or pointer), each browser idle slot warms one tool, in order:
  1. the KaTeX fonts;
  2. the Desmos SDK, fetched and parsed, but no calculator is created;
  3. Plotly;
  4. the ELK layout worker;
  5. the tldraw chunk;
  6. Mermaid;
  7. the notebook site.

  It is skipped on Save-Data and 2G connections. `rh:warmup:done` marks the
  end, typically 9–13 s after navigation.
- **Desmos.** Warming it moves the SDK's parse off the click. The card then
  yields one frame before building its calculator, so the shell paints first.
  There is one calculator per card, created only when a graph card is on the
  canvas; there is no shared offscreen calculator.
- **Notebook.**
  - Stage A: the notebook site's content-hashed `build/` and `extensions/`
    files now carry `Cache-Control: public, max-age=604800`. `patch-site.mjs`
    writes `_headers`, so rebuilds keep it. Before, each of about 90 files
    revalidated.
  - The warm-up opens the site once in a hidden frame (workspace `warmup`,
    never a card's UUID). Its code then lands in the same cache partition the
    cards' frames use. No workspace is initialised, no notebook opens and
    Python does not start.
  - The card's shell (header, Files, "Starting Python…") is visible within
    about 30 ms, as before.
- **Flow.** ELK runs in its Web Worker build (`flow-layout.js`, one shared
  worker), so the 1.4 MB engine never parses on the main thread.
- **KaTeX.** Its code is in the main bundle; the warm-up loads its two fonts,
  which were the 26–43 KB first-use fetch.
- **Mermaid.** Shiki (source highlighting) already loaded only when "Show
  source" opens. The first-use cost was Mermaid's own per-diagram chunks,
  which the warm-up now fetches.

## Before and after

Parallel clone, 2026-09-29, Playwright Chromium at 1600×1100. Before is the
instrumented build without warm-up. After is the optimized build, with the
insert made after the idle warm-up finished, as a learner who has been
reading would make it. The Interactive graph row is from its re-measure after
the paint-first fix.

| + item | Visible (before → after) | Interactive, cold | Interactive, warm | Main-thread blocked, cold | Downloaded at click, cold |
|---|---|---|---|---|---|
| Challenge | 39 → 27 ms | 39 → **28** ms | 28 → 26 ms | 0 → 0 ms | 0 KB/0 → 0 KB/0 |
| Explain back | 34 → 27 ms | 34 → **27** ms | 29 → 30 ms | 0 → 0 ms | 0 KB/0 → 0 KB/0 |
| Quiz | 38 → 71 ms | 38 → **71** ms | 36 → 26 ms | 0 → 23 ms | 43 KB/2 → 0 KB/0 |
| Flashcards | 64 → 56 ms | 64 → **56** ms | 24 → 31 ms | 11 → 8 ms | 26 KB/1 → 0 KB/0 |
| Explanation | 59 → 66 ms | 59 → **66** ms | 25 → 26 ms | 9 → 15 ms | 26 KB/1 → 0 KB/0 |
| Table | 89 → 79 ms | 89 → **79** ms | 35 → 44 ms | 40 → 30 ms | 26 KB/1 → 0 KB/0 |
| Code sample | 37 → 32 ms | 37 → **32** ms | 25 → 27 ms | 0 → 0 ms | 0 KB/0 → 0 KB/0 |
| Code exercise | 45 → 41 ms | 45 → **41** ms | 23 → 25 ms | 0 → 0 ms | 0 KB/0 → 0 KB/1 |
| Notebook | 33 → 30 ms | 5691 → **1196** ms | 3216 → 1284 ms | 513 → 387 ms | 1470 KB/87 → 0 KB/89 |
| Interactive graph | 57 → 22 ms | 2652 → **232** ms | 166 → 145 ms | 449 → 93 ms | 1071 KB/5 → 0 KB/1 |
| Data plot | 32 → 50 ms | 1719 → **50** ms | 74 → 45 ms | 405 → 0 ms | 370 KB/1 → 0 KB/0 |
| Flow diagram | 39 → 23 ms | 1497 → **192** ms | 115 → 59 ms | 204 → 0 ms | 418 KB/1 → 0 KB/0 |
| Walkthrough | 27 → 57 ms | 27 → **57** ms | 28 → 21 ms | 0 → 7 ms | 0 KB/0 → 0 KB/0 |
| Animation | 43 → 29 ms | 43 → **29** ms | 26 → 29 ms | 0 → 0 ms | 0 KB/0 → 0 KB/0 |
| Paper | 23 → 28 ms | 1678 → **3073** ms | 362 → 458 ms | 0 → 0 ms | 2293 KB/3 → 2293 KB/3 |
| Image | 31 → 28 ms | 31 → **28** ms | 14 → 28 ms | 0 → 0 ms | 0 KB/0 → 0 KB/0 |
| Video | 27 → 28 ms | 346 → **286** ms | 18 → 16 ms | 0 → 0 ms | 31 KB/1 → 31 KB/1 |
| YouTube moment | 49 → 76 ms | 49 → **76** ms | 38 → 74 ms | 0 → 0 ms | 0 KB/0 → 0 KB/0 |
| Mermaid diagram | 28 → 22 ms | 1078 → **357** ms | 41 → 37 ms | 0 → 0 ms | 204 KB/21 → 34 KB/3 |
| Knowledge graph | 27 → 29 ms | 27 → **29** ms | 26 → 27 ms | 0 → 0 ms | 0 KB/0 → 0 KB/0 |
| Vector explorer | 45 → 29 ms | 45 → **29** ms | 33 → 29 ms | 0 → 0 ms | 0 KB/0 → 0 KB/0 |
| Whiteboard | 25 → 29 ms | 831 → **419** ms | 149 → 46 ms | 137 → 21 ms | 1397 KB/41 → 1369 KB/56 |
| 3D model | 36 → 24 ms | 675 → **404** ms | 120 → 88 ms | 0 → 0 ms | 325 KB/3 → 325 KB/3 |
| Image generate (paid) | 32 → 27 ms | 32 → **27** ms | 23 → 26 ms | 0 → 0 ms | 0 KB/0 → 0 KB/0 |
| Video generate (paid) | 24 → 25 ms | 24 → **25** ms | 27 → 25 ms | 0 → 0 ms | 0 KB/0 → 0 KB/0 |
| Maths animation (paid) | 30 → 26 ms | 30 → **26** ms | 23 → 24 ms | 0 → 0 ms | 0 KB/0 → 0 KB/1 |
| Blender scene (paid) | 27 → 26 ms | 27 → **26** ms | 30 → 25 ms | 0 → 0 ms | 0 KB/0 → 0 KB/0 |
| Narration | 27 → 28 ms | 27 → **28** ms | 29 → 28 ms | 0 → 0 ms | 0 KB/0 → 0 KB/0 |


Initial Learn load (navigation to the canvas menubar, fresh browser, medians):

| Run | Time | Bytes | Requests |
|---|---|---|---|
| Before, benchmark | 3,563 ms | 1,005 KB | 32 |
| After, dedicated `e2e/learn-load-timing.mjs` (5 runs) | 1,998 ms | 959 KB | 33 |
| After, benchmark | 2,207–2,585 ms | 1,199–1,208 KB | 35–39 |

The bytes vary run to run (816–1,208 KB across the dedicated runs). The
warm-up starts at least 3 s after Learn mounts, after the menubar, so it is
not in this window. There is no material regression in load time.

Checks:

- No paid endpoint was requested in any run (image, video, scene, TTS,
  artifact).
- Notebook isolation and persistence (`e2e/canvas-notebook-workspace.mjs`):
  10 of 10 with the warm-up frame present.

## Not done yet, and why

- **Paper** (cold interactive 1.7 s before, 3.1 s after, with identical 2.3 MB
  downloads; the difference is arXiv fetch variance, since nothing on this
  path changed). Page-one-first needs HTTP range requests. The paper route
  fetches the whole arXiv PDF server-side on every request, so ranges would
  repeat that fetch. The route first needs a cached copy in Learn media
  (LEARN_MEDIA) that it can serve ranges from.
- **tldraw assets.** The whiteboard's ~50 requests are fonts, icons and
  translations from `cdn.tldraw.com`. Self-hosting them needs the
  `@tldraw/assets` package, a new web dependency, so it waits for approval.
  The tldraw JS chunk is warmed.
- **Notebook, stage B.** Python starts when a notebook opens: about 1.2 s
  cold and 1.3 s warm after the shell. A shared warm kernel would mean
  running Python on pages that never use it, so it waits until a caller can
  say a notebook is likely (tutor intent, out of scope here).
- **3D model.** The glTF file is fetched when the card mounts; it is not
  prewarmed, because models are learner- or tutor-specific.

## Registry metadata

`PRIMITIVES[id].perf` (`packages/control-plane/src/learn-primitives.js`)
records these observed facts:

- `latencyClass`: instant, fast, medium, slow or async;
- `typicalColdMs`: first use with nothing warm;
- `typicalWarmMs`;
- `canPrewarm`;
- `progressiveReady`: the shell shows before the content;
- `asyncGeneration`.

They are infrastructure characteristics. There are deliberately no tutor
preference fields.

# Canvas notebook

A learner places a real Jupyter notebook on the Learn canvas, resizes it, works
in it, and keeps it as part of that board. It reuses the existing JupyterLite
build (`packages/web/notebook`); there is no second execution model and no
custom cell format.

## Behaviour

- **Insert → Notebook** adds an empty Python notebook card where the learner is
  looking. Later: Insert → Notebook → New / Import .ipynb.
- The card is Rabbit Hole's frame: a drag strip, a header reading
  `Notebook · Python` with **Run all**, **Restart** and a `⋯` menu (Download
  .ipynb), then the Jupyter notebook itself. The corner handle resizes the card
  through the shared card frame; the notebook scrolls inside it.
- Inside the notebook it is JupyterLite's Notebook app: Python and Markdown
  cells, one kernel shared by every cell, outputs, run cell, run all,
  add/delete/move cells, restart, and Jupyter's keyboard shortcuts. The app
  header and menu bar are hidden; the notebook toolbar stays.

## Storage contract

The board owns the document. The block is:

```js
{ id, type: 'notebook', notebook_id, language: 'python', ipynb, dx, dy, w, h }
```

`ipynb` is a standard nbformat 4 document (what `model.toJSON()` produces and
what a `.ipynb` file contains), so import and export are a straight copy. It is
saved with the rest of the board (per-browser localStorage today, like every
canvas card; cross-device save comes with the lesson content model). Outputs
are saved; one output larger than 100 KB is replaced by a short text note so a
plot cannot fill the browser's storage quota. Reopening a board restores cells
and outputs with a fresh kernel, as reopening any notebook does.

## Bridge

The notebook runs on the isolated notebook origin, so its code cannot read the
app's cookie or APIs. The only link is `postMessage` with protocol
`rh-notebook/1`:

| From | Type | Payload |
|---|---|---|
| canvas | `init` | `ipynb` - sent once, on iframe load |
| notebook | `loaded` | - |
| notebook | `change` | `ipynb` - debounced 400 ms after any edit, run or output |
| canvas | `run-all`, `restart` | - |

The notebook page answers only its parent and, after `init`, only that
parent's origin. The canvas accepts messages only from its own iframe's window
on the notebook origin, and stores `ipynb` as data; it never renders notebook
HTML itself. `canvas-bridge.js` is injected into the Notebook app only; the
Lesson view's Lab app is unchanged. New message types (active cell, selected
code, latest error) extend the table without changing the stored document.

## Tutor context

`describeBlock` reports the notebook's existence, `notebook_id`, language and
cell counts, like any other card the learner asks about. Cell-level context
(active cell, latest error) is a later message on the same bridge.

## Canvas interaction

The iframe owns the pointer, wheel and keyboard while the pointer or focus is
inside it, so canvas shortcuts never see a key typed in a cell. Clicking into
the notebook selects the card. The drag strip and header move the card; the
corner resizes it. While any canvas drag is in progress, iframes ignore the
pointer so a drag crossing a notebook is not swallowed by it.

## Limits

- Python runs in the browser (Pyodide). A pathological cell (`while True:`)
  blocks that notebook's kernel until **Restart**; interruptible execution in a
  background worker is future work.
- Each notebook card loads its own JupyterLite instance and kernel.
- Package installs use JupyterLite's defaults (CDN).

## Deploy

The notebook site is built as in `packages/web/notebook/README.md`, then
`node packages/web/notebook/patch-site.mjs .small/notebook-site` adds the
bridge. The web build reads the notebook origin from `VITE_NOTEBOOK_ORIGIN`
(default: the shared `small-learn-notebook-dev`). A parallel session deploys
its own notebook worker with `wrangler.notebook-parallel.jsonc` and builds the
web app with that origin.

## Verification

`packages/web/e2e/canvas-notebook.mjs` on the deployed clone: Insert →
Notebook, two code cells (`x = 10`, `x * 2` → `20`), a rendered Markdown cell,
resize, canvas pan, reload with cells and outputs restored, and existing card
drag still working.

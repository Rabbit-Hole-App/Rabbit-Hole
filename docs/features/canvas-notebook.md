# Canvas notebook

A learner places a real Jupyter notebook on the Learn canvas, resizes it, works
in it, and keeps it as part of that board. Each notebook card is a small
Jupyter workspace: its own files and folders, several notebooks, text and code
files, and one Python kernel per open notebook that can import and read them.
It is JupyterLite (the same runtime as the Lesson view's notebook); there is no
second execution model and no custom cell format.

## Behaviour

- **Insert → Notebook** adds a card holding `notebook.ipynb`, where the learner
  is looking. Later: Insert → Notebook → New / Import .ipynb.
- Rabbit Hole owns the frame: a drag strip, then the header
  `Notebook · Python   Files  Run all  Restart  ⋯` (`⋯` downloads the open
  notebook as `.ipynb`), then Jupyter. The corner handle resizes the card; the
  notebook scrolls inside it. With Files closed the card shows only the open
  document.
- **Files** toggles a drawer of about 210 px: Jupyter's own file browser for
  this card's workspace. Its toolbar makes a new notebook, a new file
  (`untitled.py`), a new folder, uploads and refreshes; right-click renames,
  deletes, downloads (a notebook downloads as `.ipynb`), duplicates, copies.
  One click opens a file or folder.
- A clicked `.ipynb` opens as a notebook in the same card; `.py`, `.md`,
  `.txt`, `.json`, `.yaml`/`.yml`, `.toml`, `.csv` open in Jupyter's text
  editor. Other files are listed without an editor. **Run all** and
  **Restart** act on the open notebook and are disabled while a text file is
  open.
- Notebooks run in the workspace: `from helper import triple` imports
  `helper.py`, `open("config.json")` reads `config.json`, relative to the
  notebook's folder.
- Hidden: title bar, menus, launcher, side tab strips, right sidebar, running
  kernels, extension manager, status bar.

## Storage contract

Files live in the notebook origin's browser storage, in one JupyterLite
database per card, named from `notebook_id` (`rh-notebook-<notebook_id>`).
Edits are saved into it 400 ms after they happen. The card keeps the manifest
and a copy of the open notebook, not the workspace:

```js
{ id, type: 'notebook', notebook_id, language: 'python',
  active_path,       // the file open in the card, restored on reload
  files,             // paths, folders end in '/', e.g. ['data/', 'data/notes.txt', 'helper.py']
  ipynb_path, ipynb, // plain nbformat 4 copy of the last open notebook
  seed_files,        // optional { path: text }, written into a new workspace
  dx, dy, w, h }
```

- The copy of the notebook is what `⋯` downloads and the tutor counts, and it
  re-seeds the workspace if the notebook origin's storage is empty (a card
  made before workspaces, a copied card, cleared browser data). Outputs over
  100 KB are replaced by a short note in the copy.
- A copied or duplicated card gets a new `notebook_id`: a new workspace seeded
  from the copy of its notebook, never a second view of the first one.
- Deleting a card leaves its database in place (undo brings the files back);
  no other card can open it.
- Board and workspace are both per-browser today, like every canvas card.

## Repository projects

Only the notebook workspace is mounted. No repository files are exposed, so
running a notebook cannot change the connected repository. Mounting a
project's repository read-only is a later, separate decision.

## Bridge

The workspace runs on the isolated canvas notebook origin, so its code cannot
read the app's cookie or APIs. The iframe URL is
`/lab/index.html?mode=single-document&workspace=<notebook_id>`. The only link is
`postMessage` with protocol `rh-notebook/1`:

| From | Type | Payload |
|---|---|---|
| canvas | `init` | `active_path`, `ipynb_path`, `ipynb`, `seed_files` - once, on iframe load |
| notebook | `loaded` | - |
| notebook | `state` | `active_path`, `active_kind` (`notebook`/`file`), `files` - on open, switch, rename, create, delete |
| notebook | `change` | `path`, `ipynb` - 400 ms after an edit, run or output in an open notebook |
| canvas | `files` | `open` |
| canvas | `run-all`, `restart` | - |

The page answers only its parent and, after `init`, only that parent's origin;
paths from the parent must be relative and stay inside the workspace. The
canvas accepts messages only from its own iframe on the notebook origin and
stores what it receives as data; it never renders notebook HTML itself.

## Tutor context

`describeBlock` reports `notebook_id`, language, the open file (with cell counts
when it is the notebook the card holds a copy of) and the file names. File
contents are never sent automatically; the selected file, selected code,
active cell and latest error are later messages on the same bridge.

## Canvas interaction

The iframe owns the pointer, wheel and keyboard while the pointer or focus is
inside it, so canvas shortcuts never see a key typed in a cell. Clicking into
the notebook selects the card; Jupyter's start-up focus is handed back to the
canvas. The drag strip and header move the card; the corner resizes it. While
any canvas drag is in progress, iframes ignore the pointer.

## Limits

- Python runs in the browser (Pyodide). A pathological cell (`while True:`)
  blocks that notebook's kernel until **Restart**; interruptible execution in a
  background worker is future work.
- Each notebook card loads its own JupyterLite instance.
- Browsers that block storage for embedded third-party frames (Safari, Firefox
  strict mode) keep a workspace only for the session; the card's copy of the
  notebook still restores it. Chrome keeps it.
- The file tree reported to the card stops at 300 entries.
- Package installs use JupyterLite's defaults (CDN).

## Deploy

The canvas notebook site is `packages/web/notebook-canvas` (see its README): a
JupyterLite build with no bundled files, plus `canvas-bridge.js`. The Lesson
view's notebook site (`packages/web/notebook`) is separate and unchanged. The
web build reads the canvas notebook origin from `VITE_NOTEBOOK_ORIGIN`
(default: the shared `small-learn-canvas-notebook-dev`, not deployed yet). A
parallel session deploys its own with `wrangler.canvas-notebook-parallel.jsonc`
and builds the web app with that origin.

## Verification

On the deployed clone:

- `packages/web/e2e/canvas-notebook.mjs`: Insert → Notebook, `x = 10` then
  `x * 2` → `20`, a rendered Markdown cell, resize, canvas pan, reload, and
  card drag.
- `packages/web/e2e/canvas-notebook-workspace.mjs`: Files, then
  `experiment.ipynb`, `helper.py` and `config.json` made in the drawer; the
  notebook imports one and reads the other; a folder with a file; switching
  files; collapsing Files; reload restores tree, contents, open notebook,
  cells and outputs; a second card sees only its own workspace.

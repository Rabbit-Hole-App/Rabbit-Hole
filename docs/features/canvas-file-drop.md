# Canvas file drop: .ipynb and .py

Owner request, 2026-10-08. A Jupyter notebook (`.ipynb`) or a Python file (`.py`) dropped on the canvas, or picked with
**Insert > Upload a file**, opens one small dialog first, wherever it lands.

```
Add to canvas
analysis.ipynb
How should it be added?
[ Notebook ] [ File attachment ]          (.py: [ Code card ] [ Notebook ] [ File attachment ])
                              [ Cancel ] [ Add to canvas ]
```

- The first choice is preselected. Cancel or Escape adds nothing. Several files are asked about one at a time.
- **Add to canvas** places the card at the drop point: the column slot at that height (`AdaptiveCanvas` `insertImported`,
  `flowIndexAt`). An upload has no drop point, so its card goes where the learner is looking.
- Images, GIFs, videos and PDFs keep their own drop path (`learn-drop.js`), with no dialog: they have one way in.
- `.txt` and `.md`/`.markdown` open this dialog with **Text card** / **Markdown card** first; CSV, TSV, Excel, Word and
  PowerPoint files have their own importer (`DocImport.jsx`). Both are described in `canvas-file-imports.md` section 10,
  which holds the full format list and limits (the capability registry, `file-capabilities.js`).

## What each choice makes

| Choice | Card | Content |
|---|---|---|
| Notebook, from `.ipynb` | the existing notebook card (`canvas-notebook.md`) | every cell and its Markdown, opened as `<name>.ipynb` |
| Notebook, from `.py` | the notebook card | `<name>.ipynb` with the code in one cell, and `<name>.py` beside it in the workspace |
| Code card, from `.py` | the existing code sample card (`snippet`) | the code, titled with the file name; no Run button |
| File attachment | a file card | the file name, its size and Download; it is never opened or run |

`learn-file-import.js` makes the card; `FileImportDialog.jsx` is the dialog; `LearnPage` `takeDrop` routes the files.

**Pasted code** (owner, 2026-10-08; repository-browser.md "Files in Learn") opens the same dialog, with **Code card** and **Jupyter notebook** only (`IMPORT_CHOICES.paste`, `pasteBlock`).
- The name is a repository file's own name when the text was copied from it, else `snippet.py`.
- The card goes where the learner is looking.

## Code files (repository graph Release 2, lane DROP)

Owner decision 6A, 2026-10-15; contract `C:/s/spec/repo-graph-r2-plan.md`.

- Any other common source or config file (`.js`, `.ts`, `.go`, `.rs`, `.yml`, `.json`, `Dockerfile` and similar) opens the
  same dialog with **Code card** or **File attachment**. It is never a notebook. `codeLanguage` names the language.
- A dropped file's **Code card**, `.py` included, is a `repo-code` card with an upload source
  (`{ kind: 'upload', assetKey, name, size }`, `learn-file-import.js` `codeBlock`). Its text stays in its asset: the
  file's own bytes, cached and saved with the board (`assetKeysOf`). So code, whitespace and name are kept exactly, and
  the board holds no copy. It is placed through `insertCodeCard`.
- Pasted code keeps its `snippet` Code card.
- Binary content (a NUL byte) is refused in the dialog, naming the file and suggesting File attachment.
- The 25 MiB import limit applies (`file-capabilities.js` `BOARD_FILE_LIMIT`; limits for every format are in `canvas-file-imports.md`).
- **Several files in one drop** are one dialog. It lists each file with its own choice and says what it will create
  (`Adds 2 code cards and 1 notebook.`, `importSummary`). Nothing is placed until every file reads. Cancel or Escape adds
  none of them.
- **A drag that began on this page** is never a file drop, even when the browser adds a Files entry to it. Examples are a
  card's image or a Files row (`canvas-doc.js` `isFileDrag`, `notePageDrag`). Only a file from outside the page drops.
- Until lane CODE lands, `codeLanguage` and `insertCodeCard` are stand-ins in `code-card-stubs.js`.
  - `insertCodeCard` places the card through `insertImported`.
  - A `repo-code` card has no renderer before CODE's `CodeCard.jsx`.

## Saved outputs

A notebook card renders its saved outputs in the notebook runtime. On import, an output keeps only `text/plain`,
`text/markdown`, `image/png` and `image/jpeg`; streams and errors stay. Anything else - HTML, JavaScript, widgets - is
replaced by a line naming it, `[Output not shown: text/html]`, so no script from a saved output reaches the page and
nothing goes silently. One output over 100 KB is replaced by a note as every notebook card's is (`trimOutputs`).

## Saved with the canvas

- The card lives in the board, saved to the server like every card (`canvas-persistence.md`).
- The file's original bytes are kept too: cached in this browser and listed as a board file (`source_asset`, or a
  File attachment's `assetKey`; `learn-board-assets.js` `assetKeysOf`), which the board uploads with its other files. So
  the file name and the file itself survive reopening and another device, whatever the card shows.

## Limits and errors

Each error names the file, says the limit and stays visible. The dialog stays open on an import error, so another
choice can be made.

- Empty file: refused.
- Any import over 25 MiB, the board's per-file cap: refused, in a toast.
- A notebook or code card over 1.90 MB of content, the board's own cap: refused in the dialog, suggesting File attachment.
- Invalid notebook JSON, or not nbformat 4: refused in the dialog, suggesting File attachment.

## Never automatic

Importing reads the file, keeps its bytes in this browser and places the card. Nothing is uploaded to the media route or
sent to a model, and no code runs. A notebook card opens its notebook in the existing runtime, and its cells run only from
its own **Run all**. `seed_files` are written as files, never executed. A code card shows code with no Run.

`ponytail:` the notebook runtime (JupyterLite, `notebook-canvas/canvas-bridge.js`) starts its Python kernel when a
notebook card opens, as every notebook card does today. The kernel start runs no notebook cell and installs nothing the
notebook asks for. Gating the kernel start itself behind Run needs a bridge change and a notebook-site redeploy, so it is
left for that decision. The Modal integration stays deferred.

## Tests

- Web unit: `learn-file-import.test.mjs` covers:
  - type detection and the choices;
  - empty and oversized files;
  - parsing: cells, Markdown, outputs, invalid JSON, other formats;
  - `.py` as a notebook, each choice's card, and the board files;
  - the 1.90 MB card limit;
  - no network on import, and the dialog wiring.
- Also `learn-drop.test.mjs`, for the unsupported-file message.
- Browser: `packages/web/e2e/canvas-file-drop-check.mjs`, against a stubbed worker on the local Vite server. It covers:
  - the dialog and its choices, Cancel and Escape;
  - the notebook, code and attachment cards;
  - a drop at the top landing above an existing card;
  - an invalid notebook's error;
  - Upload a file;
  - no ask, no media upload, and no notebook told to run.

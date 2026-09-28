# Learn notebook preview

JupyterLite runs Python in the browser inside Learn's dedicated Notebook view.
This directory contains only public, authored sample exercises. It must never
contain deployed app source, secrets, or customer data.

The static runtime has a separate dev origin so arbitrary notebook code cannot
read Small's login cookie or same-origin APIs. It is embedded in the existing
Learn interface; it is not a separate product/demo page. No Jupyter server,
backend execution, or generated course content is deployed.

## Build and deploy (from repository root, PowerShell)

```powershell
python -m venv .small/notebook-venv
.small/notebook-venv/Scripts/python.exe -m pip install -r packages/web/notebook/requirements.txt
$env:JUPYTER_CONFIG_DIR = Join-Path (Get-Location) '.small/jupyter-config'
$notebookRoot = (Resolve-Path packages/web/notebook).Path
$notebookContent = (Resolve-Path packages/web/notebook/content).Path
$notebookOutput = Join-Path (Get-Location) '.small/notebook-site'
.small/notebook-venv/Scripts/jupyter-lite.exe build --lite-dir $notebookRoot --contents $notebookContent --output-dir $notebookOutput
if ($LASTEXITCODE -ne 0) { throw 'Notebook build failed' }
node packages/web/notebook/patch-site.mjs $notebookOutput
Push-Location packages/web
try { npx wrangler deploy --config wrangler.notebook-dev.jsonc }
finally { Pop-Location }
```

`jupyter-server` is a build dependency for indexing `.ipynb` files; it is not run.
The Python WebAssembly kernel and compatible packages use JupyterLite's default
CDN downloads. This sample runtime is not an offline distribution.

The memory storage driver intentionally keeps edits for the mounted iframe's
lifetime. Switching Lesson/Notebook/Practice only hides it. Confirmed Reset
remounts it, restoring bundled cells and a fresh kernel. Leaving Learn or
reloading discards edits; File > Download saves an `.ipynb` copy. No cross-device
or account persistence is claimed. Per-cell reset is not in this preview.

Verification uses `playwright.learn-preview.config.js`: actual Python output,
view-switch retention, reset/cancel, quiz feedback, source position/highlighting,
and flashcard flip/self-assessment. Run after building `dist-dev` using the
[regular dev steps](../../../docs/features/coaching.md#deploy-dev).

## Canvas notebooks

`content/canvas.ipynb`, `notebooks/jupyter-lite.json` (exposes the app to
the page) and `canvas-bridge.js` (added by `patch-site.mjs`) serve the Learn
canvas's notebook cards; see [canvas notebook](../../../docs/features/canvas-notebook.md).
A parallel session deploys this site to its own worker with
`npx wrangler deploy --config wrangler.notebook-parallel.jsonc` and builds the
web app with `VITE_NOTEBOOK_ORIGIN` set to that worker's URL.

# Canvas notebook site

The JupyterLite site that Learn canvas notebook cards open, one workspace per
card ([canvas notebook](../../../docs/features/canvas-notebook.md)). It has no
bundled files: every card starts from what the card seeds. The Lesson view's
notebook ([../notebook](../notebook/README.md)) is a separate site.

- `jupyter-lite.json` exposes the app to the bridge and keeps settings in memory;
  file contents use JupyterLite's browser storage, one database per card.
- `overrides.json` trims the file browser (New notebook, New file, New folder,
  Upload, Refresh) and hides the status bar.
- `canvas-bridge.js` is added to the lab app by `patch-site.mjs`.

## Build and deploy (from repository root, PowerShell)

Uses the venv from the notebook README (`packages/web/notebook/requirements.txt`).

```powershell
$env:JUPYTER_CONFIG_DIR = Join-Path (Get-Location) '.small/jupyter-config'
.small/notebook-venv/Scripts/jupyter-lite.exe build --lite-dir packages/web/notebook-canvas --output-dir .small/canvas-notebook-site
if ($LASTEXITCODE -ne 0) { throw 'Canvas notebook build failed' }
node packages/web/notebook-canvas/patch-site.mjs .small/canvas-notebook-site
Push-Location packages/web
try { npx wrangler deploy --config wrangler.canvas-notebook-parallel.jsonc --name small-learn-canvas-notebook-dev }
finally { Pop-Location }
```

Two sites, one build:

- Shared dev site: `small-learn-canvas-notebook-dev`
  (https://small-learn-canvas-notebook-dev.zeroshothq.workers.dev). The web
  build uses it by default. Deploy it only with the `--name` override above.
- Session review site: `small-learn-canvas-notebook-dev-small-parallel`, the
  config's own name. Drop `--name` to deploy there, then build the web app with
  `VITE_NOTEBOOK_ORIGIN` set to that worker's URL.

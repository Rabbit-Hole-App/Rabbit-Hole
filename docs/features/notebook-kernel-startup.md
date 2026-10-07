# Notebook kernel startup fails silently when a download fails

**Status:** open product issue, found while gating #73 (2026-10-07). It is **not fixed**: this record, the probe and the
cross-device-check synchronisation are test-side only. Production serves the same notebook site build (JupyterLite 0.8.3,
pyodide-kernel 0.8.6, Pyodide v314.0.6), so a learner whose network drops while a kernel starts gets the same result. The
fix belongs to the notebook site (`packages/web/notebook`, canvas-notebook.md) and needs its own change and deploy.

## What happens

The notebook card's kernel runs in a Web Worker inside the notebook site's iframe. While it starts, it downloads Pyodide
(`pyodide.asm.wasm`, `python_stdlib.zip`) and then `micropip-0.11.1-py3-none-any.whl` from cdn.jsdelivr.net. When that
wheel download fails:

1. The worker logs `Loading micropip`, then `Failed to load micropip` and `The following error occurred while loading
   micropip: Failed to fetch`. Pyodide's `loadPackage` does not throw.
2. The kernel's package-manager setup runs `import micropip`, which fails:
   `File "<exec>", line 2 … ModuleNotFoundError: No module named 'micropip'`. The kernel never becomes ready, and every
   later message to it re-raises the same error as an unhandled page error (4 at once at startup).

## Reproduction

- **In the gate (capture, 2026-10-07):** cross-device-check check 4 took device A offline after the app's warm-up, while A's
  notebook kernel was still starting.
  - The micropip wheel request failed with `net::ERR_FAILED`, 118 ms after the warm-up frame detached.
  - The 4 page errors followed. The checks themselves still passed 13/13, and the page-error rule failed the run.
  - It was intermittent because in most runs A's kernel was torn down by navigation before the offline step.
- **Deterministic:** `e2e/notebook-kernel-startup-probe.mjs` with `MODE=fail` blocks only the micropip wheel during the
  first start; `MODE=control` blocks nothing. Local stack only.

## What a learner sees (MODE=fail, 2026-10-07)

| | Failed start | Control |
|---|---|---|
| Kernel status | `unknown` for 25 s+, never ready | `idle` after about 25 s |
| Visible message | none: a small red ⊗ kernel icon in the notebook toolbar, no text, no dialog | – |
| `print(1+1)` | stays `[*]`, no output (60 s) | `2` in about 0.5 s |
| `%pip install six` | stays `[*]` (120 s) | runs (`[2]`) |
| `import micropip` | stays `[*]` | micropip 0.11.1, Python 3.14.2 |

**Recovery:** with the network back, a reload starts a new kernel. It is `idle` in about 25 s, `print(1+1)` gives `2`, and the
notebook's cells are kept: they are in the card and the notebook origin's storage, not the kernel. Untested: whether the
toolbar's Restart recovers without a reload.

## Acceptance for the product fix

1. A failed kernel start is **visible**: a message in the notebook card that names the problem, not only an icon.
2. Once connectivity returns, the learner can **recover** from the card (retry or restart) without losing work.
3. The notebook's **cells are preserved** through the failure and the recovery.
4. After recovery, **code runs** (`print(1+1)` → `2`) and **a package installs and imports** (`%pip install six`, then
   `import six`).

The probe reports each of these in its `summary` line. Today MODE=fail reports none of 1 and 2.

## Test-side changes made in #73 (not the fix)

- cross-device-check check 4 waits until every notebook frame on A has an `idle` kernel, or was torn down, before going
  offline. It logs the kernel states and the offline and online moments. The offline-save assertions and the page-error rule
  are unchanged.
- The probe stays as regression material. It is not part of the gate, because it fetches the deployed dev notebook site and
  PyPI.

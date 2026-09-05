# v11 — the web run surface (2026-09-05)

The dashboard can now run jobs the way the CLI does — from the `[inputs]`
schema, with real controls, and watch them live. Three pieces, all on the app
page: the **Run** tab, the run **side peek**, and the **runs database** in Logs.

## Run tab

Generated entirely from the schema `small deploy` now stores on the app row
(a two-field addition to the deploy body; the worker returns it from
`GET /api/apps/<name>`): one row per input, label at 200px, control at 320px,
help underneath. Types map exactly — `file` → dropzone with `accept`,
`number` with min/max → slider plus a 64px field, `select` → dropdown
(checkbox group when `multiple`), `date` → date input with relative text,
`bool` → toggle, `text` → pattern-validated on blur. Defaults prefill,
validation mirrors `cli/lib/inputs.js` client-side, files post as multipart
(`body` + `input:<name>` parts). One primary Run button; the last-run line
sits under it.

## Side peek

`/apps/<slug>/runs/<id>` is a real route, and the same view opens as a 480px
panel over any page of the app. Status pill, person, started, duration;
Inputs as a property list with sizes and downloads; Output shows declared
outputs by label — images under 2 MB as 200px thumbnails, `.json/.csv/.txt`
under 4 KB inline in a code block, the rest as download rows; Log keeps the
last 20 lines with "Show all N", polls every second while running, and
survives transient fetch blips. Run again prefills the form (files re-picked).

## Runs database

One row per run, one column per declared input so you can scan what was
tried — files as 📎 name, bools as pills, numbers right-aligned. Toolbar:
Filter (status / person / any input value), Sort, Properties (hide input
columns, persisted), Search, New run. Columns resize by edge-drag and the
widths persist per app; the table is exact-pixel wide and scrolls in its
wrapper (a `w-full` table would rescale dragged widths away). Calculate
footer: count under Run, avg under Duration. Servers keep the request log.

Failed runs carry a one-sentence **diagnosis** under the status pill (see
v13 — one model call per failed run).

- ponytail: cron runs pass no inputs — their input cells show —.
- ponytail: the calculate footer is fixed count/avg, no click-to-pick.

Details: `docs/features/web.md` §v11.

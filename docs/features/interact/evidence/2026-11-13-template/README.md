# Template build cards (2026-11-13)

**What this folder holds:** the four cards built from the plan with no model call (`INTERACT_BUILD_KIND=template`), their judge findings, and the drives of the canvases they were put on.
Summary of the whole build half: `docs/features/interact/build-half.md`.

| Folder | What it is | Canvas and launcher |
|---|---|---|
| `look-drive/`, `look-drive-4/` | Drives of the first template delivery (892 px frames): Play, pause, Reset, screenshots. | `canvas-5e2375ad` (account `owner-interact-look-mwfmgmq2`), the earlier build. |
| `before-640/` | The same canvas measured at 1440 x 900 with Chat open: block sizes before the 640 px re-lay (928 px wide). | `canvas-5e2375ad` |
| `resized/` | The four cards re-laid on a 640 px frame (676 px wide card), measured and driven at 1440 x 900, Chat open, 100% zoom. `drive-look.json` holds the measurements and the clock readings; `*-page.png` are the whole-window shots (rest, top, slider, paused). | `canvas-09370fcc` (account `owner-interact-look-mwft9mh8`), opened by `C:\s\spec\interact-real\open-template.cmd`. |
| `judge/` | The shadow judge's findings for the first four template jobs and the five earlier judged jobs, in full, plus `findings.md` (verbatim, majors first) and `findings-sorted.md` (sorted into four groups). | Ledger rows: `benchmarks/ledger.jsonl` (`buildKind=template`). Findings of newer jobs: `benchmarks/judge/<jobId>.json`. |

Ledger rows that go with this folder: the 8 rows with `buildKind=template` in `docs/features/interact/benchmarks/ledger.jsonl` (the four cards twice: 892 px frames, then 640 px frames).
Regenerate a drive: `node scripts/interact/drive-look.mjs <out-dir> [canvas] [email]`.

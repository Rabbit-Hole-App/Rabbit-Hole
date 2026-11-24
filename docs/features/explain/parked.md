# /explain: parked work

Work the owner stopped on purpose. Each entry says why, where the evidence is and what un-parks it.

## Top-k (`ml-sampling-top-k`): its function and the server step

- Parked by the owner on 2026-11-24, after its two builds. Its reference and data files are main's; `ml-sampling-top-k` is on the frozen list `calculation-undeclared.json` (added once, 2026-11-24).
- Evidence: `docs/features/explain/checks/same-json/full/REPORT.md` on `film/evidence`.
- Build 2, top-k, 15 asks: why they were refused.
  - Its own percentages written in the prose: 5 asks.
  - k not below the number of weights: 2 asks.
  - A visual mis-tagged with a kind name instead of "diagram": 2 asks.
  - `{{v:weights}}` used for a list: 1 ask.
  - "result full cannot be written at series.0.values": 1 ask.
- To un-park: the owner's decision. The code and tests of both builds stay in git (`feat/same-json` at 953a9ea55).

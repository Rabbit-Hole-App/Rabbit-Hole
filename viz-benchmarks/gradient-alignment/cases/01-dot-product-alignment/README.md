# 01 — Dot-product alignment

Two labelled 2D gradient vectors and the worked dot product between them,
read as an alignment signal: positive means the two steps pull in roughly
the same direction, negative means they pull apart.

## Scope

A single static frame. No external reference image anchors this case - see
`../../SOURCE.md` - so it is scored on teaching clarity and technical
correctness rather than visual parity to a captured source.

## Files

- `target.json` — the case requirements
- `reference-notes.md` — what the scene needs to get right
- `evaluation-rubric.json` — scoring weights and hard fails
- `generated/latest/` — the current run; archive to `generated/history/vNNN/` before replacing it
- `evaluation/current.json` — the current score, with prior runs in `evaluation/history/`

# Comparing against a reference that is not deterministic

Several benchmark tools run a real model. Reload them and the sampled token
changes, the probabilities shift, the highlighted row moves. None of that is
drift in the capture and none of it is a defect in our scene.

**A case declares what is volatile.** Every `target.json` may carry:

```json
{
  "volatileReferenceFields": ["sampled token", "sampled token id", "exact probability values"],
  "knownReferenceLimitations": ["persistent onboarding panel cropped from probability view"]
}
```

`volatileReferenceFields` are values that legitimately differ between any two runs
of the reference, and therefore between the reference and us.
`knownReferenceLimitations` are artefacts of how the reference was captured.

**The critic must not score either.** A finding that amounts to *ours says "the"
and the reference says "and"* is not a finding. Nor is *our top probability is
54% and theirs is 61%*.

## What to score instead

Score the structure and the teaching behaviour — the things that must hold
whatever the model sampled. For a probability distribution that is:

- the selected token is visually identifiable without reading a number
- the candidates are legible and ordered
- bar length corresponds to probability, and the correspondence survives at small values
- the zero-probability tail is distinguishable from the small-but-nonzero one

For an attention matrix it is that the masked half is distinguishable from the
attended half, that magnitude reads as fill before any numeral, and that a cell
can be read as *this token attending to that one* — not which cell happened to be
darkest.

## The general rule

Ask of every finding: **would this still be true if the reference were reloaded?**
If not, it belongs in `volatileReferenceFields`, not in the report.

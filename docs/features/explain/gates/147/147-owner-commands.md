# Release 147 (RD-4): owner commands

Run ONLY after release 145 is released and its `gh variable delete` is done: 147 sits on the 145 candidate, so main must be `71415b6b8f30c687e8fa28b83a103fb0d775f495` first (the launcher checks it). Release 146 (canvas polish) follows 147 and is rebased onto this SHA by its integrator.

Candidate `962b4269fa874cc30cc8e7775447ca0994467f07` (branch release/explain-147, rollback release/explain-147-rollback-962b4269) on top of `71415b6b8f30c687e8fa28b83a103fb0d775f495`. Gate: web gate, first run all green, no smoke (renderer only), replay 0 of 474 rows moved, property count max 358 <= 362. MVP record `36893aee03be5e76` (preview OK, build 79411a984d35, log line shows 962b4269) on the dev clone.

```
gh variable set MVP_ALLOWED_SHA --body 962b4269fa874cc30cc8e7775447ca0994467f07 -R Rabbit-Hole-App/Rabbit-Hole
C:\s\spec\release-queue\release-mvp.cmd 147-explain --check
C:\s\spec\release-queue\release-mvp.cmd 147-explain
gh variable delete MVP_ALLOWED_SHA -R Rabbit-Hole-App/Rabbit-Hole
```

Decisions needed (see gates/147/147-suites-report.txt): (1) a node whose labels cannot share a height keeps its own lanes (the lint still reports rule a for it; no existing reference does); (2) the lint measures the narrowest layout, so most references show only the label-row change at card widths; (3) if the 145 candidate SHA changes, 147 is merged onto it and re-gated.

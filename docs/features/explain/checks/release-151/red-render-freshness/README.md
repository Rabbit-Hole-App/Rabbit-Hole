# red-render-freshness (real fix: regenerated the 10 committed static renders)

Test: packages/web/src/render-freshness.test.mjs (path in brief said src/explain-program/; it is src/).
Failed: 10 renders "STALE - the renderer has changed since this PNG was rendered": viz-benchmarks/gradient-alignment/cases/01-dot-product-alignment and
viz-benchmarks/illustrated-transformer/cases/{01,02,03,04,06,07,08,09,10}-*/generated/latest/static-00.png. scene-spec hashes all still match; only rendererHash moved.
Moving commits (git log 79dde1da9..HEAD over RENDERER_FILES in scripts/render-fingerprint.mjs): 44feb891d (cream ground, transparent unfilled shapes, 1.5px outline),
3e564b028 (composed theme, 32x28 strip cells, role fills), 90831156a, 939cd029b (operator strokes, sum-to-1 bars), c24486f76 (SDK_ROLES, no pixel change).
79dde1da9 had earlier redone only fingerprints because the pixels were then identical; this time the PNGs genuinely differ (white-ish #fafaf8 ground -> cream, see before-/after-04-softmax.png), so re-render, not fingerprint-only.
Fix: the repo's own generator, `cd packages/web && node render/rerender-statics.mjs` (vite build into dist-render, Playwright Chromium via captureScene, writeFingerprint right after each render). Ran locally, 34 s, no network/provider. rerender.log is the output.
dist-render was not committed (check git status: untracked/ignored; only the 20 files are staged). Layout in the new render is otherwise unchanged; the "value (V)" caption overlapping its column labels in case 04 is pre-existing (same in the old PNG).
Files: before.txt, after.txt, hunk.diff (fingerprint hunks; PNGs are binary, hunk.stat.txt has sizes), rerender.log.

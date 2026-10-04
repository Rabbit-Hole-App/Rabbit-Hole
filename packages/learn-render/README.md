# learn-render

Renders Learn lectures to MP4. Rough.js hand-drawn whiteboard scenes in Remotion,
Virgil handwriting, Inter captions, Fish Audio voice. This package has its own
dependencies — the CLI stays zero-dep and never imports from here.

## Commands

```
npm run render nms     # tts (cached) -> out/nms.mp4 (1920x1080, 30fps) + out/nms.vtt
                       # unchanged inputs skip the remotion pass (content hash); --force overrides
npm run stills nms     # one screenshot per screen -> out/screenN.png
npm test               # acceptance: duration, fonts, red pixel at beat 5, cached re-render < 60s
node scripts/tts.mjs --voices   # browse Fish Audio voices (needs the key)
```

## Voice

Set `FISH_AUDIO_KEY` in the environment. One TTS call per beat, mp3, cached in
`.cache/` by hash of text + voice id + model — edits to a beat's `voice` line
re-fetch only that beat. Without the key the lecture renders silent with
estimated beat durations and upgrades itself on the next render with a key.
Voice id lives in `render.config.json` (`voice`); beat duration = clip + 600ms.

## Lecture format

`lectures/<id>/script.json`: `screens` (whiteboard | code; `clears` starts a fresh
board) and `beats` (one voice line + caption + ordered `strokes`, each with `at`
seconds into the beat and `dur`). Stroke types: rect, ellipse, line, arrow, cross,
path, text, code. Board tokens: white board, `#37352F` ink, `#2383E2` blue,
`#EB5757` red. Everything drawn goes through rough.js; strokes draw themselves via
stroke-dashoffset and a pen sprite rides the head of the active stroke.

## Next layer

tldraw is the learner's canvas (pausing the lecture and scribbling on the board),
not part of the renderer — deliberately not installed here.

## Motion (V1 harness, M0–M1)

Spec: `docs/features/rabbit-hole-motion-v1-harness-spec.md`. No model calls here yet.

```
npm run motion:prove [outDir]   # Demo A: static validation, preview, contact sheet, final + validation,
                                # determinism (two fresh contexts), network probe, bundle-time allowlist
node --test "motion/*.test.mjs" # contracts, duration, static validation (no rendering)
sh motion/linux/run.sh docker|unshare   # the same proof on Linux with the network denied
node scripts/motion-local-check.mjs setup|run <final.mp4>   # local stack: LearnVideos -> LEARN_MEDIA -> video block
```

- `motion/contracts.js`: the canonical MotionBrief, storyboard, Author output, finding and
  MotionJob validators, the model roles, the single repair round and the one format re-ask.
  `motion/duration.js`: 5–30 s, default 10, rounded (.5 up) and clamped with a decision line.
- `motion/static-check.js`: §8.2 rules for composition source (@babel/parser 7.24.1, MIT).
  Imports: `react` (useMemo, useRef, useLayoutEffect, Fragment) and `remotion` (AbsoluteFill,
  Sequence, Series, Freeze, Loop, Easing, interpolate, interpolateColors, spring,
  measureSpring, random, useCurrentFrame, useVideoConfig). Fonts: Inter, Virgil. Cap 64 KiB.
- `motion/remotion-renderer.mjs`: `RemotionRenderer`, the §9.4 adapter. Bundles
  `src/motion/index.jsx` with the job's composition aliased in, refuses non-allowlisted
  imports at bundle time, injects a self-only CSP into the bundle page, renders preview
  (scale 0.45 = 864x486) and final (1920x1080, h264 yuv420p bt709, muted when narration is
  none), stills, the labelled contact sheet, and validates the final with the compositor's
  ffprobe. Bundles and MP4s are cached by content hash.
- `motion/fixtures/`: §27 demos, verbatim source excerpts at pinned SHAs, and the
  hand-written Demo A brief, storyboard and composition.

Windows renders are authoring evidence only (spec §10.3). Frame hashes are compared within
one OS image: Chromium rasterizes text differently across OSes, so Windows and Linux hashes
are not expected to match. On Windows the network boundary is the page CSP plus static
validation; navigation, `window.open` and WebRTC are outside CSP and are closed only by the
Linux network namespace (`--network none` / `unshare -n`).

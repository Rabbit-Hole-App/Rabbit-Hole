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

## Motion (V1 harness, M0–M3)

Spec: `docs/features/rabbit-hole-motion-v1-harness-spec.md`. Model calls so far: the Motion Director (M2) and the storyboard (M3), both under `MOTION_DIRECTOR_MODEL`.

```
npm run motion:prove [outDir]   # Demo A: static validation, preview, contact sheet, final + validation,
                                # determinism (two fresh contexts), network probe, bundle-time allowlist
node scripts/motion.mjs font-proof [outDir]   # Demo B: JetBrains Mono loads, identical in two fresh contexts
node --test "motion/*.test.mjs" "motion/service/service.test.mjs"   # contracts, static checks, the service contract
sh motion/linux/run.sh docker|unshare   # the same proof on Linux with the network denied
node scripts/motion-brief.mjs "15s explain me softmax func" --concept attention [--select model.py:62-71] [--storyboard] [--call]   # M2-M3: intent, sources, duration, Director, MotionBrief, storyboard (dry run without --call)
node scripts/motion-brief.mjs --brief motion/fixtures/m2/softmax-15s-attention.brief.json --storyboard [--call]   # M3 from a saved brief
node scripts/motion-local-check.mjs setup|run <final.mp4>   # local stack: Motion render API stand-in -> LearnVideos -> LEARN_MEDIA -> video block
sh motion/service/context.sh   # deploy context for rabbit-hole-motion-renderer-dev (Home deploys)
```

- `motion/contracts.js`: the canonical MotionBrief, storyboard, Author output, finding and
  MotionJob validators, the model roles, the single repair round and the one format re-ask.
  `motion/duration.js`: 5–30 s, default 10, rounded (.5 up) and clamped with a decision line.
- `motion/static-check.js`: §8.2 rules for composition source (@babel/parser 7.24.1, MIT).
  Imports: `react` (useMemo, useRef, useLayoutEffect, Fragment) and `remotion` (AbsoluteFill,
  Sequence, Series, Freeze, Loop, Easing, interpolate, interpolateColors, spring,
  measureSpring, random, useCurrentFrame, useVideoConfig). Fonts: Inter, Virgil, JetBrains Mono
  (2.304 Regular, OFL-1.1, assets/fonts/JetBrainsMono-OFL.txt); no generic families. Cap 64 KiB.
- `motion/remotion-renderer.mjs`: `RemotionRenderer`, the §9.4 adapter. Bundles
  `src/motion/index.jsx` with the job's composition aliased in, refuses non-allowlisted
  imports at bundle time, injects a self-only CSP into the bundle page, renders preview
  (scale 0.45 = 864x486) and final (1920x1080, h264 yuv420p bt709, muted when narration is
  none), stills, the labelled contact sheet, and validates the final with the compositor's
  ffprobe. Bundles and MP4s are cached by content hash.
- `motion/fixtures/`: §27 demos, verbatim source excerpts at pinned SHAs, and the
  hand-written Demo A and Demo B briefs, storyboards and compositions.
- `motion/service/`: the DEV render service `rabbit-hole-motion-renderer` (spec §10.2).
  `server.mjs` (GET /health; Bearer `MOTION_RENDERER_TOKEN`: POST /render a motion-render/1
  job, GET /render/<id>, GET /render/<id>/artifacts/<name>), one render at a time (429),
  420 s, 25 MB. `child.mjs` renders one job (preview, contact sheet, final, validation, two-context
  determinism, preview/final comparison) inside `motion-sandbox` / `sandbox-init`: unshare
  net/pid/mount/ipc/uts, the motion-render user, empty environment, private /tmp, service files
  hidden, renderer read-only, and kernel limits per job from `resource-control.mjs`
  (ResourceController: cgroup v2 when complete, else cgroup v1 as on Fly; 3 GiB with no swap
  allowance, 1024 tasks, 1.5 CPUs, proven cleanup; neither backend = no render).
  `Dockerfile` + `fly.dev.toml` for Home; `service.linux.test.mjs` runs in that image
  (expects `cgroup-v1`; set MOTION_EXPECT_RESOURCE_BACKEND=cgroup-v2 elsewhere).
- `motion/lockfile.test.mjs`: the lockfile must carry the Linux platform binaries the image
  needs (`@esbuild/linux-x64` at the bundler's esbuild version, pinned as an optional
  dependency here; Remotion's Linux compositor). A Windows-written lock once dropped esbuild's.
- `motion/director.js`: the Motion Director (M2). A grounded LearnerTurn (shared resolver:
  `packages/control-plane/src/learner-intent.js`, `source-grounding.js`) becomes one validated,
  renderer-neutral MotionBrief; one schema-only re-ask; grounding errors fail the brief.
  `motion/model-config.js` resolves `MOTION_DIRECTOR_MODEL` (env, else `claude-opus-5-5`).
  `motion/fixture-source.js` serves the pinned nanoGPT source, checked against its MANIFEST.
- `motion/storyboard.js`: the storyboard stage (M3). A separate, stateless Director-role call on
  the validated brief; one schema-only re-ask; semantic failures return `storyboard_invalid`
  with reasons and never spend the repair round. `motion/storyboard-check.js` is the
  deterministic validator (scope, claims, conditions, must_show coverage map, must_not_claim,
  teaching mode, concise text, renderer-neutral).
- `motion/video-block.js`: the existing `type: "video"` block for a finished render
  (`operation: {op: "motion_render", render_id}` + Motion metadata); LearnVideos pulls the MP4
  through `MotionProvider` (packages/control-plane/src/motion-provider.js).

Windows renders are authoring evidence only (spec §10.3). Frame hashes are compared within
one OS image: Chromium rasterizes text differently across OSes, so Windows and Linux hashes
are not expected to match. On Windows the network boundary is the page CSP plus static
validation; navigation, `window.open` and WebRTC are outside CSP and are closed only by the
Linux network namespace (`--network none` / `unshare -n`).

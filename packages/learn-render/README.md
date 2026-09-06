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

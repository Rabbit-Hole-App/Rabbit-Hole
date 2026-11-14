# AI Tutor landing demo: internal notes (not on the page)

- Preview: https://rabbit-hole-web-dev-landing-tutor.tryrabbithole.workers.dev/ (clone of the dev worker, built from
  branch preview/landing-ai-tutor-pendulum, worktree C:/Users/cyudhist/Desktop/workspace/landing-tutor).
- Branches (local only, never pushed): feat/landing-ai-tutor-demo = the landing change (c0655def7); preview/landing-ai-tutor-pendulum
  (4db86df2c) = the same landing commits plus cea2cd4a2, the preview-only product change below; the preview is built from it.
- Provenance: the recording is the real canvas, Chat panel and Explanation player in the dist-dev build under vite
  preview, every /api request answered by capture/capture.mjs. The Tutor's words are scripted (capture/script.json);
  the opening exchange is a restored saved thread; no model, Motion route or job was called. The card is
  capture/pendulum-block.json, written by capture/build-block.mjs (prepared by hand in the scene format, not a model
  output) and checked by capture/validate-block.mjs. Camera moves and the cursor/click ring are editorial, injected in
  the recording page only; every control in the film is really clicked.
- Product change (preview branch only): animation-scene.js gains the 'oscillate' timeline action (angle =
  amplitude * cos(2 pi t / period) about a pivot, from elapsed time); AnimatedScene.jsx setInput returns a time-mode
  card to 0 s when a setting changes. Why: derive ops have no time or trigonometry (scene-derive.js DERIVATIONS) and
  timeline events only ease between keyframes (animation-scene.js phase/ease).
- Rebuild a take: capture/RUN.txt; after encode.mjs (trim, to <name>-trim.webm), retime.mjs applies the speed ramp (1.5x outside the two runs, 1.0x inside); takes: capture.mjs wide|phone; frames.mjs for a contact sheet; inspect.mjs for the landing at three sizes.
  inspect.mjs for the landing at three sizes).
- Limits: WebM (VP8) only: Playwright's ffmpeg has no H.264 encoder or MP4 muxer, and there is no system ffmpeg. The
  dev worker's static assets answer a Range request with the whole file (200), so Safari may not play it.

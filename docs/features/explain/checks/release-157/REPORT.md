# Release 157-card-audio: report

Release name: 157-card-audio (renumbered by the coordinator: 156 is the Learn Position crash fix, web only, on main as 710801bb2 at 11:33 AM PT)
Release SHA (full): 1cffe2ef81d97ad408c3ef6f26847cc451dcdc37 (branch feat/release-157 on rabbit-hole; main 710801bb2e1928c0674e3c4c502b583539389cd5 is its ancestor; about 112 files, +4.6k/-1.2k against 5d13f435f)
Recovery branch: recovery/card-audio-157, tip d1c8f8ac1d289e18b21949f61c2e68bb0604435c (one commit, the tree of main 710801bb2 on top of the release SHA)
Clone: https://rabbit-hole-web-dev-r157-int.tryrabbithole.workers.dev (build 1187c065957f, MVP record e0b730889d64217b; GET /library serves /static/app-BhPCM1E9.js; refs/notes/dev-deploys NOT pushed)
Pins and launcher: C:/s/spec/release-queue/157-card-audio.pins and release-157-card-audio.cmd (a copy of 155 launcher: only the number, the name and the SHA differ; checked by a diff). Preview script preview-157-card-audio.mjs, run-preview-157-card-audio.sh. W = C:/s/r157-int (clean, at the SHA).
Startup profile launcher (not run): C:\s\spec\startup\startup-profile-157.cmd

## IMPORTANT: Cloudflare startup limit
The first preview deploy (on an earlier candidate, 836132a0c, before two small commits were added) was refused: "Your Worker failed validation because it exceeded startup limits" (the error that refused release 151 twice). The next attempt on the final SHA failed with "fetch failed" (network), the one after passed. So the bundle is near the startup CPU limit and the result is not stable. I could not measure it: wrangler deploy --dry-run is denied to the agent. Offline: importing the whole dev-worker module graph in node takes the same time on main 5d13f435f and on this build (8 runs each, medians 550 ms vs 548 ms), so no single new module evaluates slowly; the growth is code size (parse and compile). The owner launcher deploys to production and can hit the same refusal. Run the startup profile launcher first (2 to 4 minutes, uploads nothing) and compare with 150 (431.7 ms) and 151 (374.8 ms). If production refuses with code 10021, the mitigation is to load the audio and voice routes lazily (dynamic import in the route table); not built, it needs a measurement first.

## What is in it
Merged from branches: feat/r152-shared 077bc59c6 (contains r152-audio, r152-playing, r152-prompt, r152-suggestions, the transcript window and the shared-canvas work), feat/r152-figure 8ad7c09dc (legend pills follow their text), feat/r152-flow 9f35a16b9 (strips as wide as the prose column), feat/r152-transcript 679888a4a (transcript window at a fixed seven-sentence height, auto-scroll). Cherry-picked from feat/audio-build-2 (215ef4279) and feat/voice-1 (0b50ea700), because both were built on owner/local (349 and 352 commits ahead of main) and a merge would have pulled in other lanes: the 16 Card audio commits (77c4b74b2 to 215ef4279) and the 3 voice commits (f4b8fa985, 49f2c3f5f, 0b50ea700). Then main 710801bb2 merged in.
- Card audio: script and voice routes (Gemini Flash Lite then Fireworks script; ElevenLabs Jessica voice), length floors, example rule that ships with exampleMissing, shared spoken-number parser, cost confirmation dialog, 15 s in-flight marker, play/replay pill, green playing frame and minimap mark, transcript window.
- VOICE-1: one narrator (ElevenLabs Jessica) for card audio, Voice Tutor, Read it aloud (20 s limit, 504 "Narration audio timed out. Try again.") and /whiteboard narration; Fish pins removed.
- UI: suggestion strips (one button per row), Prompt as the last action in the card pill (also for viewers), no Minimize or expand on cards, shared and published canvases draw the Explanation features, legend pills follow their text (471 snapshot ids moved).
Resolved by hand in the first merge: AdaptiveCanvas.jsx (5 hunks), CanvasMinimap.jsx, SharedBoardPage.jsx, learn-minimap.js, check-map.json, explain.md; two tests (card-selection, explanation-minimize-toolbar) taken from owner/local, which holds the owner-tested wording. main had removed the canvas docView that feat/r152-shared still carried: I kept main side, plus the Prompt lookup, onSuggestSignIn and the id on minimap boxes, and dropped the tile wiring (cards no longer minimize).
Fixes on top: 784f83b9f (no tile reference left in the card wrapper; promptOf in the owner stack position), 71f42ec34 (no-ellipsis test allows the script prompt JSON template), 88d8731ab and 1cffe2ef8 (check-map rows; strips parity test expects no negative margin).
NOT in: LOCAL_NO_SIGNIN (no occurrence in the diff), learn sections, proof/motion/pendulum/tree-trace lanes, rehearsal, tocChipName, late slots, VAR-1, HEAT-1, 24dc5cbbe (a duplicate of the 077bc59c6 pill-width change). The only remaining difference from owner/local in the bundle UI files is AdaptiveCanvas.jsx, 15 lines: other lanes code (lateSlots, tocChipName) and main 156, which owner/local does not have yet.

## Config, migrations, flags, secrets
- D1: no migration. The 15 s in-flight marker is a row in shared_ask_events (category explanation_audio_inflight); the table (0005) has no CHECK on category.
- Pricing: new row elevenlabs|eleven_flash_v2_5|input_chars 0.04 USD per 1,000 characters (ESTIMATE); the fish|s1 row stays as RETIRED so old records still price. Guard categories explanation_audio (charged), explanation_script (free), narration_tts.
- Flags and config: no flag change, no wrangler change, no new env var names. Launch limits are defaults in code (script 60/hour 200/day, voice 30/hour 100/day); a worker var of the same name overrides.
- Secrets: ELEVENLABS_API_KEY is already in the prod-release.mjs required list (Voice Tutor uses it); /whiteboard narration now needs it too. FISH_AUDIO_API_KEY is still in that required list although no path uses it (cleanup later). Nothing set by me. Card audio has no flag: it is on for every learner when this ships; the first Play asks for confirmation and shows the voice cost.

## Tests
- Full unit sweep of the final tree, one node process per file, 6 at a time (sweep2.txt): 1043 files pass; 3 report failures: rabbit-hole-prod-config.test.js (5 tests; it fails identically on main 5d13f435f, checked, so not caused by this release) and check-map.test.mjs (2 failures only because the sweep ran it from packages/; from the repo root it passes 22 of 22, see rerun2.txt). The first sweep (sweep.txt) ran before main 710801bb2 and the flow/transcript merges; it found the no-ellipsis failure (fixed).
- Targeted rerun after each merge (rerun.txt, rerun2.txt): every web test that reads AdaptiveCanvas, canvas-slots or learn-position, plus audio, transcript, voice, selection, shared, minimap, strips, svg-snapshots, learn-slash, check-map, no-ellipsis. rerun2 found the strips parity test (fixed in 1cffe2ef8); everything else passes.
- Preview (fast path): affected tests web 2373, control plane 718, smoke 183, all 0 fail; explain-program-render-check 38 of 38; build ok.
- Not run: browser/e2e checks beyond the render check, release-mvp.sh --check (the launcher runs it), any paid call.

## Snapshot audit (legend ids)
svg-snapshots.json vs main: 3280 entries, 471 moved (271 ids at 2 to 3 widths each), 0 added or removed, widths unchanged, height changed on 55. Cause: one commit, 8ad7c09dc, measures a legend pill text with Arial advance widths plus 3 percent instead of the generous estimate, so a pill is as long as its name (owner 2026-11-17); a name with a formula keeps the old measure. Moved ids are coordinate-plot references and gallery specs with a legend (list: moved-ids.txt). The snapshot test passes against the regenerated file.

## Check-map
check-map.test.mjs passes 22 of 22 from the repo root. New rows: ExplanationAudio.jsx, explanation-audio.js (web and control plane), explanation-audio-script.js, narration-voice.js, TranscriptWindow.jsx, audio-playing.js, transcript-reveal.js, transcript-scroll.js, extra unit tests on CardPrompt.jsx, SelectionActions.jsx and AdaptiveCanvas.jsx, and five tutor-diagrams files that were already unmapped on main (matrix-tuple.js, ml-mle-steps-reference.js, theme/palette.js, theme/generate-css.mjs, theme/stray-hex-lint.mjs).

## Main must be 710801bb2 at release time. If another release lands first, redo:
1. git merge rabbit-hole/main into feat/release-157 (normal merge; AdaptiveCanvas.jsx conflicted once already).
2. Rerun the web tests that read AdaptiveCanvas, svg-snapshots, check-map (from the repo root), learn-slash, the ExplanationAudio tests.
3. New recovery branch: delete recovery/card-audio-157, then REPO=C:/s/r157-int bash C:/s/sprint2-evidence/ship/recovery.sh NEWSHA 157 card-audio.
4. New SHA in 157-card-audio.pins (SHA and MAIN_PREV), preview-157-card-audio.mjs (SHA and BASE) and release-157-card-audio.cmd (the line: call :one 157 NEWSHA).
5. Rerun bash C:/s/spec/release-queue/run-preview-157-card-audio.sh (about 15 minutes; retry on "fetch failed"); note the new clone build and record id.

## Decisions for the Reviewer
1. Startup limit: ship through the launcher as is, or run the startup profile first? Recommend the profile first.
2. Card audio has no flag and is on for every learner at release. Recommend yes (the owner listened and said yes on 8878).
3. FISH_AUDIO_API_KEY remains a required secret in prod-release.mjs though nothing uses it: leave until a cleanup.
4. whiteboard-policy.js changed (voice); policy version bump not done (recommend no).
5. Housekeeping: r154-int and r155-int worktrees remain; r157-int stays as the preview worktree.

## Owner command (a launcher; it sets MVP_ALLOWED_SHA, runs the check, the release, then deletes MVP_ALLOWED_SHA)
C:\s\spec\release-queue\release-157-card-audio.cmd
(optional first: C:\s\spec\startup\startup-profile-157.cmd)

# Release 158-audio-play: report

Release name: 158-audio-play
Release SHA (full): 2aeca536d19346699535c3cb599b01651c6c8d2e (branch feat/release-158 = feat/audio-play, one commit on main 1cffe2ef81d97ad408c3ef6f26847cc451dcdc37 = release 157; a fast-forward descendant, no merge commit; main was still 1cffe2ef8)
Recovery branch: recovery/audio-play-158, tip 542b29bf14c787d8327354b310a53fe31d9da9df (one commit, the tree of main on top of the release SHA)
Clone: NOT DEPLOYED. The preview's wrangler deploy to rabbit-hole-web-dev-r158-int failed twice with "A request to the Cloudflare API (/accounts/.../workers/scripts/rabbit-hole-web-dev-r158-int) failed" (the fast path prints no cause; the wrangler log shows the upload reached "Total Upload: 10103.45 KiB / gzip: 2560.58 KiB" and the binding list, then the script request failed). Build, affected tests and smoke passed both times. No MVP record exists yet, so production will not accept the release until the preview passes.
Launcher: C:\s\spec\release-queue\release-158-audio-play.cmd (a mirror of 157's: only the number, the pin name and the SHA changed; checked by diff). Optional first: C:\s\spec\startup\startup-profile-158.cmd.
Pins: C:/s/spec/release-queue/158-audio-play.pins; preview script preview-158-audio-play.mjs; runner run-preview-158-audio-play.sh; W = C:/s/r158-int (clean, at the SHA; node_modules and scripts/topic-pipeline/node_modules are links, as in r157-int).

## What is in it (3 files, +21/-56; web only, no control-plane change, no migration, no flag, no config)
Owner decision 2026-11-18 12:33: the first Play of card audio has no confirmation. packages/web/src/ExplanationAudio.jsx, GeneratePill: `press` sets busy, adds the card to wantPlay, calls the host's `narrate(cardId)` once (the script if it is missing, then the voice), deletes wantPlay and toasts on a status other than ready, and ends busy. Removed: `confirming`, the ConfirmDialog portal, the ConfirmDialog, createPortal, usageLine and UNKNOWN_PRICE imports, and the two-step script-then-ask path (`narrate(cardId, { voice: false })` is no longer called from the pill). Kept: the server call (`confirmed: true`), the caps, the 15 s in-flight marker, the error pill and retry, viewers-only-play. `estimate_credits` stays on the card; no cost is shown anywhere. The comment says the press is the paid step, owner 2026-11-18.
Tests (packages/web/src/explanation-audio.test.mjs, 18 tests): the three tests that asserted the dialog (data-audio-confirm, Cancel, Generate, "Price not available yet") now assert one click = narrate(cardId) once with no options, no dialog and no cost line, busy and disabled meanwhile, the ready pill plays; a failure (status not ready) clears wantPlay, toasts and the next press runs again; a card whose script step failed calls narrate(cardId) once, never { voice: false }. Docs: docs/features/explain.md, the Money bullet. Before/after test diff: film/evidence checks/release-158/test-before-after.diff, source-docs.diff.

## Tests (0 fail)
Preview run: affected test web explanation-audio 18; smoke set 183 (explanation-audio, narration-voice, learn-voice-tts, whiteboard-generation, explanation-audio-client, explanation-audio, audio-playing, transcript-window, transcript-reveal, card-selection, explanation-minimize-toolbar, shared-canvas-parity-canvas, learn-slash 40, svg-snapshots 1); explain-program-render-check 38/38; check-map.test.mjs 22/22. Snapshot audit: svg-snapshots passes unchanged, 0 ids moved (no tutor-diagrams file touched). Not run: the whole packages/web suite, browser checks, release-mvp.sh --check.

## NOT in the release
Any cost display, any control-plane change, VAR-1, FONT-1, SECRET-1.

## Startup CPU and bundle size
Not measured. Preview wrangler log: Total Upload 10103.45 KiB / gzip 2560.58 KiB (the 150/151 figure was 9642 KiB; 157 added the audio and voice code). This change removes code from one component. START-1: record the number from startup-profile-158.cmd (or 157's) beside 150 (431.7 ms) and 151 (374.8 ms).

## Blocker and what to run
The clone deploy must pass before the launcher: run `bash C:/s/spec/release-queue/run-preview-158-audio-play.sh` again (about 3 to 4 minutes; log C:/s/spec/logs/preview-158-audio-play-run.out and the preview-158-audio-play-*.log). 157's preview passed on a later attempt after a startup-limit refusal and a network failure; if it keeps failing with no cause, read the newest file in C:/Users/cyudhist/AppData/Roaming/xdg.config/.wrangler/logs, or run the startup profile (above). If main moves before release: merge main into feat/release-158, make a new recovery branch, new SHA in the pins, preview script and launcher, rerun the preview.

## Owner command (a launcher; it sets MVP_ALLOWED_SHA, runs the check, the release, then deletes MVP_ALLOWED_SHA)
C:\s\spec\release-queue\release-158-audio-play.cmd   (only after the preview passes and the Reviewer has read this report)

# Release 137 (video-canvas: UX-1, UX-2, UX-3, markdown anchor): BUILD PHASE report

Branch `explain/video-release-137` (pushed) at `e306bc4e4711f689fb01822f424f80710bf77986`, developed on top of the 134 candidate branch `explain/canvas-cards-r4` (a825e2556). It is NOT yet stacked on 136: the gate phase starts when the dispatcher sends `BASE = <sha>` (the 136 candidate); then rebase into `explain/video-release-137-stacked` and run the full web gate.

## Commits on the branch (oldest first, over a825e2556)
| Id | SHA | What |
|---|---|---|
| CV-4 (markdown anchor) | 45659cc3e (was 46109a502) | with no explanation card yet, a typed /explain follows the markdown card beside it, not the column |
| UX-1 (first version) | 98497fb62 (was c51e6bfd5) | superseded, but kept: 5c54dc803 builds on it and does not apply without it; the net diff is the final toolbar |
| UX-1 | 50c2eb4b0 (was 5c54dc803) | SelectionToolbar: [Ctrl+K] · Add to chat · Highlight · Create note on the explanation, markdown and web cards (PDF untouched) |
| UX-1 tests | 4a61bd900 (was 9584c4ac6) | tests follow the four-button toolbar |
| UX-2 | d32f11eb8 (was 47101eb1e) | placeNear converts rects into the card's own units (place-near.js, re-exported by selection-toolbar.jsx) + place-near.test.mjs |
| UX-3 | 6cce634cc (was 7b25e0706) | "Ask here" -> "Ask in chat" (title and aria-label; data-ask stays "here") |
| fix | e306bc4e4 | the inline-highlight guard looks at selection-toolbar.jsx (the suggestion button now says "Ask in chat"); check-map row for place-near.js |
Dropped as the directive said: f8de4f541 (CV-4 cherry-pick: the 134 branch has CV-4), 441f762d0 (guard-fix cherry-pick: 134 has its guard fixes), 13ea19169 (the 120 px cap: 134 has it as ff1d982f9).
Conflicts: none (every cherry-pick applied cleanly; the one that does not apply without the superseded UX-1 first version is explained above).

## Tests run, each file singly (no suites, no heavy lock)
Passing: beside-placement 12, place-near 3, selection-toolbar 4, selection-explain 8, explanation-card-interactions 26, webcard 14, answer-destination 13, canvas-equation 12, card-icons 6, card-rename-render 5, card-selection 13, code-refs 3, content-gestures 6, context-docs 6, explanation-highlight-v2 4, file-doc-highlights 10, learn-ask-target 9, map-files 8, project-ui 21, slash-preview-header 3, slash-sheet 17, toc-conversation 6; scripts/ci/check-map.test.mjs 22/22.
One failure found and fixed in e306bc4e4: inline-highlight.test.mjs:277 asserted that ExplanationInteractions.jsx has no `Ask in chat"` string (a guard against the OLD selection-toolbar button of that name); UX-3's new suggestion-button title legitimately contains it. The guard now checks selection-toolbar.jsx; 25/25.
Check-map: the new source file packages/web/src/place-near.js had no row (check-map.test.mjs failed on it); added `place-near.js -> place-near.test.mjs`. The new test files need no row.
"Ask here": no occurrence remains in src or docs (docs/features/explain.md was updated by UX-3); two historical files were left alone by decision (the 2026-11-08 e2 UI review and the approved card-07 design HTML).

## NOT run (gate phase)
Full web unit, tutor-diagrams, web build, scripts tests, property count, replay, e2e checks (they need a browser/stack: the e2e files touched by UX-1 are source-ref-command-check.mjs; other checks that mention the selection bars (selection-bar-check, markdown-highlight-check, webpage-card-check, add-to-chat-check, pdf-excerpt-check) were grepped for the removed labels ("Explain" bulb, "Ask about selection" on the web card, "Copy") and none assert them; they could not be run locally without a stack).
Before/after screenshots of the three toolbars: gate phase (local stack, scripted routes).

## Decisions needed (none blocking)
- The superseded UX-1 first version stays in the history of this branch (98497fb62); squash is possible at the owner's discretion since the commits are unreleased.
- PDF toolbar follow-up (five buttons, no source link on Ctrl+K, Create note shown only beside a canvas, "Add excerpt to canvas" as the fifth) is a separate row; not built here.

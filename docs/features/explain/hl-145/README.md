# HL-145 screenshots (PARTIAL, evidence only, not release-blocking)

Status 2026-11-14: the BEFORE set is here. The AFTER set (pink vs yellow, the Ctrl+K dim with pink holes, the two icons, both clicks, the keyboard Ctrl+K linked card) has not run
to the end yet: a first after run showed the saved passage NOT pink for the derived "linked" board (see Findings), so the capture is being corrected; one final run follows once the combined 144 gate has ended.

## How these were taken (keyless, local, no stack, no model)

`capture.mjs` drives Chromium against `vite preview` of a built dist-dev (BEFORE = explain/ctrlk-144 @ 83f1597cc; AFTER = explain/hl-145-on-ctrlk @ f250cd48b). Every `/api` request is answered by the script; anything
else off the loopback is refused. Fixture: DERIVED from the v60 board export (`film-explain/bank/board-export-canvas-bcb7f9f6-postwrite-v60.json`): its Markdown file card (en.md, rev e020962c...) and its
"Split criteria: measuring impurity" card, which in the export has no sourceRef. The server's mint (`POST /api/learn/source-refs`) and the artifact route attaching the minted ref to the card are emulated by the script;
nothing else is emulated and no model is called.

## Files

- `before/C1-before-ctrlk-window.png`: keyboard Ctrl+K over the selected heading, on ctrlk-144: the words stay marked in the Highlight YELLOW, the whole page is dimmed (no hole), the passage pill and "Explain selection".
- `before/C2-before-card-made.png`: after Send: the card is made beside the file card and the Chat has its entry, but the file card shows nothing for the passage (no pink, no icon) and the new card has no source row.
- `before/measures.json`: `tutorSource: 0` (no persistent mark), `headerButton: null`, `gutterButtons: []`, and the request log: `ARTIFACT sourceRef=-` (no ref minted on the keyboard path) = the owner's "no highlight, no symbol" case.

## Findings so far

1. BEFORE confirms the case: the keyboard Ctrl+K path mints no sourceRef (no `POST /api/learn/source-refs` in the log), so the card has no link and the file card draws nothing.
2. AFTER (first run, request field not yet corrected in the stub): the keyboard path DID mint (`POST /api/learn/source-refs`, `MINT "Split criteria: measuring impurity"`); the stub then missed the ref on the artifact request (the field is `sourceRefId`, not `sourceRef`: capture bug, fixed).
3. AFTER, derived "linked" board: the yellow Highlight painted, but `tutor-source` had 0 ranges and no header/gutter icons. Static checks show the fixture ref matches (`sourceRefOf`, `explanationsFor`, `resolveQuote` all resolve it in node), so the cause is in the page (the card id was rewritten from `inline-<request>-card` to a new id on load: the script now uses a plain UUID id and logs what the app saves). To be settled by the final run; if the app drops `sourceRef` on load that is a real finding and will be reported as one.

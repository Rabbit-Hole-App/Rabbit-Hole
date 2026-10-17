# Right-panel Search — approved owner scope

UI and Imports completed and pushed through dev preview on 2026-10-16 at 23:33 Pacific. Search starts from acdac56bb98479a48aa2c00f7381b5ff383719c0. Owner explicitly instructed autonomous implementation, parallel work, no routine approval stops. No new paid calls. Never push main, deploy production or run production D1. Task 4 Card-scroll.txt may start only after Search also completes.

Expand the existing right-panel Search into unified current-canvas search and object browsing, without AI. Preserve existing search shortcut; never assign Ctrl+K. Preserve existing flows and resizable panel.

## Field, filters and browse

Keep search field at top. Compact wrapping chips: All, Cards, Text, Comments, References, Code, Rabbit Holes. One active filter; switching preserves query. Show useful counts. Empty query browses each category; meaningful empty category state. All browses searchable objects; Text includes standalone text and supported document content; Comments threads; References structured source/canvas relationships; Code code-bearing objects; Rabbit Holes only existing child links, never generic Start Rabbit Hole action.

## References and result presentation

Qualifying explicit relationships: PDF/page citations, paper/web-source citations, repository file/symbol references, links to another canvas. URL-looking prose alone does not qualify; globally attached context does not make every card referenced. Query matches own content plus reference titles/source names/paths/page labels. One result per object with reference type badge and count/compact summary.

Compact thumbnail grid especially Cards/References/Code/Rabbit Holes: two columns where panel permits, one when narrow. Square preview contains original proportions (canvas card remains unchanged), readable title/excerpt, type icon, badges and query snippet. Text identifies results without previews. Reuse existing thumbnail infrastructure; never mount a live notebook/graph/video/full card per result. Comments and long text may use compact rows.

## Search content and matching

Current live canvas, including unsaved edits: card titles/body, standalone text, shape labels, code text/file names, equation source/labels, structured reference metadata, child Rabbit Hole titles, comments, BlockNote even when Editor hidden. Use actual stored content beyond scrolled visible portion. No OCR, crawling or model calls. Do not claim image text without existing extraction, full unread PDF, entire repo from excerpt or inaccessible files. If source indexing reused, distinguish source-text matches from visible card content.

Default case-insensitive literal word/phrase matching; retain meaningful code punctuation/file paths. One result per object even title/body/refs all match; useful highlighted excerpt, multiple-occurrence count. Rank direct title/name ahead of body, stable ordering. If previous/next arrows retained: disabled at zero, position such as 3 of 12, same displayed ordering. Objects are results; occurrences are matches.

## Navigation

Click object pans at comfortable zoom with side-panel space accounted, briefly highlights, keeps Search open, never moves/resizes object. Avoid tiny-object extreme zoom and long-card unreadable fit. Long cards reveal matching content where supported: Full content brings matching region into viewport, Scrollable scrolls inside card. Temporary match highlight never mutates saved text. Back to previous view restores camera before first jump in that search session.

Comments: show thread excerpt and object/location. Click focuses anchor and opens existing thread; preserve query/filter so Back returns. Opening never resolves. Default open comments, Include resolved option in Comments. Deleted anchors use existing orphan behavior.

Rabbit Holes: main click focuses parent; separate Open Rabbit Hole action enters child. References: main click focuses referencing object; explicit separate source/PDF/file/canvas opening reuses viewers/navigation. BlockNote: disclose document location; reveal Editor via existing mechanism and focus block; never pretend a hidden-document match is a canvas card.

## Scope, permissions, lifecycle and performance

Initial explicit scope This canvas. Do not silently search project/private repos/child canvases; broader existing search remains separate. Only accessible comments/private metadata/code/linked titles/shared/copied objects. Client filtering never replaces server authorization on fetched data. Read-only viewers can search/navigate without editing rights.

Incremental index from existing model; update relevant entries on content/add/delete/reference/child-link/comment/document changes. Do not rebuild full index every render or Chat token. Debounce query when useful; background worker only if measured size justifies. Virtualize large grids/lists, reuse cached previews. No query analytics by default. Guard late results across canvas/query changes.

States: loading remote comments/content, partial availability, no matches, empty category, retrieval error+Retry, result deleted after search. Never show No results while relevant content loading. Keyboard navigation/visible focus; Enter activates focused result, never sends Chat. Closing/reopening retains query/filter/scroll for current canvas session; no accidental previous-canvas query/results.

## Required focused verification and reporting

Extend Search/navigation checks for every empty-query filter; text/code/comment/reference matching; live unsaved edits/deletions; dedup/multiple matches; reference/child classification; thumbnail focuses correct target; camera with panels; long-card navigation; Back; correct comment thread; child focus vs entry; hidden BlockNote; permissions/unavailable content; keyboard/large lists. No paid calls. Report content types fully searchable, metadata-only and unavailable; never label partial coverage full-content search.

Baseline evidence reusable at its original SHA; final readiness/CI/gate follow existing release policy. One owner per worktree. At most three local stacks; serialize browsers. Legacy .doc and production converter hosting remain deferred.


## Implementation and verification status

Implemented in the existing Learn Search panel and read-only member/shared viewers. Literal matching is local; comments use existing permission-checked GETs. No new model calls, OCR, repository crawling or whole-source fetches are added.

Stored card/text/shape/equation content, live document blocks, stored notebook cells/plain outputs, and already-loaded file/code units are searchable. Notebook workspace filenames are metadata; unprovided workspace file bodies, unread PDF bodies and image pixels are unavailable. Source text matches are labeled separately. Existing source limits remain visible as partial coverage.

Release evidence is recorded per exact commit in the coordination receipt and repository CI/gate/deployment notes. The canonical checks are canvas-search-check.mjs (live content, classification, navigation, equations, keyboard and mobile), canvas-search-viewers-check.mjs (real accepted membership and public permissions), and canvas-search-files-check.mjs (real CSV/DOCX deep text, reload and failed-read Retry). Existing panel, source-finder and code/source checks remain required; these new checks do not replace them. Model fixtures prove wiring only. Legacy .doc import remains deferred and is not part of Search.


The existing canvas-file-drop check is classified Windows-only under the CI-speed Task B4 portability policy. Linux Wrangler 4.150.0 repeatedly loses the internal proxy connection on the malformed 30 MiB upload (fast CI runs 39016088850, 39017332956 and 39018455292), including after transport-isolation trials. This remains an unresolved Linux coverage gap, not a passing check or a product fix. All 41 assertions, including strict 415 rejection and no stored rejected object, remain mandatory in the independent Windows release gate. The unchanged deployed Worker also returned 415 and stored none in three real-edge trials. Fast CI reports the excluded check as notCovered; the release harness still requires successful fast CI and the full gate.

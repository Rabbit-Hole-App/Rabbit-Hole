# Commit 3 inventory: removing View > Workspace and the single doc

Date: 2026-11-15. Task 3ac0b26d-0af5-4f40-bace-8f775bfa3cb5 (Rehearsal MVP, commit 3 of the BlockNote-card plan).

Read at `f53edaac4` (branch `rehearsal/mvp`) and re-verified at `f8cb7b980`. Read-only inventory: nothing was edited, built, run or committed while producing it.

**Revision note.** The checkout moved during the inventory run: HEAD became `f8cb7b980`, not `f53edaac4`. It added 8 lines to AdaptiveCanvas.jsx (DocNode and RunNode pill changes) and 7 to TutorCodebase.jsx. All line numbers below are at `f53edaac4`, re-verified with `git grep`. At `f8cb7b980`, AdaptiveCanvas.jsx lines after ~942 are +2 and lines after ~960 are +4. All other files are unchanged between the two.

All paths are under `C:/s/rehearsal-mvp/packages/web/src/` unless noted. Abbreviations: AC = AdaptiveCanvas.jsx, LP = LearnPage.jsx, CD = canvas-doc.js.

I did not run `git show rabbit-hole/main:CLAUDE.md` for content. I only confirmed it fetches (495 lines). The standing rules in the brief were followed.

## 1. Inventory

### 1a. Menu and view state: DELETE

| file:line | what | decision |
|---|---|---|
| canvas-menus.js:8 | import of `PanelsTopLeft` and `ArrowUpToLine` | DELETE both. `PanelsTopLeft` has no other user in this file (CreatorAnalytics.jsx has its own import). `ArrowUpToLine` is used only at :132. |
| canvas-menus.js:49 | `canvasEditMenus` signature takes `docView, setDocView` | DELETE both params. |
| canvas-menus.js:112-117 | comment plus the whole "Workspace" submenu (Canvas and Editor radios) | DELETE. |
| canvas-menus.js:130-132 | divider, comment, and "Go to document start" row (calls `setDocView('editor')` then `canvas().goToDoc()`) | DELETE all three lines. The row is outside the Workspace submenu and is easy to miss. Delete the :130 divider too. The `...(onSlashCommands \|\| onShortcuts ? [{divider}] : [])` at :133 already supplies the separator, so keeping both would double it. |
| canvas-menus.js:104-111 | Canvas and Study radios (`study`) | KEEP, as the brief said. |
| canvas-menus.js:118-128 | Show / hide submenu | KEEP. |
| canvas-menus.js:31 | Insert > Document (`insertDocument`) | KEEP. |
| CD:15-22 | `docViewKey`, `readDocView`, `writeDocView` | DELETE. The `${canvasKey}:view` localStorage value is left orphaned in browsers (harmless, no cleanup). |
| LP:91 | import of `readDocView, writeDocView, docOnServerCopy, docSaved` (and `boardSizeWarning, BOARD_LIMIT`) | DELETE `readDocView`, `writeDocView`, and `docOnServerCopy` and `docSaved` if section 1c deletes them. KEEP `boardSizeWarning` and `BOARD_LIMIT`. |
| LP:1528-1534 | comment, `docView` state, effect on `canvasKey`, `setDocView` | DELETE. `canvasKey` is still used elsewhere. |
| LP:1724-1725 | `?card=` focus: when `docView === 'editor'`, calls `setDocView('canvas')` then `focusBlock` in a double rAF | DELETE. Keep `api.focusBlock(id)` directly (the :1724 branch already does this for canvas view). |
| LP:1949 | `revealDocument: () => setDocView('editor')` passed to `useCanvasSearch` | DELETE. |
| LP:2398 | `canvasEditMenus({..., docView, setDocView, ...})` call | DELETE both args. |
| LP:2560 | `<AdaptiveCanvas docView={docView} docReady={...} docError={...} onDocRetry={...} onDocDirty={...}>` | DELETE all five props. |
| AC:1672 | props `docView='canvas'`, `docReady=true`, `docError=null`, `onDocRetry`, `onDocDirty` | DELETE. |
| voice-ui.test.mjs:138 | asserts that the AC signature substring contains `docView = 'canvas', docReady = true, docError = null, onDocRetry = null, onDocDirty = null` | UPDATE the string. |
| SharedBoardPage.jsx:136 | `useState('canvas')` for `docView` | DELETE. |
| SharedBoardPage.jsx:260 | `revealDocument: () => setDocView('editor')` | DELETE. |
| SharedBoardPage.jsx:283 | `hasDoc = !!board.doc && !docIsEmpty(board.doc)` | DELETE. |
| SharedBoardPage.jsx:288 | `canvasEditMenus` args `docView, setDocView` | DELETE. |
| SharedBoardPage.jsx:294 | `docView={hasDoc ? docView : 'canvas'}` | DELETE. |
| SharedBoardPage.jsx:10 | `docIsEmpty` import | DELETE if unused. |
| comments/MemberBoardPage.jsx:10 | `docIsEmpty` import | DELETE if unused. |
| comments/MemberBoardPage.jsx:37-38 | comment and `docView` state | DELETE. |
| comments/MemberBoardPage.jsx:92 | `setDocView('canvas')` in the card-focus effect | DELETE. |
| comments/MemberBoardPage.jsx:100 | `revealDocument` | DELETE. |
| comments/MemberBoardPage.jsx:112 | `canvasEditMenus({... docView: state.doc && !docIsEmpty(...) ...})` | DELETE both args. |
| comments/MemberBoardPage.jsx:133 | `docView={...}` prop | DELETE. |
| canvas-view.test.mjs:108-113 | PV-1 asserts `useState('canvas')` and `docView={hasDoc ? docView : 'canvas'}` in SharedBoardPage | RE-POINT. Keep the "no saved camera" assertion at :112. Drop the two docView assertions. |

### 1b. The single-document runtime in AdaptiveCanvas: DELETE

| AC line | what | decision |
|---|---|---|
| 144 | `lazyFeature(CanvasDoc)` | DELETE. DocCard imports CanvasDoc itself. |
| 210 | `DOC_W`, `DOC_MIN_H` | DELETE. |
| 23 | imports `unknownDocBlock`, `isFileDrag`, `pressKeepsDocFocus`, `DOC_CARD_SIZE`, `newDocBlock` | DELETE `unknownDocBlock`. It is used only by the paper at :6585 and :6593. KEEP the rest. |
| 1909-1918 | `doc` state (`setDoc`), `docRef`, `docLive`, `docTimer`, `docWritten`, `liveDoc()` | DELETE. |
| 1934, 1949, 1968, 1973 | `...(doc ? { doc } : {})` in `boardRef`, `savedShape`, the save effect's state, and its deps | DELETE. |
| 1995, 1999-2008 | `docSearchApi`, `docChanged`, `onDocDirtyRef` | DELETE. |
| 2011-2031 | `flushDoc` and its `pagehide` listener | DELETE. DocCard unmount-flush and `boardRef` plus `withDocCardLive` cover cards. |
| 2262 | `captureNavigation` scroll query `'[data-block-id] *, [data-canvas-doc] *'` | KEEP. Doc cards are inside `[data-block-id]` anyway. |
| 2277-2293 | `boardNow` and `liveBoard` doc merge; `boxes.doc`; `goToDoc`, `flushDoc`, `replaceDoc` | DELETE the doc parts. KEEP the functions. |
| 2877-2883 | `persist` merges `liveDoc()` | DELETE that merge. |
| 2886-2892 | `retire` returns `{...work, doc: live}` | DELETE the doc part. |
| 3499-3505, 3526 | `focusSearchTarget` branch `target.kind === 'document'` (`document-hidden`, `document-loading`, `docSearchApi.reveal`) | DELETE both. |
| 3895-3896 | `searchRead` returns `doc: liveDoc()`; `useLayoutEffect` deps include `doc` | DELETE the `doc` entry and dep. |
| 3848-3849 | wheel exceptions `[data-canvas-doc] [role=listbox...]` and `pre,.tableWrapper` | KEEP. DocCard carries `data-canvas-doc`, so doc-card menus and tables still need them. |
| 3870 | surface `scrolled` handler (`activeElement.closest('[data-canvas-doc]')`) | KEEP, but see the Reviewer decisions. The caret-reveal-to-camera path was built for the free-standing paper. |
| 4130 | key-ownership guard `closest('[data-canvas-doc]')` | KEEP. Doc-card editors need it. |
| 5814-5821 | `docFrame`, `goToDoc` | DELETE. |
| 5824-5837 | `placeDoc` | DELETE. |
| 5841-5847 | effect that creates an empty sheet when Editor view has no doc | DELETE. |
| 5849-5862 | `docCaret` | DELETE. It is passed as `onCaret` only by the paper. DocCard passes no `onCaret`. |
| 5863-5880 | `paperRef`, `docH`, `docBox`, `docBoxRef`, `docShown`, ResizeObserver, `docMounted`, `docEpoch` | DELETE. |
| 6203 | `minimapBoxes` entry `{...docBox, doc: true}` | DELETE. |
| 6488 | `!pressKeepsDocFocus(active, target)` in the shell's blur-on-press rule | KEEP. DocCard's editor still needs this. |
| 6567-6577 | loading/error panel `data-doc-state="loading\|error"` with Retry | DELETE. |
| 6584-6600 | the paper (`data-canvas-doc data-doc-state`, `data-canvas-doc-editor`) | DELETE. |
| 940-947 | `DocNode` (DocCard shell) | KEEP. |
| 1003 | `block.type === 'doc'` dispatch | KEEP. |
| 6460 | `docLive: docCardWords` in `CanvasEdit` | KEEP. |
| 1927-1933 | `docCardLive`, `withDocCardLive`, `docCardWords` | KEEP. |

### 1c. Persistence, sync and conflict: DELETE or KEEP, by role

| file:line | what | decision |
|---|---|---|
| canvas-persist.js:117-122 | `BOARD_KEYS` includes `'doc'`; `boardText` and `boardFromText` special-case `doc` | KEEP during transition. A legacy server or local copy still has the key, and removing it would change every board's `boardText` and cause one-time PUTs. Remove in a later cleanup, once production boards are migrated. |
| canvas-persist.js:130-135 | `conflictDoc` | DELETE after migration. It is a single-doc 409 rule. Cards use `withPendingWork`. |
| canvas-persist.js:136 | `boardHasContent` special-cases `doc` | KEEP. An unmigrated legacy local copy must still count as content. |
| canvas-persist.js:5 | import of `docIsEmpty` | KEEP. |
| canvas-persist.test.mjs:86-89, 105, 124, 169, 198-199, 213 | tests on `doc` key and `conflictDoc` | KEEP the `doc` key tests. Delete the `conflictDoc` tests at :198-199 if `conflictDoc` is deleted. |
| CD:37-47 | `docOnServerCopy` | DELETE with its test (canvas-doc.test.mjs:37-69). |
| CD:52-53 | `docSaved` | DELETE with its test (:111-124) and the LP:1780 use. |
| CD:48-49 | `pressKeepsDocFocus` | KEEP (test :83-100). |
| CD:25-26 | `BOARD_LIMIT`, `boardSizeWarning` | KEEP. Board-wide, not doc-specific. |
| CD:29-31 | `hasText`, `docIsEmpty` | KEEP. The migration uses it. |
| CD:5-9, 12-13 | `DOC_BLOCK_TYPES`, `unknownDocBlock`, `DOC_CARD_SIZE`, `newDocBlock` | KEEP. |
| CD:97-105 | `caretRect`, `docEdgeKey` | `docEdgeKey` stays: CanvasDoc.jsx:55-64 `toEdge` uses it for Ctrl+End/Home in doc cards. `caretRect` plus `onCaret` have no caller once the paper is gone. See the Reviewer list. |
| LP:1546-1547 | `docConflict`, `docRestore`, `docKeepKey` state | DELETE with the UI below. |
| LP:1557-1560 | `boardSnapshot` | KEEP. |
| LP:1646-1649 | local-copy-is-newest branch | KEEP. It is a migration trigger point. |
| LP:1651-1686 | server-newer load path: `keptAtPress`, `ownDoc`, `replaced`, `kept`, `docOnServerCopy`, `:replaced`, `setDocRestore`, `localStorage.setItem(boardStorageKey, work.state)` | The doc-specific parts (`keptAtPress`, `ownDoc`, `kept`, `docOnServerCopy`, `setDocRestore`, `:doc-keep`) become DELETE. KEEP the `:replaced` write for non-doc local content and `withPendingWork`. KEEP :1688 as the point where the server state lands locally. |
| LP:1761-1780 | `saveBoard`; `docSaved` gate for Saved/Saving | KEEP `saveBoard`. Drop the `docSaved` gate. |
| LP:1787-1805 | `refused`: `docChanged`, `setDocConflict(true)` | Drop `docChanged`. 409 then always takes the recovery path. |
| LP:1845-1851 | `keepMyDoc` | DELETE. |
| LP:2480-2487 | `data-doc-save-status` chip gated by `docView === 'editor' && saveState` | Reviewer decision. |
| LP:2488-2492 | `data-board-size-warning` | KEEP. |
| LP:2494-2498 | `data-doc-conflict` ("Reload and keep my document") | DELETE. |
| LP:2499-2507 | `data-doc-restore` ("Restore my unsaved document") | DELETE. |
| home/canvas-local.js:4, 61-63 | `hasLocalContent` treats `doc` via `docIsEmpty` | KEEP for legacy copies. |
| home/canvas-local.test.mjs:4, 93 | imports and calls `readDocView(null, KEYS.base)` | DELETE the import and that assertion. |

### 1d. Control plane (all pass-through of `doc`; nothing enforces its shape)

| file:line | what | decision |
|---|---|---|
| control-plane/src/learn-boards.js:226 (`stateText`) | board size cap, `MAX_STATE = 1_900_000` (:37) | KEEP. |
| learn-boards.js:475, 483-484 (`forkState`) | `CONTENT` list; `if (state.doc is an object) out.doc = structuredClone(state.doc)` | KEEP for now. A fork of an unmigrated board must still carry `doc`. The fork's first load migrates it (client side, see 2a). Delete in a later cleanup. |
| learn-boards.js:502 (`forkable`), 510-535 (`guestDraftState`) | `forkable` goes through `sharedState`. `guestDraftState` starts from `{...source}`, so source `doc` is kept. | KEEP. See risk R7. |
| shared-privacy.js:14, 42 (`sharedState`) | keeps `doc` | KEEP for now. Callers: learn-boards.js:910, 940, canvas-comments.js:971, learn-shared-ask.js:347, publication-analytics.js:92, 134, 361. |
| control-plane/src/canvas-context.js:156 | prints "the canvas's written document" when an excerpt has `type 'document'` | KEEP. It only reads what the client packs. |
| control-plane tests for `doc` | none found | n/a |

### 1e. Search, chat context, comments, inline AI

| file:line | what | decision |
|---|---|---|
| canvas-search-index.js:4, 169-174 | `walk(board.doc?.blocks)` makes entries `document:<blockId>` (`kind 'document'`, `target {kind 'document', id 'doc', docBlockId}`) | DELETE the `walk`. A doc card is already searched as a card at :160, via `cardText` for `type 'doc'` (canvas-semantics.js:26). |
| canvas-search-index.js:131 | title `'Document'` for `object.type === 'doc'` | KEEP. |
| canvas-search-index.js:18 | `'file:document'` and similar mapped to category `document` | KEEP. These are file cards, unrelated. |
| canvas-search-panel.js:7 | filter chip `['document','Document']` | KEEP (file cards). Whether doc cards also fall into it is a Reviewer decision. |
| use-canvas-search.jsx:27, 121, 127 | `revealDocument` param; `if (result.kind === 'document') revealDocument?.()`; retry loop on `document-hidden` / `document-loading` | DELETE all. |
| search-drag.js:16 and search-drag.test.mjs:16 | "a document block" not draggable | DELETE that case (comment and test). |
| CanvasDoc.jsx:28, 33-46 | `searchApiRef` reveal API | DELETE. It has no caller after the walk goes. |
| canvas-search-index.test.mjs:44-49 | "hidden document blocks", `docBlockId` | RE-POINT to a `type:'doc'` block (card-level result). |
| canvas-search-navigation.test.mjs:19-23 | snapshot store test uses `board.doc.blocks` | RE-POINT or KEEP. It only needs some changing board field. |
| inline-ai-context.js:533-536 | pushes `{id:'doc', type:'document', text: docText(board.doc.blocks), ...place('doc')}` | DELETE. The doc card enters through the `blocks` path (:397, `cardText`). |
| inline-ai-context.js:641, 672-682 | `type === 'document'` tier and the dedicated `CANVAS.document` budget share | The `type 'document'` special-casing becomes unreachable. Behaviour change in R5. |
| doc-text.test.mjs:41-47, 60-107 | `boardObjects` doc object, partial coverage, passages, budget | RE-POINT to a `type 'doc'` block, or RETIRE the partial-with-passages tests (R5). |
| LearningBlocks.jsx:2352 | `describe` for `type 'doc'` (12,000-char slice) | KEEP. This is the card's context path. |
| canvas-semantics.js:26 | `cardText` for `doc` | KEEP. |
| chat-canvas-context.js:13-14 | `boardObjects(api.liveBoard())` | KEEP. |
| Comments (web/src/comments/anchors.js, control-plane/src/comment-anchors.js, canvas-comments.js:242-247, :358) | anchors are object anchors keyed on card, item, shape or group ids | **Nothing to change.** I found no comment anchored to a doc block. The paper stops `contextmenu` (AC:6590), `'doc'` is never in `bounds` or `ids`, and `anchors.js` objectOrigin cannot resolve `'doc'`. Section 3 explains the `'document'` target wiring. |
| Inline AI edit of the doc | none exists. The spec says no Ctrl+K AI in the doc (blocknote-canvas.md:395), and e2e checks Ctrl+K opens nothing. The doc is read-only context. | n/a |

### 1f. Keyboard and pointer rules: KEEP

These all key on the `[data-canvas-doc]` marker, which DocCard.jsx:65 carries.

| file:line | decision |
|---|---|
| AC:3848-3849, 3870, 4130, 6488 | KEEP |
| canvas-actions.js:22 (`NATIVE` selector) | KEEP |
| shortcut-owner.js:52 | KEEP |
| scene-selection.js:26 (`ESC_OWNERS`) | KEEP |
| DocCard.jsx:11 | KEEP, but the comment's "the canvas's one document" wording goes stale. |
| `pressKeepsDocFocus` (CD:48-49) | KEEP. |

### 1g. Minimap

| file:line | decision |
|---|---|
| CanvasMinimap.jsx:52 (`box.doc` rect `data-minimap-doc`) | DELETE |
| learn-minimap.js:28 (`...(box.doc ? {doc:true} : {})`) | DELETE |
| AC:6203 | DELETE (listed in 1b) |

### 1h. Unit tests that change

| file:line | decision |
|---|---|
| canvas-doc.test.mjs:5 | imports `docViewKey, readDocView, writeDocView, docOnServerCopy`. UPDATE. |
| canvas-doc.test.mjs:11-21 | view test. RETIRE. |
| canvas-doc.test.mjs:23-27 | size warning. KEEP. |
| canvas-doc.test.mjs:29-35 | `unknownDocBlock`. KEEP. |
| canvas-doc.test.mjs:37-69 | `docOnServerCopy`. RETIRE with the function. |
| canvas-doc.test.mjs:71-81 | regexes `replaceDoc` / `setDocEpoch` / `<CanvasDoc key={docEpoch}>` / `pagehide flushDoc` in AC. RETIRE. |
| canvas-doc.test.mjs:83-100 | `pressKeepsDocFocus` and the shell regex. KEEP. |
| canvas-doc.test.mjs:101-109 | regex on the AC `scrolled` handler. KEEP (the handler stays). |
| canvas-doc.test.mjs:111-124 | `docSaved`. RETIRE. |
| canvas-doc.test.mjs:126-181 | file-drop, `caretRect`, surface scroll, `docEdgeKey`. KEEP, or drop the `caretRect` test if it is deleted. |
| canvas-menus.test.mjs:15 | builder passes `docView: 'canvas', setDocView`. DELETE both args. |
| canvas-menus.test.mjs:112-123 | View rows list contains 'Workspace' and 'Go to document start'. RE-POINT to `['Zoom in','Zoom out','Zoom to 100%','Fit canvas','Fit selection','Show / hide','Page guides']`. Delete the Workspace sub-assertion. |
| canvas-menus.test.mjs:135 | "no trailing divider": `.at(-1).at(-1) === 'Go to document start'`. RE-POINT to `'Page guides'`. |
| canvas-menus.test.mjs:140-146 | "Workspace marks the current mode". RETIRE the Workspace part. KEEP the Fit selection part. |
| canvas-menus.test.mjs:164 | `docView, setDocView` args. DELETE. |
| canvas-menus.test.mjs:169-178 | `Workspace` `items[1].onSelect` `['editor']`. RETIRE that block. |
| canvas-menus.test.mjs:205-216 | groups assertion includes `['Workspace','Show / hide','Page guides'],['Go to document start']`. RE-POINT to `[...,['Canvas','Study'],['Show / hide','Page guides']]`. Delete :215. |
| canvas-menus.test.mjs:223, 243 | other View tests. Re-run after the edit. I did not read them. |
| canvas-menus.test.mjs:25 | Insert includes 'Document'. KEEP. |

### 1i. E2E checks

All are windows-only and local-stack, run by hand (scripts/ci/check-map.json:1880 and :1885: "the release gate does not run it"). Deleting a check file means removing it from every check-map list: 17 mentions for `canvas-doc-check.mjs`, 9 for `canvas-doc-persist-check.mjs`. `scripts/ci/check-map.test.mjs:24` fails if a mapped check is missing.

**canvas-doc-check.mjs** (33 checks; seeds and asserts the single paper):

| check at line | what it asserts | decision |
|---|---|---|
| :273, :278, :293, :311 | Canvas default, first placement centred beside Chat, ~760 px paper, first position saved as `{v,x,y,w}` | RETIRE (paper-only) |
| :324 | slash menu, heading, bold, bullet; Saved only after the server holds it | RE-POINT to a doc card: assert the server board's `type:'doc'` block `.blocks` has the text. |
| :370 | hide Editor, move sticky, reopen, no recentre, toggle not in undo | RETIRE |
| :409 | view choice in `${canvasKey}:view` survives reload | RETIRE |
| :420, :470, :523, :776 | keys stay in editor (Space, tool letters, Ctrl+A, Delete, Ctrl+Z, IME); block reorder; Escape and Ctrl+K; slash and toolbar click keeps caret | RE-POINT to `[data-doc-card] .bn-editor`. |
| :543 | Hand tool drag over the paper pans | RETIRE |
| :559 | Select all + Delete outside editor never deletes the document | RETIRE. A doc card is deletable like any card. |
| :578, :609 | Chat open/resize keeps the same editor; dark/light page | RE-POINT cheaply. |
| :693 | slash menu stays on screen near edges | RE-POINT. |
| :732 | known limitation (never failing) | RETIRE |
| :745, :881 | Chat carries unsaved doc text as a `document` object, full coverage; 200-block doc partial with passages | RE-POINT or RETIRE. See R5. |
| :803, :817, :851 | Go to document start; wheel reads down via camera; Ctrl+End/Home reveal caret | RETIRE. The card scrolls itself. The Ctrl+End `toEdge` unit stays. |
| :932-1046 | layers 1-10: cards above the paper, send to back, minimap page grows, dark/light | RETIRE |
| :1061 | no AI request, no page error | RE-POINT. |

**canvas-doc-persist-check.mjs** (25 checks):

| check at line | what it asserts | decision |
|---|---|---|
| :175, :232, :240, :302, :456 | default view, hide/reopen, pending save before hide, card dropped on paper, failed-load Retry on the paper | RETIRE |
| :183, :195, :247, :260, :275 | server holds `state.doc`; keys leave cards alone; reload keeps block ids; second browser; interleaved doc and card edits | RE-POINT to the card block. |
| :325, :335, :351 | B starts empty; child hole does not copy; a save held for A lands on A only | RE-POINT cheaply. |
| :378, :395, :412 | Duplicate, fork, Trash/Restore keep the document | RE-POINT. The card travels in `blocks`. Note `forkState` copies `blocks` verbatim, so this holds by construction. |
| :423 | read-only shared view shows the doc, not editable, no save | RE-POINT. |
| :446 | unauthorized gets no document data | KEEP as is. |
| :480, :497, :508 | two tabs 409: `data-doc-conflict`, "Reload and keep my document", "Restore my unsaved document" | RETIRE. The conflict-copy behaviour for cards is already covered by board-restore-check #5. |
| :533, :542, :556 | 85% size warning, 413 refusal, retry after undo | RE-POINT. Board-level, using a card for bulk. |
| :567 | no model call | KEEP. |

**Other checks:**

| check | asserts | decision |
|---|---|---|
| canvas-refs-check.mjs #3 (:378-394) | backlink in a new tab out of Editor view; `profile({view:'editor'})` (:111); `[data-canvas-doc]` count 0; document kept | RE-POINT. Remove the Editor-view branch. Assert the origin card selects and the document text survives. |
| canvas-refs-check.mjs :567-572 | `chooseWorkspace(page,'Editor')`, waits `data-doc-state=ready`, text shown, `chooseWorkspace('Canvas')` | RE-POINT to a visible `[data-doc-card]`. |
| canvas-search-check.mjs :132-150, :260 | hidden BlockNote result reveals Editor, Back restores camera | RE-POINT. The seed (:260) is legacy `doc`, so migration makes it a card. Assert the card result, activation, and Back restore. Drop the Editor reveal. |
| canvas-search-viewers-check.mjs :51, :158-172 | "hidden document is searchable and revealed read-only" (member and public); uses `chooseWorkspace('Canvas')` at :170 | RE-POINT. Cheapest real migration coverage for read-only viewers: keep the legacy `doc` seed and assert the card appears, read-only. Drop :170. |
| source-finder-check.mjs #9 (:212-222), `chooseWorkspace('Editor')` at :214 | "/" stays in the doc | RE-POINT: click into the doc card editor. The :28 seed migrates. |
| view-menu-check.mjs #16 (:513-535) | rows above 'Workspace'; Workspace Canvas/Editor | RE-POINT. Replace `rows.indexOf('Study') < rows.indexOf('Workspace')` with a Show / hide anchor. Delete :530-531. Add an assertion that neither 'Workspace' nor 'Go to document start' is in View. |
| board-restore-check.mjs :99 (`editor` profile), #7 (:314-358), #8 (:359-) | Reload and keep my document, server's doc kept aside, Restore | RETIRE #7 and #8, and drop :99. Checks #1-6 stay. |
| canvas-menu-helpers.mjs :2, :28-38 | `chooseWorkspace`, `workspaceValue` | DELETE, and drop the header comment mention. |
| card-context-menu-check.mjs:342, rabbit-hole-menu-check.mjs:74, panel-header-check.mjs:98 | exclusion selectors containing `[data-canvas-doc]` | KEEP. Still valid for DocCard. |
| pdf-excerpt-check.mjs:489, repo-canvas-cards-check.mjs:846, canvas-clipping-check.mjs, rabbit-hole-check.mjs :279, :1067 | comments or the word "workspace" | False positives. No change. |

### 1j. Docs

- `docs/features/blocknote-canvas.md`: the dated paragraph at :3 already announces commit 3. Update it, and mark sections 1-3, 4-7 (paper), 10 (single-doc save), 11-12 as superseded or rewritten.
- `docs/features/canvas-search.md` mentions the doc only generically.
- `docs/features/repo-canvas-graph.md:620`, `:681`, `:911` mention "the central BlockNote document". Historical.

## 2. Migration design

### 2a. Steps and where each goes

**(1) A pure function, `migrateDocToCard(state)`, in canvas-doc.js** (replaces :15-22).

- If `state.doc` exists and `!docIsEmpty(state.doc)`: return `{ ...rest, blocks: [...(state.blocks||[]), card] }` with `doc` omitted.
- If `state.doc` exists but is empty: return the state with `doc` omitted and no card.
- If there is no `doc`: return the same state.
- The card is `{ id, type:'doc', dx:0, dy:0, title:'Document', blocks: doc.blocks }`, with `doc.blocks` passed verbatim. That keeps the `unknownDocBlock` rule. DocCard.jsx:62-64 already shows an "opens read-only" notice for unknown types. Nothing is converted or dropped.
- Use `docIsEmpty` for "has text". It also counts non-paragraph blocks without a `content` array (dividers, unknown types) as content, so unknown blocks are never dropped.
- **Card id = `'doc-' + <synchronous hash of JSON.stringify(doc.blocks)>`.** It is deterministic, so two clients migrating the same state make the same card, and the existing dedupe in `withPendingWork` (canvas-persist.js:93-94) and `at(keyOf(...))` collapses them. A stale old-build client that wrote a different doc yields a different hash, so a second card appears. Nothing is lost. If the id already exists in `blocks`, skip adding. Use a plain FNV-style function. `crypto.subtle` is async. Do not use `crypto.randomUUID()` here.
- It must also be importable by the control plane, in case server-side migration is chosen. shared-privacy.js already imports `../../web/src/*.js`, and CD guards `document` with `typeof`.

**(2) Load path: AC:1796-1802** (`stored.current = boardState || JSON.parse(localStorage...)`). Wrap with `migrateDocToCard`. This one place covers every consumer:

- LearnPage's local copy.
- The server copy LearnPage writes to localStorage at LP:1688 before remount.
- SharedBoardPage and MemberBoardPage via `boardState`.
- Forks.

Set `migrated.current = true` when the function changed anything.

**(3) Placement, "canvas origin".** This is ambiguous. Blocks do not have absolute coordinates. World position is column origin + flow height + `dx`/`dy` (placeBeside AC:5783-5791; `COLUMN` is 560 at AC:208). A pure function cannot know the measured flow height. Options:

- (a) Append with `dx:0, dy:0`. The card lands in the column below the last card and nothing existing moves. Recommended.
- (b) Preserve the old world x/y. Needs a measured canvas (`pendingAt`, AC:5669-5677).

**(4) First save must be treated as a change.** AC:1958-1974 skips `onSave` on the first run (`if (!loaded) onSaveRef.current?.(state)`). With `migrated.current`, call `onSave` even on the first run. Keep the existing guard that skips the write when the local copy changed under it (AC:1966). `pushBoard` (LP:1796-1811) already waits for `boardLoaded` and replays on `online`.

**(5) Old doc kept until the save succeeds.** The canvas no longer carries `doc` in state. Instead:

- On migration, write `${boardStorageKey}:doc-premigration` (the old `doc` JSON) before the first local write.
- Remove it in `saveBoard` (LP:1761-1779) after `boardSynced.current = text`, once the saved state contains a block whose `.blocks` equals the backup's blocks. The PUT replaces the whole `state_json`, so the server's `doc` disappears atomically with that PUT.
- Until then, the server still holds `doc`, and the local backup holds it too.

**(6) Size.** With this design the PUT carries the card and not `doc`, so there is no 2x spike. The "doc plus card" variant would double it against `MAX_STATE = 1_900_000`. The card shell is ~150 bytes.

**(7) Idempotence and failure.**

- A failed PUT leaves the server `doc` and the local backup. The next load re-migrates to the same id.
- Two clients: same hash, same id, dedupe.
- A 409 goes through the existing recovery (LP:1651-1686). `withPendingWork` adds the card to the server's newer state and skips it if already present. If that state still has `doc`, `migrateDocToCard` runs again on remount and skips (id present).
- An empty `doc` with no card is cleared locally. LP:1646-1649 then sees `boardText(snapshot) !== synced` and pushes once (R6).

### 2b. Server

KEEP the `doc` pass-through (learn-boards.js:484, shared-privacy.js:42). Shared, published and fork views of unmigrated boards still return `doc`, and the client load-time transform renders it as a card. Delete the server lines in a later cleanup, once production boards are migrated. This keeps commit 3 client-only.

## 3. Risks

**R1. Finding boards with `doc` text** (read-only; I did not run any):

- **Production**: D1 `rabbit-hole-learn-prod`, binding `LEARN_DB`, table `learn_boards`. The column is `state_json`. Confirm the names from control-plane/wrangler.rabbit-hole-prod.jsonc and learn-boards.js:229, 256, 265 before running. Query shape: `SELECT id, org, app, board, version, length(state_json), json_array_length(json_extract(state_json,'$.doc.blocks')) FROM learn_boards WHERE json_extract(state_json,'$.doc') IS NOT NULL`, then filter to non-empty text by reading `$.doc.blocks`. The owner runs it with `wrangler d1 execute <db> --remote --command ...` through a `!` command. D1 has JSON functions.
- **8878 local**: the owner stack's persisted miniflare D1 under `C:/s/spec/owner-local/persist/` (read-only copy), plus browser localStorage keys `small.adaptive-canvas:<org>:<email>:<canvas>:ink` where `.doc` exists. A `${canvasKey}:view = 'editor'` key marks canvases the person actually opened.
- Count boards with `doc` text and note sizes (the doubling risk is irrelevant under the recommended design).

**R2. Comments anchored to doc blocks.** None exist, so nothing is orphaned (section 1e). A comment cannot anchor to `'doc'` in the current code. Verify against production data before you rely on it. I did not query any.

**R3. Search results change.**

- Per-block results `document:<blockId>` with "reveal and caret in a block" become a single card result (kind `card`, title 'Document'). The matching passage inside a card goes through the existing Full-content-card paragraph path.
- The 'Document' filter chip in canvas-search-panel.js:7 only matches file cards unless widened.

**R4. Unsaved words in a doc card, chat context.** `inlineBoard()` (AC:3881) reads `blocksRef.current`, not `withDocCardLive`. Words typed in the last 500 ms are in `boardRef` but not in the chat context package. The old doc used `liveDoc()`. The spec (blocknote-canvas.md section 12) says "include current unsaved text". Fix: use `withDocCardLive` in `inlineBoard`. This gap predates commit 3 but becomes the only path afterwards.

**R5. Context budget.** The old doc had its own share (`CANVAS.document`, inline-ai-context.js:672-682) and "partial with passages" coverage (control-plane/src/canvas-context.js:156). A doc card goes through the card path (`cardText` at :397, and `describe` slices to 12,000 chars at LearningBlocks.jsx:2352). Long documents change behaviour. Reviewer decides.

**R6. One-time PUTs.** Any board that carries an empty `doc` stub (every board that ever opened Editor) loses the key on load, `boardText` differs, and one push fires (canvas-persist.js:114 notes updated_at churn). Mitigate by treating an empty `doc` as absent in `boardText`, or accept it.

**R7. Guest drafts.** `guestDraftState` keeps only layout (`dx, dy, cardLayout, groupId`) for source cards (learn-boards.js:508-521). Content a guest types into a doc card is dropped when the fork is made. The old paper had the same effect, since the doc "is the source's". Not new, but worth stating.

**R8. Old-build clients.** A cached old bundle that writes `doc` can resurrect a deleted migrated card on the next migrate. Rare.

**R9. Camera behaviour of the paper is gone.** The wheel reads down via the camera; Ctrl+End reveals the caret; `docCaret`. Doc cards scroll inside themselves (`overflow-y-auto` in DocCard.jsx:65). The surface `scrolled` handler stays, but its docs-only purpose is mostly dead.

## 4. Smallest safe order of edits

1. `migrateDocToCard` in canvas-doc.js, plus unit tests. Cases: text becomes one card with the same blocks verbatim; empty gives nothing; unknown block types kept; idempotent when the id exists; different content gives a second card; no `doc` is a no-op.
2. Wire it at AC:1796-1802 and fix the first-save trigger (AC:1958-1974) and the premigration key (AC:1796 area; LP:1761-1779).
3. Replace the read-only viewers' `hasDoc`/`docView` use (SharedBoardPage, MemberBoardPage). Commit 3 needs no server change (2b).
4. Delete View > Workspace, "Go to document start", `docView`, `readDocView`/`writeDocView`/`docViewKey`, and the props chain (1a).
5. Delete the paper, doc state, caret, placement, flush, `replaceDoc`, search-reveal branch, minimap rect (1b, 1e, 1g).
6. Delete the doc conflict/restore UI and `docOnServerCopy`, `conflictDoc`, `docSaved`; settle the save chip (1c).
7. Update unit tests (1h), then e2e (1i) and `scripts/ci/check-map.json` entries for any retired check. A test edit alone proves nothing.
8. Update docs/features/blocknote-canvas.md.
9. Later, not in this commit: drop the `doc` lines in forkState, sharedState and `BOARD_KEYS`.

## 5. What the Reviewer must decide before deletion

1. **Placement.** Append with `dx:0, dy:0` (recommended) or preserve the old world position via `pendingAt`. "Canvas origin" is ambiguous (2a step 3).
2. **Save chip (LP:2480-2487).** Delete the "Saving/Saved/Couldn't save" chip, show it always, or show it only while a doc card is focused. The `docView` gate disappears either way, and `onDocDirty` has no caller afterwards.
3. **409 UX for doc cards.** Rely on `withPendingWork` conflict copies (`-mine-xxxx`, toast) as the replacement for "Reload and keep my document" and "Restore my unsaved document" (recommended), or keep a card-aware equivalent.
4. **Server `doc` pass-through (1d / 2b).** Keep it for now (recommended), or migrate server-side in `sharedState` and `forkState`.
5. **Search filter.** Does a doc card belong in the 'Document' chip (canvas-search-panel.js:7)?
6. **Chat context budget for long docs (R5).** Accept the card path, or give `type 'doc'` blocks the old document share.
7. **Dead code.** `caretRect`, `onCaret`, `onReady`, `searchApiRef` (CanvasDoc.jsx:28-49); the `scrolled` handler's doc rule (AC:3870); DocCard.jsx:11 comment. Remove them in this commit or leave them (a `ponytail:` comment).
8. **E2E.** Approve RETIRE versus RE-POINT in section 1i. In particular, whether to keep a single seeded-legacy-`doc` check (the viewers check) as the migration e2e.
9. **R4.** Include the `inlineBoard` fix (`withDocCardLive`) in this commit?
10. **Migration trigger for read-only pages.** Confirm the pure load-time transform (no save) is wanted for guests and shared pages, with the real save happening only on the owner's first edit-capable load.

## 6. Not found or not checked

Not found: no comment-on-doc-block code path, no control-plane tests on `doc`, no guest-draft doc handling beyond `{...source}`.

Not read: canvas-menus.test.mjs :223 and :243, check-map `runner` entries for the checks I would re-point, the head of blocknote-canvas.md sections 8-9, and 13-16 beyond what I grepped.

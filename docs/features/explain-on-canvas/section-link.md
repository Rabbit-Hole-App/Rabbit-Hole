# Table of contents row menu: Go to source text, Move up / down, Copy link

Owner approved 2026-11-07. These three actions sit in a "..." menu on a Table of contents row (`TableOfContents.jsx`, the `data-toc-more` button in the row's hover group; always visible on touch). They use the existing `Menu` and `MenuItem` of `ui.jsx`.

## Go to source text

Shown on a roadmap row whose step has a source reference (`tocOf` in `roadmap-client.js` sets `source: { kind: 'source' }`, `withRoadmap` passes it to the row). It calls the roadmap's own `go` (`use-roadmap.js`), which frames the roadmap's source card on the canvas. It does not scroll to the exact passage; the passage view stays on the slot card's source link (UI.07).

## Move up / Move down

Shown on a manual heading that is not read-only, and only where a sibling exists that way (`toc-move.js` `moveTargets`). It calls the existing `canvasApi.moveSection(id, beforeId)`, the same call a drop makes, so a heading's sub-sections move with it. A heading never leaves or enters another heading's section, so its level and parent never change.

## Copy link

This reuses the existing card focus link; no new parameter exists. `?card=<blockId>` is read on the owner page (`LearnPage.jsx`) and the member page (`comments/MemberBoardPage.jsx`) through `cardParam`, which focuses the block once the board is on the canvas, shows "That card is no longer on this canvas." when it is gone, and removes the parameter with `history.replaceState` (`withoutCardParam`).

- The link is `cardLink(window.location, blockId)` in `canvas-refs-model.js`: the current address with `card=` set and the one-shot parameters (`share`, `thread`, `comment`) and the hash left out. Other parameters are kept.
- `blockId` is what `canvasApi.sectionBlockId(entryId)` returns: the heading block of a contents entry (`tocHeading(toc, id) ?? id`, as `showSection` and `refForSection` map it) or a roadmap row's delivered card. When the canvas has no such block, the toast says "There is nothing on the canvas to link to" and nothing is copied.
- The link focuses the block. It does not frame the whole section the way the row's title click does.

**Access is unchanged.** The link opens only for people who can already open that page. The public shared pages (`/b/<token>`, `/e/<token>`) do not read `card=` in this release. To extend it, have `SharedBoardPage.jsx` consume `cardParam` the way `MemberBoardPage.jsx` does, then let the menu build the link from that page's address.

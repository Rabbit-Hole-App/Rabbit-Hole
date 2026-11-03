# /animation: older open browsers and tube scenes

Owner requirement (2026-11-02): gate the new representation on declared client capabilities, with missing information meaning legacy; an older
client must be told to update or reload when it meets a scene it cannot draw, on generation and on loading; old artifacts are preserved.
This note records what each client sees. Every claim below is pinned by `packages/control-plane/test/animation-old-client.test.js`, which loads the
old client's own `contract.js`, `storage.js` and `client.js` from a checkout of `51b6560cf` (`ANIMATION_OLD_CLIENT_DIR`, default
`C:/s/spec/animation/rca-base`; without it those 7 tests skip). Make the checkout with
`git worktree add --detach C:/s/spec/animation/rca-base 51b6560cf`, then link `node_modules` from a worktree that has it.

## The mechanism

- A tube is a `curve` geometry with a `radius`. The scene still declares `animation-scene/1` and `animation-capabilities/1`, so versions
  cannot tell an old client anything; only the field does.
- The browser declares `curve_radius` (`ANIMATION_CLIENT_FEATURES`) in the body of a create and in the query of a result read. A build at or
  before `51b6560cf` sends neither. The server keeps only features it knows (`clientFeatures`); anything else, including nothing, is legacy.
- Generation: the job stores the declared features. Without `curve_radius` the planner, author, repair and review are told the legacy surface
  rule, and the validate stage refuses any draft with a radius (a repairable `spec` problem).
- Loading: `readResult` answers `409 client_update_required` ("This scene needs the newest version of Rabbit Hole. Reload the page to update
  it.") when the artifact needs a feature the reader did not declare. A scene without a radius is served to everyone. The stored result is
  never changed by a read.

## What each client sees

| Client | Scene | Opens a saved card | Pending card whose job finished | Generates |
|---|---|---|---|---|
| Current (declares `curve_radius`) | plain curves | loads | applies | may use tubes |
| Current | tube | loads | applies | may use tubes |
| Older (declares nothing) | plain curves | loads, same artifact as the current client | applies | legacy: no tubes, no curved-surface plan |
| Older | tube, made elsewhere | card error: `The animation could not be loaded. Try again.` with Retry (see the gap) | alert: `This scene needs the newest version of Rabbit Hole. Reload the page to update it.`, polling continues | not reachable: its jobs carry no features |
| Older, server without the gate (the build before this change) | tube | `This animation's saved version could not be verified. Your saved settings are kept. Try again.` | not applicable | not applicable |

A current-build `storage.js` given the 409 shows the server's message on the card (status `update`, no Retry).

Old artifacts: `aj_9c453b6` (sealed), `aj_086fd46`'s repaired artifact and the web watch fixture validate under both contracts, are served
with or without features, hydrate to `ready` in both clients with equal artifacts, and the stored result is byte-identical after the reads.
The old contract's words for a tube scene are `scene.geometries.N.radius: unknown field(s): radius`, one per tube curve.

## The gap (the only one found)

An already-open client at `51b6560cf` or earlier cannot show the server's message when it opens a saved card. Its `hydrateAnimation` looks
at 404 and 410 only (`missing`); every other refusal, the 409 included, becomes status `error` with the fixed text
`The animation could not be loaded. Try again.` and a Retry that fails again until the page is reloaded. None of its messages mention updating.
Nothing is lost: the artifact, the result record and the card are unchanged, and a reload onto the current build opens the scene.
The one path where an old client does show the server's words is the pending card (`Animation3DCard.jsx` puts `error.message` in its alert).
The server cannot close this: any other status for the same refusal is worse (404 and 410 would read "no longer available"). Only new client
code can, and an open old tab does not get new code until it reloads.

## Before release

1. Deploy the server and the web bundle together (they ship in one Worker), to the dev clone first.
2. Open a tab on the previous build, do not reload it, deploy, then open a tube scene from a new tab and reload nothing in the old one: the old
   tab should show the generic error and recover on reload. (Owner check; the tests cover the same path without a browser.)
3. Do not roll the server back alone while tube scenes exist: the previous server cannot validate a radius, so it answers
   `409 version_unavailable` ("This animation could not be opened. Your saved version is kept."), checked against `51b6560cf`'s `artifactIntact`.
4. Keep the `51b6560cf` checkout available to run the 7 cross-version tests; they skip, not fail, without it.

## If the owner wants the gap closed later (not done)

- Accept it. The old client's text is generic but the scene and card are intact and a reload fixes it; it affects only a tab opened before the
  deploy that meets a tube scene made in another tab or on another device.
- Capability-version bump (for example `animation-capabilities/2` stamped on tube scenes): helps future builds refuse by version instead of by
  field name, and keeps a rolled-back server from misreading. It does not change what the `51b6560cf` client shows, because that client's
  fallback for any refusal is the same generic text.
- A "new version available" prompt in the current bundle: reaches tabs that reload onto it, so it helps the next generation of open tabs, not
  the ones open today.

## A production tab open before the first Animation release (owner question, 2026-11-02)

The client of `rabbit-hole/main` (`b58d74876`) has no Animation card, no card chunk and no animation routes (`git grep learn/animation` there: 0 matches; the
block type string `animation3d`: 0 matches; `main`'s own `animation` block type is Explain's, a different card). Read from that code, and run where it is pure
(`C:/s/spec/animation/sgd-mvp1-correction-v2/scripts/prerelease-prod-tab.test.mjs` imports its real `canvas-persist.js`); not executed in a browser.

- **Can such a tab receive an Animation card?** Yes, in two ways: it loads a board that holds one (an in-app switch to the canvas; a page load runs the new bundle),
  or it saves and the server refuses it as stale (409), after which its own merge brings the server's copy in. It calls no animation route for it.
- **What it shows:** an empty card frame. `LearningBlockBody` falls through to `return null` for a type it does not know, inside `CanvasNode` (width 380, the
  content's height); every `BLOCK_TYPES[type]` lookup uses `?.`; `describeBlock` ends in `return null`, so selecting it does not throw. Its Chat reads an
  `animation` plan proposal safely (`proposalBlock` returns null) but cannot Generate it. It cannot make an Animation at all. No crash path was found.
- **What happens to the board when it saves: nothing is dropped.** The server stores the board as one JSON text under a version lock with no block-type list
  (`learn-boards.js` `saveOwn`: a stale save is a 409, never an overwrite). The client passes blocks through unchanged (`canvas-persist.js` blanks only a
  `data:` `src` over 120,000 characters; moving a card spreads the block, `AdaptiveCanvas.jsx:2719`). A tab that mounted before the card existed applies only
  its own changes, by object id, onto the server's copy (`pendingWork`, `withPendingWork`), so a card it never saw stays. The only way the card leaves is the
  learner deleting the empty frame, as for any card. The three cases are run with `main`'s real code in the script above.
- **A reload** loads the new bundle: the card chunk loads on demand and the card opens normally.
- **Remedy: none needed for data.** The limitation to accept: such a tab shows an empty frame, with no words, until it reloads. A words-bearing placeholder would need
  a change to `main`'s client in an earlier release; tabs open across the first Animation deploy would still not have it, so it is not recommended.

## What protects a release from leaving tube scenes unreadable

- **First release:** `packages/web/e2e/production-bundle-check.mjs` fails a build that has no chunk declaring `curve_radius` (an older Animation client). Run against a
  `51b6560cf` bundle it fails with that line; against the v2 build it does not.
- **Later releases:** `scripts/prod-release.mjs` `checkCandidate` refuses a candidate whose tree no longer declares a client feature the served release's tree does
  (it reads `ANIMATION_CLIENT_FEATURES` from `animation3d/capabilities.js` at each sha). Together with what was already there, which `scripts/prod-release.test.mjs`
  pins: it never releases backwards, never over a split cp/app pair, and a failed deploy rolls back the pair, never one Worker.
- **Not enforceable by code:** a hand `wrangler rollback` of `rabbit-hole-app` or `rabbit-hole-cp` alone. After it the next release refuses (split pair) until a
  released pair is restored, and meanwhile the previous server answers `409 version_unavailable` for a tube scene ("This animation could not be opened. Your saved
  version is kept."): nothing is lost. **Never roll back one of the two Workers alone while tube scenes exist: roll the pair back, or roll forward.**

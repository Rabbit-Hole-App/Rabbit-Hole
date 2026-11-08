# Source selected-text actions

Stable ID: `sources/selected-text-actions` · Status: **static specimen**

[Open preview](preview.html) · [Markup](markup.html) · [Metadata](component.json) · [Original source](https://github.com/Rabbit-Hole-App/Rabbit-Hole/blob/aa2cfb19a2ca551f2c99aad5cbbacf968c7b9f56/docs/features/explain-on-canvas/handoff/ui/templates/rabbit-hole-source-header-and-chat-composer.html) · [Collection review](../../../REVIEW.md)

Text-only blue document pills. Selection actions are visual examples, not wired app behavior.

Palette role: **shared**. [Current blue/red balance](../../../foundations/PALETTE.md) supersedes the all-blue experiment controls in aa2cfb1. Historical previews preserve their original palette. Original shared CSS is retained for review; the explicit semantic overlay is `foundations/palette.css`.

## Edit and find

Edit `markup.html` and `component.json` here. Shared styles: `styles/source-headers.css`. Behavior: static/native HTML only. Paths are relative to `docs/ui/`. Run `python docs/ui/scripts/build.py` from the repository root after editing. `preview.html`, this README, the index and registry are generated; do not edit those outputs directly.

Template dependencies: none.

## App mapping candidates

These are existing integration landmarks, not proof this reference is implemented. Resolve the latest integrated implementation before changing the app; the audit snapshot is `aa2cfb1`.

- [packages/web/src/FileDocCard.jsx](../../../../../packages/web/src/FileDocCard.jsx)
- [packages/web/src/AdaptiveCanvas.jsx](../../../../../packages/web/src/AdaptiveCanvas.jsx)
- [packages/web/src/FileDocMarkdown.jsx](../../../../../packages/web/src/FileDocMarkdown.jsx)

## Acceptance and gaps

Review items: UI-06

Before app adoption: verify applicable default, hover, pressed, selected, focus, disabled, empty, loading and error states; keyboard interaction; long text; 320 px / 440 px / Focus layout; reduced motion for animated components. Not every state applies to every component. Static references do not prove selection wiring, persistence, source navigation or renderer registration. Browser visual acceptance remains pending.

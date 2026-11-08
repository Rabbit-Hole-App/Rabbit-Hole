# Sliders, switches and checkboxes

Stable ID: `controls/range-switch-checkbox` · Status: **reference**

[Open preview](preview.html) · [Markup](markup.html) · [Metadata](component.json) · [Original source](https://github.com/Rabbit-Hole-App/Rabbit-Hole/blob/aa2cfb19a2ca551f2c99aad5cbbacf968c7b9f56/docs/features/explain-on-canvas/handoff/ui/templates/rabbit-hole-interface-component-standards.html) · [Collection review](../../../REVIEW.md)

Extracted specimen; browser rendering unverified. Read the source review before adopting its CSS.

Palette role: **shared**. [Current blue/red balance](../../../foundations/PALETTE.md) supersedes the all-blue experiment controls in aa2cfb1. Flow previews use the current palette; linked archived sources preserve their original styling. Original shared CSS is retained for review; the explicit semantic overlay is `foundations/palette.css`.

## Edit and find

Edit `markup.html` and `component.json` here. Shared styles: `styles/standards.css`, `styles/review-corrections.css`. Behavior: `scripts/resize.js`, `scripts/standards.js`, `scripts/review-corrections.js`. Paths are relative to `docs/ui/`. Run `python docs/ui/scripts/build.py` from the repository root after editing. `preview.html`, this README, the index and registry are generated; do not edit those outputs directly.

Template dependencies: none.

## App mapping candidates

These are existing integration landmarks, not proof this reference is implemented. Resolve the latest integrated implementation before changing the app; the audit snapshot is `aa2cfb1`.

- [packages/web/src/explain-program/ProgramScene.jsx](../../../../../packages/web/src/explain-program/ProgramScene.jsx)

## Acceptance and gaps

Review items: See the collection review and verification checklist.

Before app adoption: verify applicable default, hover, pressed, selected, focus, disabled, empty, loading and error states; keyboard interaction; long text; 320 px / 440 px / Focus layout; reduced motion for animated components. Not every state applies to every component. Static references do not prove selection wiring, persistence, source navigation or renderer registration. Browser visual acceptance remains pending.

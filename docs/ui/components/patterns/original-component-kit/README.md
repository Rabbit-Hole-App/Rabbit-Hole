# Original blue and Claude-red kit

Stable ID: `patterns/original-component-kit` · Status: **flow reference / current shell**

[Open preview](preview.html) · [Markup](markup.html) · [Metadata](component.json) · [Original source](https://github.com/Rabbit-Hole-App/Rabbit-Hole/blob/ca0affecfb39caf6790f4b2636f1ed3c2dd90800/docs/features/explain-on-canvas/handoff/ui/templates/rabbit-hole-card-component-kit.html) · [Collection review](../../../REVIEW.md)

Owner-selected palette reference. Four cards and eleven controls; use current geometry and the balanced semantic role map when adopting. Attached copy matches apart from trailing whitespace. Updated to the shared warm card shell and visible card controls; archived source retains provenance.

Palette role: **balanced-card**. [Current blue/red balance](../../../foundations/PALETTE.md) supersedes the all-blue experiment controls in aa2cfb1. Flow previews use the current palette; linked archived sources preserve their original styling. Original shared CSS is retained for review; the explicit semantic overlay is `foundations/palette.css`.

## Edit and find

Edit `markup.html` and `component.json` here. Shared styles: `styles/original-kit.css`, `styles/review-corrections.css`. Behavior: `scripts/resize.js`, `scripts/original-kit.js`, `scripts/review-corrections.js`. Paths are relative to `docs/ui/`. Run `python docs/ui/scripts/build.py` from the repository root after editing. `preview.html`, this README, the index and registry are generated; do not edit those outputs directly.

Template dependencies: none.

## App mapping candidates

These are existing integration landmarks, not proof this reference is implemented. Resolve the latest integrated implementation before changing the app; the audit snapshot is `aa2cfb1`.

- No app mapping asserted; this is a reference/workflow asset.

## Acceptance and gaps

Review items: UI-11

Before app adoption: verify applicable default, hover, pressed, selected, focus, disabled, empty, loading and error states; keyboard interaction; long text; 320 px / 440 px / Focus layout; reduced motion for animated components. Not every state applies to every component. Static references do not prove selection wiring, persistence, source navigation or renderer registration. Browser visual acceptance remains pending.

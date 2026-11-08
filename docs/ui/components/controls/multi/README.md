# Independent multi-select

Stable ID: `controls/multi` · Status: **Renderer dependent**

[Open preview](preview.html) · [Markup](markup.html) · [Metadata](component.json) · [Original source](https://github.com/Rabbit-Hole-App/Rabbit-Hole/blob/aa2cfb19a2ca551f2c99aad5cbbacf968c7b9f56/docs/features/explain-on-canvas/handoff/ui/templates/rabbit-hole-card-component-kit.html) · [Collection review](../../../REVIEW.md)

Use when a learner can meaningfully combine options. Renderer registration and persistence are separate from this HTML demo.

Palette role: **experiment**. [Current blue/red balance](../../../foundations/PALETTE.md) supersedes the all-blue experiment controls in aa2cfb1. Historical previews preserve their original palette. Original shared CSS is retained for review; the explicit semantic overlay is `foundations/palette.css`.

## Edit and find

Edit `markup.html` and `component.json` here. Shared styles: `styles/control-kit.css`. Behavior: `scripts/control-kit.js`, `scripts/control-multi.js`. Paths are relative to `docs/ui/`. Run `python docs/ui/scripts/build.py` from the repository root after editing. `preview.html`, this README, the index and registry are generated; do not edit those outputs directly.

Template dependencies: `templates/kit/card-template.html`, `templates/kit/range-template.html`, `templates/kit/choice-template.html`, `templates/kit/option-template.html`, `templates/kit/button-template.html`, `templates/kit/timeline-template.html`, `templates/kit/select-template.html`, `templates/kit/toggle-template.html`, `templates/kit/stepper-template.html`, `templates/kit/index-template.html`, `templates/kit/disclosure-template.html`, `templates/kit/readout-template.html`, `templates/kit/sample-template.html`.

## App mapping candidates

These are existing integration landmarks, not proof this reference is implemented. Resolve the latest integrated implementation before changing the app; the audit snapshot is `aa2cfb1`.

- [packages/web/src/explain-program/ProgramScene.jsx](../../../../../packages/web/src/explain-program/ProgramScene.jsx)

## Acceptance and gaps

Review items: UI-07

Before app adoption: verify applicable default, hover, pressed, selected, focus, disabled, empty, loading and error states; keyboard interaction; long text; 320 px / 440 px / Focus layout; reduced motion for animated components. Not every state applies to every component. Static references do not prove selection wiring, persistence, source navigation or renderer registration. Browser visual acceptance remains pending.

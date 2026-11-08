# Timed toss

Stable ID: `cards/timed-toss` · Status: **reference**

[Open preview](preview.html) · [Markup](markup.html) · [Metadata](component.json) · [Original source](https://github.com/Rabbit-Hole-App/Rabbit-Hole/blob/aa2cfb19a2ca551f2c99aad5cbbacf968c7b9f56/docs/features/explain-on-canvas/handoff/ui/templates/rabbit-hole-card-component-kit.html) · [Collection review](../../../REVIEW.md)

Composed behavior example. Shared control source drift must be reconciled before app adoption. The organized preview composes these preserved kit slots into the shared resizable shell.

Palette role: **balanced-card**. [Current blue/red balance](../../../foundations/PALETTE.md) supersedes the all-blue experiment controls in aa2cfb1. Flow previews use the current palette; linked archived sources preserve their original styling. Original shared CSS is retained for review; the explicit semantic overlay is `foundations/palette.css`.

## Edit and find

Edit `markup.html` and `component.json` here. Shared styles: `styles/control-kit.css`, `styles/card-shell.css`, `styles/kit-shell.css`, `styles/review-corrections.css`. Behavior: `scripts/resize.js`, `scripts/control-kit.js`, `scripts/timed-toss.js`, `scripts/adopt-kit-shell.js`, `scripts/review-corrections.js`. Paths are relative to `docs/ui/`. Run `python docs/ui/scripts/build.py` from the repository root after editing. `preview.html`, this README, the index and registry are generated; do not edit those outputs directly.

Template dependencies: `templates/kit/card-template.html`, `templates/kit/range-template.html`, `templates/kit/choice-template.html`, `templates/kit/option-template.html`, `templates/kit/button-template.html`, `templates/kit/timeline-template.html`, `templates/kit/select-template.html`, `templates/kit/toggle-template.html`, `templates/kit/stepper-template.html`, `templates/kit/index-template.html`, `templates/kit/disclosure-template.html`, `templates/kit/readout-template.html`, `templates/kit/sample-template.html`.

## App mapping candidates

These are existing integration landmarks, not proof this reference is implemented. Resolve the latest integrated implementation before changing the app; the audit snapshot is `aa2cfb1`.

- [packages/web/src/LearningBlocks.jsx](../../../../../packages/web/src/LearningBlocks.jsx)
- [packages/web/src/explain-program/ProgramScene.jsx](../../../../../packages/web/src/explain-program/ProgramScene.jsx)

## Acceptance and gaps

Review items: UI-02, UI-03

Before app adoption: verify applicable default, hover, pressed, selected, focus, disabled, empty, loading and error states; keyboard interaction; long text; 320 px / 440 px / Focus layout; reduced motion for animated components. Not every state applies to every component. Static references do not prove selection wiring, persistence, source navigation or renderer registration. Browser visual acceptance remains pending.

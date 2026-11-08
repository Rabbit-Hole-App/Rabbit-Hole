# Loan Decision Tracer

Stable ID: `cards/decision-tracer` · Status: **reference**

[Open preview](preview.html) · [Markup](markup.html) · [Metadata](component.json) · [Original source](https://github.com/Rabbit-Hole-App/Rabbit-Hole/blob/aa2cfb19a2ca551f2c99aad5cbbacf968c7b9f56/docs/features/explain-on-canvas/handoff/ui/templates/rabbit-hole-resizable-card-shell.html) · [Collection review](../../../REVIEW.md)

Content-limited shared shell, pinned header, scroll body, SVG/raster examples. Applicant selector updates path and Why. The separate decision-tree-card-templates Library file is an alias of this source.

Palette role: **balanced-card**. [Current blue/red balance](../../../foundations/PALETTE.md) supersedes the all-blue experiment controls in aa2cfb1. Flow previews use the current palette; linked archived sources preserve their original styling. Original shared CSS is retained for review; the explicit semantic overlay is `foundations/palette.css`.

## Edit and find

Edit `markup.html` and `component.json` here. Shared styles: `styles/card-shell.css`, `styles/review-corrections.css`. Behavior: `scripts/resize.js`, `scripts/card-shell.js`, `scripts/decision-tracer.js`, `scripts/review-corrections.js`. Paths are relative to `docs/ui/`. Run `python docs/ui/scripts/build.py` from the repository root after editing. `preview.html`, this README, the index and registry are generated; do not edit those outputs directly.

Template dependencies: `templates/shell/card-shell.html`, `templates/shell/image-example.html`, `templates/shell/svg-example.html`, `templates/shell/applicant-control.html`.

## App mapping candidates

These are existing integration landmarks, not proof this reference is implemented. Resolve the latest integrated implementation before changing the app; the audit snapshot is `aa2cfb1`.

- [packages/web/src/LearningBlocks.jsx](../../../../../packages/web/src/LearningBlocks.jsx)
- [packages/web/src/explain-program/ProgramScene.jsx](../../../../../packages/web/src/explain-program/ProgramScene.jsx)

## Acceptance and gaps

Review items: UI-02, UI-08

Before app adoption: verify applicable default, hover, pressed, selected, focus, disabled, empty, loading and error states; keyboard interaction; long text; 320 px / 440 px / Focus layout; reduced motion for animated components. Not every state applies to every component. Static references do not prove selection wiring, persistence, source navigation or renderer registration. Browser visual acceptance remains pending.

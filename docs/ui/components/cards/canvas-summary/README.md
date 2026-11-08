# Canvas summary cards

Stable ID: `cards/canvas-summary` · Status: **Owner-reviewed HTML reference; browser verification and runtime integration pending**

[Open preview](preview.html) · [Markup](markup.html) · [Metadata](component.json) · [Original source](https://github.com/Rabbit-Hole-App/Rabbit-Hole/blob/chatgpt/tutor/docs/ui/CANVAS-CARD.md) · [Collection review](../../../REVIEW.md)

Four sizes; absent, short and long descriptions. Zero stars hide the count and divider; positive counts appear beside Star. See CANVAS-CARD.md for exact component mapping and demo boundaries.

Palette role: **shared**. [Current blue/red balance](../../../foundations/PALETTE.md) supersedes the all-blue experiment controls in aa2cfb1. Flow previews use the current palette; linked archived sources preserve their original styling. Original shared CSS is retained for review; the explicit semantic overlay is `foundations/palette.css`.

## Edit and find

Edit `markup.html` and `component.json` here. Shared styles: `styles/standards.css`, `styles/review-corrections.css`, `styles/canvas-card.css`. Behavior: `scripts/canvas-card.js`. Paths are relative to `docs/ui/`. Run `python docs/ui/scripts/build.py` from the repository root after editing. `preview.html`, this README, the index and registry are generated; do not edit those outputs directly.

Template dependencies: `templates/canvas-card-examples.html`, `templates/canvas-card.html`.

## App mapping candidates

These are existing integration landmarks, not proof this reference is implemented. Resolve the latest integrated implementation before changing the app; the audit snapshot is `aa2cfb1`.

- [packages/web/src/home/LearningCard.jsx](../../../../../packages/web/src/home/LearningCard.jsx)
- [packages/web/src/home/card-size.js](../../../../../packages/web/src/home/card-size.js)
- [packages/web/src/CardStar.jsx](../../../../../packages/web/src/CardStar.jsx)
- [packages/web/src/StarButton.jsx](../../../../../packages/web/src/StarButton.jsx)
- [packages/web/src/Home.jsx](../../../../../packages/web/src/Home.jsx)

## Acceptance and gaps

Review items: See the collection review and verification checklist.

Before app adoption: verify applicable default, hover, pressed, selected, focus, disabled, empty, loading and error states; keyboard interaction; long text; 320 px / 440 px / Focus layout; reduced motion for animated components. Not every state applies to every component. Static references do not prove selection wiring, persistence, source navigation or renderer registration. Browser visual acceptance remains pending.

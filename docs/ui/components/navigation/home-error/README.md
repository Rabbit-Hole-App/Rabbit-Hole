# Home · Load failure and retry

Stable ID: `navigation/home-error` · Status: **Draft for owner review; browser verification and app integration pending**

[Open preview](preview.html) · [Markup](markup.html) · [Metadata](component.json) · [Original source](https://github.com/Rabbit-Hole-App/Rabbit-Hole/blob/chatgpt/tutor/docs/ui/HOME.md) · [Collection review](../../../REVIEW.md)

Shared Home composition: deduplicated Continue/Recent; remembered card size; loading/error/empty; hover/focus Open and menu; local folder assignment. Cover and Share templates still missing. See HOME.md.

Palette role: **shared**. [Current blue/red balance](../../../foundations/PALETTE.md) supersedes the all-blue experiment controls in aa2cfb1. Flow previews use the current palette; linked archived sources preserve their original styling. Original shared CSS is retained for review; the explicit semantic overlay is `foundations/palette.css`.

## Edit and find

Edit `markup.html` and `component.json` here. Shared styles: `styles/standards.css`, `styles/review-corrections.css`, `styles/sidebar.css`, `styles/canvas-card.css`, `styles/source-picker.css`, `styles/start-rabbit-hole.css`, `styles/home.css`, `styles/folders.css`. Behavior: `scripts/home-mount.js`, `scripts/sidebar.js`, `scripts/sidebar-panels.js`, `scripts/source-widgets.js`, `scripts/resize.js`, `scripts/home-start.js`, `scripts/folders.js`, `scripts/home.js`. Paths are relative to `docs/ui/`. Run `python docs/ui/scripts/build.py` from the repository root after editing. `preview.html`, this README, the index and registry are generated; do not edit those outputs directly.

Template dependencies: `templates/home.html`, `templates/home-main.html`, `templates/home-overlays.html`, `templates/home-fixtures.html`, `templates/sidebar.html`, `templates/canvas-card.html`, `templates/start-rabbit-hole.html`, `templates/folder-overlays.html`.

## App mapping candidates

These are existing integration landmarks, not proof this reference is implemented. Resolve the latest integrated implementation before changing the app; the audit snapshot is `aa2cfb1`.

- [packages/web/src/Home.jsx](../../../../../packages/web/src/Home.jsx)
- [packages/web/src/home/CardSize.jsx](../../../../../packages/web/src/home/CardSize.jsx)
- [packages/web/src/home/LearningCard.jsx](../../../../../packages/web/src/home/LearningCard.jsx)
- [packages/web/src/home/CardMenu.jsx](../../../../../packages/web/src/home/CardMenu.jsx)
- [packages/web/src/home/card-menu-items.js](../../../../../packages/web/src/home/card-menu-items.js)
- [packages/web/src/CardStar.jsx](../../../../../packages/web/src/CardStar.jsx)
- [packages/web/src/Sidebar.jsx](../../../../../packages/web/src/Sidebar.jsx)
- [packages/web/src/StartDialog.jsx](../../../../../packages/web/src/StartDialog.jsx)

## Acceptance and gaps

Review items: See the collection review and verification checklist.

Before app adoption: verify applicable default, hover, pressed, selected, focus, disabled, empty, loading and error states; keyboard interaction; long text; 320 px / 440 px / Focus layout; reduced motion for animated components. Not every state applies to every component. Static references do not prove selection wiring, persistence, source navigation or renderer registration. Browser visual acceptance remains pending.

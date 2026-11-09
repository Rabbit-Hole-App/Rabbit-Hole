# Explore canvas search

Stable ID: `navigation/explore-canvas-search` · Status: **Draft for owner review. Browser verification and app integration pending**

[Open preview](preview.html) · [Markup](markup.html) · [Metadata](component.json) · [Original source](https://github.com/Rabbit-Hole-App/Rabbit-Hole/blob/chatgpt/tutor/docs/ui/EXPLORE.md) · [Collection review](../../../REVIEW.md)

Canvas search is focused with a matching public canvas. The weekly list returns when the query is cleared. See EXPLORE.md.

Palette role: **shared**. [Current blue/red balance](../../../foundations/PALETTE.md) supersedes the all-blue experiment controls in aa2cfb1. Flow previews use the current palette; linked archived sources preserve their original styling. Original shared CSS is retained for review; the explicit semantic overlay is `foundations/palette.css`.

## Edit and find

Edit `markup.html` and `component.json` here. Shared styles: `styles/standards.css`, `styles/review-corrections.css`, `styles/sidebar.css`, `styles/canvas-card.css`, `styles/home.css`, `styles/library.css`, `styles/explore.css`, `styles/creator-profile.css`. Behavior: `scripts/sidebar.js`, `scripts/sidebar-panels.js`, `scripts/public-browse.js`, `scripts/creator-profile.js`, `scripts/explore.js`. Paths are relative to `docs/ui/`. Run `python docs/ui/scripts/build.py` from the repository root after editing. `preview.html`, this README, the index and registry are generated; do not edit those outputs directly.

Template dependencies: `templates/explore.html`, `templates/sidebar.html`, `templates/home-fixtures.html`, `templates/public-canvas-card.html`, `templates/canvas-card.html`, `templates/creator-profile-view.html`.

## App mapping candidates

These are existing integration landmarks, not proof this reference is implemented. Resolve the latest integrated implementation before changing the app; the audit snapshot is `aa2cfb1`.

- [packages/web/src/Home.jsx](../../../../../packages/web/src/Home.jsx)
- [packages/web/src/Sidebar.jsx](../../../../../packages/web/src/Sidebar.jsx)
- [packages/web/src/LibraryViews.jsx](../../../../../packages/web/src/LibraryViews.jsx)
- [packages/web/src/library-filter.js](../../../../../packages/web/src/library-filter.js)
- [packages/web/src/home/LearningCard.jsx](../../../../../packages/web/src/home/LearningCard.jsx)
- [packages/web/src/home/PublicCards.jsx](../../../../../packages/web/src/home/PublicCards.jsx)
- [packages/web/src/home/WeeklyTop.jsx](../../../../../packages/web/src/home/WeeklyTop.jsx)
- [packages/web/src/home/weekly-top.js](../../../../../packages/web/src/home/weekly-top.js)
- [packages/web/src/home/card-sort.js](../../../../../packages/web/src/home/card-sort.js)
- [packages/web/src/home/CardSize.jsx](../../../../../packages/web/src/home/CardSize.jsx)
- [packages/web/src/home/card-size.js](../../../../../packages/web/src/home/card-size.js)
- [packages/web/src/CardStar.jsx](../../../../../packages/web/src/CardStar.jsx)
- [packages/web/src/ForkButton.jsx](../../../../../packages/web/src/ForkButton.jsx)
- [packages/web/src/RabbitHoleChoice.jsx](../../../../../packages/web/src/RabbitHoleChoice.jsx)
- [packages/web/src/Search.jsx](../../../../../packages/web/src/Search.jsx)
- [packages/web/src/home/explore-find.js](../../../../../packages/web/src/home/explore-find.js)

## Acceptance and gaps

Review items: See the collection review and verification checklist.

Before app adoption: verify applicable default, hover, pressed, selected, focus, disabled, empty, loading and error states; keyboard interaction; long text; 320 px / 440 px / Focus layout; reduced motion for animated components. Not every state applies to every component. Static references do not prove selection wiring, persistence, source navigation or renderer registration. Browser visual acceptance remains pending.

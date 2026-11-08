# Sidebar search

Stable ID: `navigation/sidebar-search` · Status: **Owner-reviewed reference / browser verification pending**

[Open preview](preview.html) · [Markup](markup.html) · [Metadata](component.json) · [Original source](https://github.com/Rabbit-Hole-App/Rabbit-Hole/blob/chatgpt/tutor/docs/ui/SIDEBAR.md) · [Collection review](../../../REVIEW.md)

Shared UI composition. See SIDEBAR.md for exact source mapping and demo boundaries. Panels use local sample data; no API or runtime integration.

Palette role: **shared**. [Current blue/red balance](../../../foundations/PALETTE.md) supersedes the all-blue experiment controls in aa2cfb1. Flow previews use the current palette; linked archived sources preserve their original styling. Original shared CSS is retained for review; the explicit semantic overlay is `foundations/palette.css`.

## Edit and find

Edit `markup.html` and `component.json` here. Shared styles: `styles/standards.css`, `styles/review-corrections.css`, `styles/sidebar.css`. Behavior: `scripts/sidebar.js`, `scripts/sidebar-panels.js`. Paths are relative to `docs/ui/`. Run `python docs/ui/scripts/build.py` from the repository root after editing. `preview.html`, this README, the index and registry are generated; do not edit those outputs directly.

Template dependencies: `templates/sidebar.html`, `templates/sidebar-shell.html`, `templates/sidebar-search.html`, `templates/sidebar-trash.html`, `templates/sidebar-notifications.html`, `templates/sidebar-feedback.html`.

## App mapping candidates

These are existing integration landmarks, not proof this reference is implemented. Resolve the latest integrated implementation before changing the app; the audit snapshot is `aa2cfb1`.

- [packages/web/src/Sidebar.jsx](../../../../../packages/web/src/Sidebar.jsx)
- [packages/web/src/Search.jsx](../../../../../packages/web/src/Search.jsx)
- [packages/web/src/FeedbackButton.jsx](../../../../../packages/web/src/FeedbackButton.jsx)

## Acceptance and gaps

Review items: See the collection review and verification checklist.

Before app adoption: verify applicable default, hover, pressed, selected, focus, disabled, empty, loading and error states; keyboard interaction; long text; 320 px / 440 px / Focus layout; reduced motion for animated components. Not every state applies to every component. Static references do not prove selection wiring, persistence, source navigation or renderer registration. Browser visual acceptance remains pending.

# Settings

Stable ID: `navigation/settings` · Status: **UI reference with async states / browser verification pending**

[Open preview](preview.html) · [Markup](markup.html) · [Metadata](component.json) · [Original source](https://github.com/Rabbit-Hole-App/Rabbit-Hole/blob/chatgpt/tutor/docs/ui/SETTINGS.md) · [Collection review](../../../REVIEW.md)

Shared primitives and palette; five current Settings panes. Includes failure/retry states and authoritative handle-save API adapter. Offline previews use fixtures; real runtime integration and browser verification remain pending. See SETTINGS.md.

Palette role: **shared**. [Current blue/red balance](../../../foundations/PALETTE.md) supersedes the all-blue experiment controls in aa2cfb1. Flow previews use the current palette; linked archived sources preserve their original styling. Original shared CSS is retained for review; the explicit semantic overlay is `foundations/palette.css`.

## Edit and find

Edit `markup.html` and `component.json` here. Shared styles: `styles/standards.css`, `styles/review-corrections.css`, `styles/settings.css`. Behavior: `scripts/settings-api.js`, `scripts/settings.js`. Paths are relative to `docs/ui/`. Run `python docs/ui/scripts/build.py` from the repository root after editing. `preview.html`, this README, the index and registry are generated; do not edit those outputs directly.

Template dependencies: `templates/settings.html`, `templates/settings-profile.html`, `templates/settings-appearance.html`, `templates/settings-learning.html`, `templates/settings-usage.html`, `templates/settings-privacy.html`, `templates/settings-purchase.html`.

## App mapping candidates

These are existing integration landmarks, not proof this reference is implemented. Resolve the latest integrated implementation before changing the app; the audit snapshot is `aa2cfb1`.

- [packages/web/src/RabbitHoleSettings.jsx](../../../../../packages/web/src/RabbitHoleSettings.jsx)
- [packages/web/src/settings-model.js](../../../../../packages/web/src/settings-model.js)
- [packages/web/src/UsageGauge.jsx](../../../../../packages/web/src/UsageGauge.jsx)
- [packages/web/src/BuyCreditsDialog.jsx](../../../../../packages/web/src/BuyCreditsDialog.jsx)
- [packages/web/src/session-display.js](../../../../../packages/web/src/session-display.js)
- [packages/control-plane/src/profile.js](../../../../../packages/control-plane/src/profile.js)

## Acceptance and gaps

Review items: See the collection review and verification checklist.

Before app adoption: verify applicable default, hover, pressed, selected, focus, disabled, empty, loading and error states; keyboard interaction; long text; 320 px / 440 px / Focus layout; reduced motion for animated components. Not every state applies to every component. Static references do not prove selection wiring, persistence, source navigation or renderer registration. Browser visual acceptance remains pending.

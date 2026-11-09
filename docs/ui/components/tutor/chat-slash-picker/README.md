# Slash commands

Stable ID: `tutor/chat-slash-picker` · Status: **reference**

[Open preview](preview.html) · [Markup](markup.html) · [Metadata](component.json) · [Original source](https://github.com/Rabbit-Hole-App/Rabbit-Hole/blob/3e06ad769bf950f1ba6de90587efe2e0e15748d2/packages/web/src/LearnSlash.jsx) · [Collection review](../../../REVIEW.md)

Commands is the picker heading. The shared pill and typed command sit in a fixed left column, with descriptions aligned beside them. The square-slash button opens the example prompts.

Palette role: **shared**. [Current blue/red balance](../../../foundations/PALETTE.md) supersedes the all-blue experiment controls in aa2cfb1. Flow previews use the current palette; linked archived sources preserve their original styling. Original shared CSS is retained for review; the explicit semantic overlay is `foundations/palette.css`.

## Edit and find

Edit `markup.html` and `component.json` here. Shared styles: `styles/standards.css`, `styles/source-headers.css`, `styles/review-corrections.css`, `styles/chat-slash-picker.css`. Behavior: `scripts/chat-slash-picker.js`. Paths are relative to `docs/ui/`. Run `python docs/ui/scripts/build.py` from the repository root after editing. `preview.html`, this README, the index and registry are generated; do not edit those outputs directly.

Template dependencies: `templates/chat-slash-picker.html`.

## App mapping candidates

These are existing integration landmarks, not proof this reference is implemented. Resolve the latest integrated implementation before changing the app; the audit snapshot is `aa2cfb1`.

- [packages/web/src/LearnSlash.jsx](../../../../../packages/web/src/LearnSlash.jsx)
- [packages/web/src/CommandList.jsx](../../../../../packages/web/src/CommandList.jsx)
- [packages/web/src/learn-slash.js](../../../../../packages/web/src/learn-slash.js)
- [packages/web/src/agent/slash.js](../../../../../packages/web/src/agent/slash.js)
- [packages/web/src/SlashCommandsSheet.jsx](../../../../../packages/web/src/SlashCommandsSheet.jsx)

## Acceptance and gaps

Review items: See the collection review and verification checklist.

Before app adoption: verify applicable default, hover, pressed, selected, focus, disabled, empty, loading and error states; keyboard interaction; long text; 320 px / 440 px / Focus layout; reduced motion for animated components. Not every state applies to every component. Static references do not prove selection wiring, persistence, source navigation or renderer registration. Browser visual acceptance remains pending.

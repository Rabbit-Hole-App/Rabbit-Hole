# Roadmap Flow

Stable ID: `patterns/roadmap-flow` · Status: **behavior reference / older styling**

[Open preview](preview.html) · [Markup](markup.html) · [Metadata](component.json) · [Original source](https://github.com/Rabbit-Hole-App/Rabbit-Hole/blob/aa2cfb19a2ca551f2c99aad5cbbacf968c7b9f56/docs/features/explain-on-canvas/handoff/ui/03-chat-roadmap.html) · [Collection review](../../../REVIEW.md)

Scope/depth/mode, edit restoration, accepted roadmap and chat/ToC transitions.

Palette role: **historical**. [Current blue/red balance](../../../foundations/PALETTE.md) supersedes the all-blue experiment controls in aa2cfb1. Historical previews preserve their original palette. Original shared CSS is retained for review; the explicit semantic overlay is `foundations/palette.css`.

## Edit and find

Edit `markup.html` and `component.json` here. Shared styles: `styles/legacy-roadmap-flow.css`. Behavior: `scripts/legacy-roadmap-flow-0.js`. Paths are relative to `docs/ui/`. Run `python docs/ui/scripts/build.py` from the repository root after editing. `preview.html`, this README, the index and registry are generated; do not edit those outputs directly.

Template dependencies: none.

## App mapping candidates

These are existing integration landmarks, not proof this reference is implemented. Resolve the latest integrated implementation before changing the app; the audit snapshot is `aa2cfb1`.

- [packages/web/src/RoadmapSurfaces.jsx](../../../../../packages/web/src/RoadmapSurfaces.jsx)
- [packages/web/src/TableOfContents.jsx](../../../../../packages/web/src/TableOfContents.jsx)

## Acceptance and gaps

Review items: See the collection review and verification checklist.

Before app adoption: verify applicable default, hover, pressed, selected, focus, disabled, empty, loading and error states; keyboard interaction; long text; 320 px / 440 px / Focus layout; reduced motion for animated components. Not every state applies to every component. Static references do not prove selection wiring, persistence, source navigation or renderer registration. Browser visual acceptance remains pending.

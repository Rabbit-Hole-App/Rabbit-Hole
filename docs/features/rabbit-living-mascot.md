# Living mascot and reversible portals — MVP

**Retired on 2026-09-24:** the user rejected the visual result and requested removal.
The landing no longer mounts the rabbit, A/B portals, controls or scroll timeline.
The pink cloud runs independently. Source artwork and experiments are retained as
history; this document describes the removed prototype, not the current landing.

Latest user direction (2026-09-23): finish one final hybrid-leg pass, then stop run
refinement. Candidate 07 does not clearly outperform Pass 04, so use the explicitly
authorized Pass 04 run temporarily. Preserve articulated 06/07 and the approved
motion architecture for later. No more run refinements without a new request.

## Deliverable

The user's location correction is explicit: **landing page only, remove it from
the app**. Mount in the existing `design/rabbit-hole-hero.html`, after the hero.
Blog, Features and Pricing now have their own `/blog`, `/features` and `/pricing`
pages, as explicitly requested. Their existing content and shared styling remain.
The former Mascot tabs and app component are removed. This
specific direction supersedes the generic app-tab delivery rule for this feature.
The dev clone serves that existing landing at `/`; app routes retain their original
UI. No separate demo, backend, persistence, model calls or new animation technology.
Living actions and portals are authorized; the earlier run-approval stop does not
block this milestone. No more run refinement.

The user also requested TypeSafe's exact pink cloud further down the page. Its
unaltered 1440×540, 110-frame GIF is copied locally as
`public/landing/typesafe-pink-cloud.gif`, below the mascot. Pause/reduced motion
shows unchanged decoded frame 60 as a PNG; Chrome's GIF-to-canvas first frame was
blank, so it is not used. Provenance and
SHA-256 are recorded in `design/typesafe-cloud-source.json`.

## Character

Front-facing presence and portal turning use the existing eight authored views.
The existing textured mesh renderer supplies the right-hand watch check and
living crouch. Dither stays in source UVs. No new character art or run pass.
Use authored opposite-side views, never a horizontal flip of the watch. Pass 04
is the temporary right-running clip; directional running beyond that remains an
art limitation and must be described honestly.

Actions: idle_breathe, idle_look_left, idle_look_right, idle_watch_check, crouch.
Transient actions settle to breathing. The character breathes at rest; pause and
reduced-motion controls stop autonomous motion. Gestures remain available at
either end of the scroll journey.

## Portal interaction

The latest requirement supersedes the earlier timed/floor-opening experiment:
**upright screen-facing holes, controlled by reversible page scroll**. A starts
upper-left; B starts lower-right. Objects carry normalized page centers and a
perpendicular `[0,0,1]` normal. Pointer dragging and arrow keys reposition either
opening. The same controller supports both directions and moving the destination
while hidden. Bounds keep the character visible and openings distinct.

The page's sticky region maps scroll distance to normalized progress. No timer
advances portal phases. Down advances A-to-B; up reads the same path backward,
with B-to-A entry/exit roles. Geometry and depth agree in both directions at each
progress, including a partial-scroll reversal. Facing alone settles through
authored views when direction reverses. Pausing freezes the pose; resuming catches
up to the page. Reduced motion shows a static front-facing resting destination.

| Forward progress | State |
| --- | --- |
| 0–.08 | front idle |
| .08–.18 | approach_portal |
| .18–.25 | turn_to_portal |
| .25–.30 | portal_crouch |
| .30–.45 | portal_enter |
| .45–.55 | portal_hidden / transfer |
| .55–.70 | portal_exit |
| .70–.75 | recover_from_portal |
| .75–.82 | turn_from_portal |
| .82–.92 | depart_portal |
| .92–1 | front idle at the other opening |

Entry turns away toward the page through three-quarter views. Exit faces the
viewer. Projected depth stays centered on the portal: no sideways sink or floor
drop. The renderer splits the character across the page plane, clips the recessed
part to the upright opening, draws the complete foreground rim, then draws the
part outside the page. Ears/head are last outside on entry and first outside on
exit. Perspective scale and foreshortening supplement the rim; global opacity
remains one. The full-opacity recessed part darkens with depth.

`paper-matte.js` reconstructs the white paper inside the source ink silhouette at
load, using a small mask closing and exterior flood, so transparent negative space
does not disappear on the dark interior. Original PNGs, dither and watch ownership
are unchanged. No horizontally mirrored views or newly generated strips.

## Verification

Deployed and exercised on session clone version
`450b3b20-64e0-45df-8462-93bd4c095b9e`. Seven controller tests and 16 real Chrome
scenarios passed. Screenshots confirm upright rims, back-facing entry after a
visible turn, front-facing emergence, lower-leg rim occlusion and a visible pink
cloud pause frame. Zero page errors or model calls. Final art approval is not claimed.

Seven controller tests cover both semantic paths, 1,001 progress samples of
reversal geometry, no elapsed-time completion, fixed portal-local depth anchors,
runtime placement, pause, reduced motion and living gestures. The deployed browser
scenario uses real wheel events down/up, reverses mid-entry and mid-exit, checks
held pixels at partial progress, visible paper/rim occlusion, relocated exits,
all living actions, cloud pixels, mobile and reduced motion, three separate public
pages, and absence of the mascot from both app interfaces. Evidence belongs in
`packages/web/design/rabbit-character/living-08/qa/scroll-portals/`.
Functional checks and screenshots are not final user approval of the art.

## Previous app placement — superseded 2026-09-23

The earlier app-only deployment was clone version
`339ab997-ea8e-477e-a401-52b0deea6cc5`. Both dev feature flags
are preserved. No shared dev/live promotion, schema changes, model calls or new
dependencies. The user's correction moves this work into the original landing page.

Six controller tests and eleven real Chrome scenarios passed. Evidence is in
`packages/web/design/rabbit-character/living-08/qa/browser-verification.json`:
all five actions, preserved app navigation, pointer/keyboard repositioning,
A-to-B and B-to-A traversal, moved exit while hidden, pause/reset, mobile and
reduced motion. Actual deployed screenshots show ears remaining above the rim
during entry and head/torso emerging with lower body hidden during exit. The
partial-entry capture pauses the real controller to avoid screenshot latency.
No browser page errors occurred.

Run: `node --test --test-isolation=none src/mascot/controller.test.mjs` from
`packages/web`. Deployed browser scenario: `node e2e/mascot-check.mjs`, with
`SMALL_ENV_FILE` pointing to the verified dev test-session environment and
optional `SMALL_BASE` selecting the session clone. Never print the session secret.

### Deliberate MVP art limits

- Pass 04 retains its known held-frame sliding; this milestone does not claim
  a locomotion fix. The final hybrid experiment is preserved in `hybrid-07/`.
- The scroll approach uses authored front/three-quarter standing views, not newly
  animated directional walking/running. Watch ownership is never mirrored.
- Turns use retained authored views; portal crouch is shallow procedural
  compression. These are MVP poses, not newly approved animation artwork.
- Openings move throughout the responsive page stage, within bounds that keep
  the rabbit visible and prevent overlap. They are not yet attached to arbitrary
  DOM elements or rotated screen planes. Transfer works in either direction.

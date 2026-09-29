# Features: abstract stair descent

The Features page uses procedural stair geometry with forest-green wireframe
edges and pixelated, dithered surfaces. Scrolling moves the viewpoint down
through flights that turn around an open shaft. The camera also turns gently,
while pale green `#d9e8c9` deepens toward forest green `#6a9479`. Reversing
scroll retraces the same view and color. Caption/body ink `#0b261b` maintains
at least 4.5:1 contrast throughout this tint range.
This is an art and motion study; existing feature copy remains below it.

The stairway constructs itself ahead of the camera: each tread extends from its
joining edge when scroll progress reaches it. Steps and landings complete in
order so each new tread connects to the preceding one. Geometry
beyond this frontier is absent rather than merely fading into view. Reverse
scroll retracts the same steps, and stopping scroll freezes construction.

Scope: `/features` only. Shared navigation, Blog, Pricing and the landing page
remain unchanged. There is no character, bitmap illustration, SVG route overlay
or playback control. Reduced motion uses a fixed representative view at 32%
progress with complete stairs and removes the extended scroll stage.

`src/landing/features-art.js` builds tread, riser, side and landing polygons,
projects them through a camera and draws them on a native 2D canvas. Faces
outside the view and back-facing surfaces are culled, then the remaining faces
are ordered by depth. A stationary screen-space dither pattern avoids moving
texture noise. The canvas uses a deliberately coarse buffer, capped at 960
pixels wide, with pixelated CSS scaling. No animation library or image is loaded.

One scheduled animation frame handles each scroll or resize update; there is no
perpetual animation loop. Scroll position directly sets camera depth, camera
angle, construction frontier and background opacity. A sticky viewport works on
desktop and mobile.
Canvas accessibility text describes the visual; navigation and feature content
remain native HTML. Only the Features entry imports this renderer and its CSS.

## Rejected raster exploration

The first bitmap labyrinth and overlaid coral route were rejected by the user
on 2026-09-24. They are not the current design. The original generated file is
retained at `design/mockups/rejected-features-labyrinth-v1.png`, outside the
public asset directory. Its generation prompt is retained below for history.

Asset dimensions: 1659 × 948; PNG, 2,763,817 bytes. SHA-256:
`5ee5c4822741046977c80055069137d7e1cb8de57ef31010b930b230cd568829`.

### Rejected generation prompt

Use case: stylized-concept. Asset type: original wide 16:9 editorial hero illustration for Rabbit Hole, an adaptive learning platform. Create an abstract impossible labyrinth inspired by M. C. Escher's spatial paradoxes and architectural lithographs, with an original composition rather than a reproduction of a particular artwork. One large sculptural maze of staircases, arched openings, thick folded architectural planes and interlocking elevated passages, seen in an elegant three-quarter isometric view. The stairs and channels branch into multiple possible routes and converge, a metaphor for following curiosity through knowledge. A very legible continuous broad main walkway enters at the bottom-left, climbs toward a central landing, branches, and continues through several arches toward the upper-right. Make this route coherent enough that a thin animated thread can later be overlaid by code; DO NOT draw any thread, colored route, arrows, or markings into the image. Deep forest-green ink shadows, soft jade and pale mint stone planes, warm cream highlights. Mature art-book screenprint / engraved lithograph style with fine stipple, subtle cross-hatching and paper grain. Strong shadow masses and crisp architectural edges, beautifully controlled fine detail, not glossy 3D, not a cute game map. Architecture fills about 80 percent of the wide composition with generous pale mint negative space at the outer edges, especially upper left. The object floats in a plain pale mint field, no landscape or horizon; it feels like an impossible carved world rather than a regular diagram. No text, typography, logos, UI, labels, people, rabbit mascot, animals, clouds, mountains, observatory, wireframe funnel, celestial objects, neon glow, or watermark. Final output a single polished 16:9 wide raster illustration, ideally 1792 by 1024 or similar wide format.

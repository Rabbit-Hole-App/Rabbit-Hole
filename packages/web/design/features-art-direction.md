# Features: abstract connections header

The Features page now uses a pale sage technical-print collage only behind the
existing heading and subtitle. Fine forest-green lines, connected nodes and
nested open frames suggest learning through linked ideas. The left half remains
quiet for the live heading; the more detailed construction sits on the right.
This is a distinct composition in the visual family of Blog and Pricing.
Both reference assets remain unchanged.

The feature walkthrough follows on a white page. Public navigation,
mobile menu, shared static footer and native scrolling remain intact. The image
is decorative, with empty alt text; all product text remains HTML. Responsive
object positioning prioritizes heading legibility on phones.

Asset: `public/landing/features-collage-v1.png`, 2172 × 724.
Exact prompt, style references and hash:
`design/manifesto-features-art-prompts.md`.

## Illustrative product walkthrough

The user approved staged demos while real product recordings are unavailable
(2026-09-29). Four eight-second HTML/SVG loops use the same attention example:
gather sources, ask a follow-up, explore a visual connection, and practice/save.
These are presentation-only fixtures: no ingestion, inference, submission,
storage, or integration. Each frame is labeled "Illustrative product preview";
the conceptual diagram contains no invented model measurements.

On desktop, a small preview stays beside the explanation while native scrolling
selects the nearest chapter. Two real preview cards peek behind the front card;
the next card comes forward while the outgoing one slips into the back. Position
and scale follow scroll progress directly over the middle third between chapter
centers, so partial scrolling and reversing retrace the same shuffle. The deck
holds still while its front demo plays, and playback pauses during the shuffle.
Reduced motion switches between still deck arrangements without interpolation.
On phones, the existing separate previews keep their static offset outlines.
A quiet dotted thread connects the four numbered steps. At 800px and below,
each explanation precedes its own preview in normal document flow. The header,
navigation, and footer are preserved. At the user's request, the three older
summary cards were removed after the walkthrough was reviewed.

`src/landing/features-demos.js` controls the active chapter and visibility;
`features-demos.css` supplies the staged loops. Only the active visible preview
animates, and inactive/hidden-page animations pause. Reduced motion presents
complete still frames. Decorative demo controls never receive focus or accept
input; accessible descriptions explain the preview. There are no playback
buttons or additional animation dependencies.

Validation covers forward/reverse scrolling, actual loop playback and pausing,
phone stacking, menu behavior, no clipped content or horizontal overflow,
reduced motion, and absence of API requests. Browser evidence is retained in
`tmp/features-demos/` locally.

## Stairway moved to Manifesto

At the user's request on 2026-09-29, the existing scroll-built wireframe stairs
moved from /features to /manifesto. See `src/landing/manifesto-stairs.js` and
`manifesto-stairs.css`. Geometry, camera motion, ordered step construction,
reverse-scroll behavior, green depth progression, coarse canvas and stationary
dither are preserved. Reduced motion retains the complete fixed view at 32%.
Features no longer loads this canvas or renderer.

Following the user's next review, Manifesto restyled that same geometry in
charcoal over ivory/stone and placed it behind its full essay. Features keeps
the green collage; the palette change applies only to Manifesto.

## Rejected raster exploration

The first bitmap labyrinth and overlaid coral route were rejected by the user
on 2026-09-24. They are not the current design. The original generated file is
retained at `design/mockups/rejected-features-labyrinth-v1.png`, outside the
public asset directory. Its generation prompt is retained below for history.

Asset dimensions: 1659 × 948; PNG, 2,763,817 bytes. SHA-256:
`5ee5c4822741046977c80055069137d7e1cb8de57ef31010b930b230cd568829`.

### Rejected generation prompt

Use case: stylized-concept. Asset type: original wide 16:9 editorial hero illustration for Rabbit Hole, an adaptive learning platform. Create an abstract impossible labyrinth inspired by M. C. Escher's spatial paradoxes and architectural lithographs, with an original composition rather than a reproduction of a particular artwork. One large sculptural maze of staircases, arched openings, thick folded architectural planes and interlocking elevated passages, seen in an elegant three-quarter isometric view. The stairs and channels branch into multiple possible routes and converge, a metaphor for following curiosity through knowledge. A very legible continuous broad main walkway enters at the bottom-left, climbs toward a central landing, branches, and continues through several arches toward the upper-right. Make this route coherent enough that a thin animated thread can later be overlaid by code; DO NOT draw any thread, colored route, arrows, or markings into the image. Deep forest-green ink shadows, soft jade and pale mint stone planes, warm cream highlights. Mature art-book screenprint / engraved lithograph style with fine stipple, subtle cross-hatching and paper grain. Strong shadow masses and crisp architectural edges, beautifully controlled fine detail, not glossy 3D, not a cute game map. Architecture fills about 80 percent of the wide composition with generous pale mint negative space at the outer edges, especially upper left. The object floats in a plain pale mint field, no landscape or horizon; it feels like an impossible carved world rather than a regular diagram. No text, typography, logos, UI, labels, people, rabbit mascot, animals, clouds, mountains, observatory, wireframe funnel, celestial objects, neon glow, or watermark. Final output a single polished 16:9 wide raster illustration, ideally 1792 by 1024 or similar wide format.

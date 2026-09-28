# Observatory artwork prompts

Generated 2026-09-24 with built-in image generation. Candidate artwork for the
landing page; no CLI or API-key image generation. Existing page artwork is
unchanged. The original mountain illustration supplied style and palette only.

## Base scene: `public/landing/observatory-v1.png`

Reference: `public/landing/blue-mountains-v1.png`.

```text
Use case: stylized-concept landscape artwork for a website.
Create ONE original panoramic image of a mountaintop astronomical observatory, artwork only, no typography or web UI. Wide 16:9 landscape.

The supplied mountain image is only a reference for the illustrated Japanese-animation background style and blue/pink color harmony. This is a NEW SCENE; do not edit or replace the supplied artwork.

SCENE AND COMPOSITION:
A small elegant ivory-white astronomical observatory stands on a dramatic cobalt-blue rocky summit in the lower RIGHT third. The dome has a believable narrow open slit and a modest visible telescope aimed at the sky. Architecture should be beautifully drawn, grounded and recognizable, with simple cylindrical walls, a tiny lit amber doorway and a short stone approach path. The building occupies about 18% of the total image width and the dome reaches just below the image's horizontal midpoint.
A dark indigo rock ridge and a winding stone stair/path cross the lower third, with layered blue mountains receding far below. A vast deep azure-to-indigo twilight sky occupies roughly the upper 60%. A large soft pale rose-pink moon hangs in the upper LEFT third, detailed enough to feel celestial but understated and painterly. A few tiny distant stars only, no bright starbursts.
Make the sky CLEAR and CLOUD-FREE, and leave air between the distant ridges. Clouds will be added as a separately animated transparent art layer. Do not bake a cloud bank into this background. Keep the bottommost 15% relatively dark and quiet to support a foreground mist layer later.

ART DIRECTION:
Hand-painted Japanese manga/anime scenic background, visible confident brushwork, sharply designed rock planes, glowing pink edges on a few snow ridges, rich atmospheric depth. Deep cobalt/cerulean blues dominate, with restrained pale pink and lavender light, cool indigo shadows. This should feel like a calm, wondrous place to explore the universe, sophisticated and expansive. Preserve the painterly style of the reference, not photorealistic rendering. Clear silhouettes, finely drawn architectural details, appealing composition at both desktop and mobile scale.

CONSTRAINTS:
No people, no rabbits or animals, no mascot, no text, no logo, no watermark, no UI, no border, no diagram, no science-fiction spaceships, no oversized city, no neon. No photographic CGI, no glossy 3D, no smooth generic vector art. The image must be a complete, opaque full-bleed scene with no transparent holes. Artwork remains visible throughout the eventual animation.
```

## Foreground mist: `public/landing/observatory-mist-v1.png`

Reference: the generated observatory base scene above.

```text
Use case: transparent illustrated animation layer.
Create ONE transparent PNG foreground cloud/mist layer to composite over the supplied blue mountaintop observatory illustration. The reference is only for matching its hand-painted Japanese-animation style, scale and twilight blue/pink palette. Do not reproduce the mountain, building, moon, sky or background.

OUTPUT: wide 16:9 transparent canvas, approximately 1672 x 941. Genuine alpha transparency, NOT a painted checkerboard, NOT white or black background.

Draw only a thin, beautiful, low bank of drifting alpine cloud wisps across the BOTTOM QUARTER of the canvas. The upper 70% of the canvas must be completely transparent. Several low airy overlapping cloud lobes should enter from the left and right bottom edges, with a thinner opening toward the lower center so some of the mountain trail can remain visible. The clouds stay low; none may reach the observatory's dome or cover the middle/upper image. Use softly painted dusty blue and lavender cloud shadows, a few pale rose-pink moonlit rims, feathery semitransparent outer edges, and visible delicate painterly texture. Light atmospheric mist, not a solid white opaque cloud wall. The clouds reach past both side edges and the bottom edge, so they can drift a little horizontally without revealing a cut edge.

This is a compositing asset, not a full scene. No mountains, no observatory, no moon, no stars, no horizon, no ground, no sky fill, no figures, no symbols, no typography, no border, no watermark. Preserve empty transparent space above the low cloud bank.
```

The base is opaque RGB. The foreground is RGBA with genuine transparency.
CSS composites the mist low in the scene, preserves its opacity, and moves it
horizontally in a continuous alternate loop. Five small CSS star highlights
shimmer over the existing sky. The building and landscape stay fixed.

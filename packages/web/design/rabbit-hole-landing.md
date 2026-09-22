# Rabbit Hole — landing page

Design exploration for the Rabbit Hole landing page. Open the HTML files directly
in a browser; they are standalone, like the other files in this folder.

- `rabbit-hole-hero.html` — the hero: a shaft you fall down. Motion only at this
  stage; there is deliberately no copy, nav, or button on the page yet.
- `headline-font-candidates.html` — six display faces set at size, for picking one.

Nothing here is wired into the app. The mount point is still undecided.

## Reference

The layout grid and type metrics were measured off `typesafe.ai` with the browser's
own `getComputedStyle`, not estimated from screenshots:

| | measured |
|---|---|
| viewport / body | 1536 / 1521 (15px scrollbar) |
| content frame | 1240px centred, crop marks at x140 and x1370 |
| display headline | 150px, line-height 120px (0.8) |
| section headline | 64px / 57.6px |
| body | 17px / 20.4px, letter-spacing 0.85px |
| micro labels | JetBrains Mono 300 at 10 / 12 / 13px |
| nav links | 18px / 18px, letter-spacing 0.54px, white chips |
| palette | `#FEFEFE` page, `#1E1E1E` ink |

A full-fidelity replica of their hero was built first as a fidelity test and diffed
pixel-by-pixel against the live site. Every box, border, and edge landed on the same
pixels; the only mismatches were glyph interiors (their display face, Die Grotesk C,
is commercially licensed) and their hero GIF. That replica is not kept here — only
the metrics it proved, which this page reuses.

## The hero

A polar tunnel drawn on a canvas. Depth is `z = SCALE / radius`, so the centre of the
frame is infinitely far away and goes black without any special case. Per-pixel depth,
angle, and light never change, so they are computed once into three `Float32Array`s;
each frame only samples the wall pattern at `(angle, z + t)`. The buffer is 760×380 and
upscaled with `image-rendering: pixelated`, which is what produces the 1-bit dither
grain — a 4×4 Bayer matrix quantising to three tones.

Two things move with the scrollbar, and they are deliberately driven differently:

- **The wall rushes** on `t`, a slow clock plus an *eased* scroll position, so the
  texture glides instead of snapping frame to frame.
- **The mouth opens** on the *raw* scroll position. Size has to answer the scrollbar
  1:1 — easing it makes the hole lag behind your own gesture. `open` falls from 1 to 0
  over `ENTER` px, scaling the light reaching the wall, so the black core grows outward
  until the screen is solid black and you are inside.

The canvas is `position: sticky` for the first ~780px of scroll, then releases.
`prefers-reduced-motion` freezes a single frame.

The mouth sits dead centre and stays circular in any window: `SQUASH` corrects `dy` by
the ratio between the buffer's aspect and the canvas's. `LIGHT` reaches the far corners
so the ripples run to every edge; the black core is far smaller than that and stays well
inside the frame. Both are recomputed on `resize` — precomputing them once at load makes
the rings go oval the moment the window changes shape.

The exponent on `sTab` sets how wide the core starts, independently of `LIGHT`: lower is
a tighter core. That is the knob for "bigger ripples, smaller hole".

Three bugs worth remembering, all caught by the self-check or by screenshotting:

- `overflow-x: hidden` on `<body>` makes it a scroll container and silently kills
  `position: sticky` on any descendant.
- Writing to `ImageData` at a half-pixel `x` lands mid-RGBA and paints a corrupted
  colour rather than dropping the pixel.
- Lighting the wall from *depth* rather than *radius* flattens the whole frame; the
  shaft became a pinhole with no gradient.

Load with `?selftest=1` for an assert panel: depth falls off with radius, depth clamps
at `ZFAR`, angle stays in 0..1, the core is darker than the rim, the mouth is circular
rather than oval, advancing `t` actually redraws the wall, and entering all the way
closes to solid black.

The circularity assert measures the core's radius along each axis and converts both to
screen pixels. Finding that edge needs care, and both naive versions gave false
failures on a hole that was actually round: stopping at the first light pixel ends the
walk early because the dither punches holes through the core (reported 1.287), and
counting every dark pixel on the ray overcounts the dark rings beyond the core
(reported 1.209). It now walks out to the first run of six consecutive light pixels.

## Decided

- Concept: the fall — looking down the shaft, scrolling takes you deeper.
- Headline text will be "Knowledge is infinite." It is not on the page yet; the hole
  is being tuned on its own first.
- Black core with the rings lit in light blue — `#BFE3F7` out at the edges, `#4FA3DC`
  through the middle. A warm-brown burrow and a magenta version were both tried first.
- The ring field bleeds off all four edges. Sizing the rim to the shorter axis kept the
  mouth fully visible but left wide white margins down the sides, which read worse.
- No news dialogs, no CTA row, no objects falling past the walls.
- The mouth is centred, circular, and fully visible — no clipping at any window size.
- Scrolling widens the mouth until the screen is solid black: you enter the hole.

## Open

- Display face for the headline — six candidates rendered in
  `headline-font-candidates.html`; currently Arial as a placeholder.
- The kicker line reads `<one-line pitch goes here>`; it needs the product's pitch.
- Where the page mounts: the worker root as a signed-out landing, or a route inside
  the existing app.

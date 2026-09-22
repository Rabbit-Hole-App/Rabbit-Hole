# Rabbit Hole — landing page

Design exploration for the Rabbit Hole landing page. Open the HTML files directly
in a browser; they are standalone, like the other files in this folder.

- `rabbit-hole-hero.html` — the hero: a shaft you fall down, with the title over it.
  No nav or buttons yet.
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

## Performance

The inner loop runs once per buffer pixel per frame, so everything in it is a lookup
or a multiply. A `Math.sin` for the rings plus a sin-based hash for the grain came to
roughly 600k `sin` calls a frame and pinned the main thread; both are tables now.
Pixels are written as one packed 32-bit store rather than four byte stores through a
helper, and the thresholds bucket out-of-range values so the per-pixel clamps are
gone. The buffer itself is the biggest lever — cost is quadratic in its dimensions,
and it is upscaled with `image-rendering: pixelated` anyway, so a small buffer is what
produces the grain in the first place. Measured 19.1ms → 11.4ms per frame, against a
16.7ms budget at 60fps.

Two things move with the scrollbar, and they are deliberately driven differently:

- **The wall rushes** on `t`, a slow clock plus an *eased* scroll position, so the
  texture glides instead of snapping frame to frame.
- **The mouth opens** on the *raw* scroll position. Size has to answer the scrollbar
  1:1 — easing it makes the hole lag behind your own gesture. `open` falls from 1 to 0
  over `ENTER` px, scaling the light reaching the wall, so the black core grows outward
  until the screen is solid black and you are inside.

The canvas is `position: sticky` over a track as tall as the page, so it stays put for
the whole descent. `prefers-reduced-motion` freezes a single frame.

## The title

"Knowledge is infinite." is a fixed object down in the shaft. It never moves; the
camera closes on it, so it grows, passes you, and is gone. Growth is
`1 / (1 - enter * 0.88)`, which accelerates the way an approach does.

Four details make that work, and each had an obvious-looking alternative that fails:

- It is pinned by writing `top = window.scrollY` from script. `position: fixed` and a
  `transform` both promote the element to its own compositing layer, and **a promoted
  layer cannot blend with the canvas beneath it** — the difference blend silently does
  nothing and you get white text on a white page.
- Neither the title nor the shaft track carries a `z-index`. Both have to sit in the
  root stacking context or, again, there is nothing for the blend to invert against.
- The dark-to-white grade is a radial gradient painted into the glyphs
  (`background-clip: text`), not a blend against the canvas. `mix-blend-mode:
  difference` was tried first and cannot reach white over a mid tone — `|255 - 72|`
  is 182, a muddy grey — so the centre is set explicitly instead. Dropping the blend
  also freed the title to use `transform` and `position: fixed`, which the blend had
  ruled out.
- Nothing about the title is driven from `requestAnimationFrame`. It is `position:
  fixed` so the browser pins it, and it scales through a scroll-driven CSS animation
  (`animation-timeline: scroll(root block)`), which runs on the compositor. Writing
  `top` or `transform` from rAF lands a frame *after* the scroll has happened, and
  that one-frame lag is exactly what reads as jiggling type.
- Overflow is clipped on the title wrapper rather than the body, because overflow on
  the body would make it a scroll container and break the sticky canvas.

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
rather than oval, advancing `t` redraws the wall, the core holds still while the rings
move through it, and entering all the way closes to solid black.

Every brightness comparison in those asserts uses luminance, never the red channel.
Red is not a stand-in for brightness across palettes: pink and magenta share red 255,
so a red-only diff reported no motion at all, and a mid-blue's red of 79 was counted
as part of the black core. Both produced failures on a render that was correct.

The circularity assert measures the core's radius along each axis and converts both to
screen pixels. Finding that edge needs care, and both naive versions gave false
failures on a hole that was actually round: stopping at the first light pixel ends the
walk early because the dither punches holes through the core (reported 1.287), and
counting every dark pixel on the ray overcounts the dark rings beyond the core
(reported 1.209). It now walks out to the first run of six consecutive light pixels.

## Decided

- Concept: the fall — looking down the shaft, scrolling takes you deeper.
- Headline: "Knowledge is infinite.", 190px, centred on the mouth.
- White page, grey ripples, black core. A warm-brown burrow, TypeSafe's magenta, and a
  light blue were all tried and dropped; only the ripples carry tone, the page stays
  white.
- The title holds still and stays readable at every depth via the difference blend.
- No news dialogs, no CTA row, no objects falling past the walls.
- The mouth is centred, circular, and fully visible — no clipping at any window size.
- Scrolling widens the mouth until the screen is solid black: you enter the hole.

## Open

- Display face for the headline — six candidates rendered in
  `headline-font-candidates.html`; currently Arial as a placeholder.
- The kicker line reads `<one-line pitch goes here>`; it needs the product's pitch.
- Where the page mounts: the worker root as a signed-out landing, or a route inside
  the existing app.

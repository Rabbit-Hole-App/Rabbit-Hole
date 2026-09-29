# Rabbit Hole — landing page

The rabbit and its portal interaction were removed at the user's request on
2026-09-24. The landing is served at the root of this worktree's dev clone:
https://small-cp-dev-smart-landing-page.zeroshothq.workers.dev/
Use Vite to serve/build the HTML. The landing no longer mounts or loads the mascot
renderer; it is also absent from the regular and repository app interfaces.
The hero, navigation and footer are preserved. Blog, Features and
Pricing retain their content and shared styles on `/blog`, `/features`, `/pricing`.
These are independent public HTML entries with direct navigation and reload.
The shared public-page stylesheet hides the browser scrollbar on the landing
page, Blog (including article readers), Features and Pricing. Native scrolling
remains enabled for wheel, touch and keyboard input. App scrollbars are unchanged.

The hero's track and spacer use one small viewport height plus 350px, matching
the point where the title finishes fading. It releases into a black manifesto
introduction: “Follow your curiosity.”, a short draft excerpt and a “Read more”
link to `/manifesto`. The cloud follows with its own title, “One question.
Endless paths.” This replaces the old empty black hold with readable content.
Reduced motion reserves only the static hero's viewport height.

A monochrome image of Plato, Socrates and Richard Feynman standing in discussion
now sits below that introduction, still on black. It is an imagined meeting;
the full image is shown without cropping on desktop and phones. Artwork and
prompt: `public/landing/thinkers-standing-v1.png` and `thinkers-standing-prompt.md`.

The cloud meets black through a static top mask and a brief pink, stippled haze.
Only opacity follows scroll progress, linearly over twice a responsive
56–144px blend band; scrolling back reverses it without a timer. No extra scroll
distance is added for this dissolve. The original animated GIF is preserved,
using a responsive crop behind the cloud title. Reduced motion shows the existing
still without haze or mask. The manifesto page reuses public navigation and the
simple content footer; its original draft copy and generated Socrates/Feynman/Plato
image are documented in [the manifesto spec](../../../docs/features/rabbit-hole-manifesto.md).

The pink cloud uses the original [TypeSafe](https://typesafe.ai/) artwork and
motion, with its white opening/closing holds and transition frames trimmed from
the timeline. `public/landing/typesafe-pink-cloud-loop.gif` loops the original
visible forward/back section (source frames 13–96) at its original timing. Its
first and last frames match, every exported frame matches the original artwork
pixel for pixel on the page's white background, and the loop lasts 6.72 seconds.
The original GIF remains unmodified. Reproduction and verification are in
`trim-cloud-loop.py` and `cloud-loop-verification.json`.

The generated center fill, permanent still base, CSS drift and blending were
rejected and removed. During normal playback only the trimmed original GIF is
visible. Reduced motion shows the original decoded frame 60. Playback controls
were removed at the user's request; the animation runs automatically.

An original blue mountain illustration is placed below the cloud for review:
`public/landing/blue-mountains-v1.png`. Its Japanese-animation palette and painted
mountain treatment were guided by [Multica](https://multica.ai/). The reference
image itself is not served. The mountain was produced with built-in image
generation; prompts are in `landing-art-prompts.md`. This pass adds artwork to
the existing page; copy and a broader layout redesign remain deferred.

The mountaintop observatory at `#observatory` is appended beneath the mountain
image. Its opaque painted scene stays fixed while a separate transparent mist
layer drifts across the foreground and five small star highlights shimmer.
The mist never fades away. Reduced-motion preference, offscreen visibility and
tab visibility control this scene's automatic motion; there is no playback button.
The existing hero, cloud, mountain and shared page styles are unchanged.
Artwork was produced with built-in image generation; prompts and file hashes
are in `observatory-prompts.md` and `observatory-assets.json`.

## FAQ and inward-flowing footer

The closing section is appended after the observatory. The FAQ uses a warm paper
background, left-aligned introduction and a separate column of rounded question
cards. The approved small tunnel symbol keeps its original geometry below the
introduction and remains visible beside the heading on mobile. This composition
replaces the earlier dark centered FAQ inspired by TypeSafe. Existing hero,
cloud, mountain, observatory, navigation, and separate content pages stay intact.

`#faq` is titled **Before you dive in.** Six native disclosures contain draft
adaptive-learning copy for later editorial review. The first answer starts open.
The landing module enhances mouse/touch toggles with interruptible 200 ms height
transitions; keyboard/reduced-motion toggles are immediate. Only one answer is
expanded at a time. Without JavaScript the native disclosure group still works.

The large stationary wordmark and original tagline overlay a generated 3D
wireframe funnel: sixteen travelling rings, twelve fixed connecting ribs, and
perspective projection. Each ring moves from the wide mouth toward the narrow
end over eight seconds; rings recycle gradually at the ends while a fixed mouth
outline stays visible. The tunnel also revolves slowly over 76 seconds, following
the user's last instruction to keep revolution and add depth. There is no whole
scene reset or blank interval. Canvas renders the vector geometry without
external animation embeds, images, model calls, or additional dependencies.
Depth shading keeps the lettering readable. Reduced motion freezes the
current shape; offscreen or hidden tabs suspend rendering. The footer retains
the copyright and adds links to the existing public pages, app entry and top.
Its motion is automatic with no play/pause control.

Implementation is scoped to `src/landing/footer.{js,css}` and the existing
landing HTML. FAQ disclosure/animation behavior uses the documented native
[details element](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/details)
and [Web Animations API](https://developer.mozilla.org/en-US/docs/Web/API/Element/animate).

## Features artwork

`/features` uses abstract stairs rendered as geometry, with wireframe edges and
dithered pixel surfaces. Scrolling moves the camera down through turning flights
around an open shaft and deepens pale green toward jade. Scrolling back retraces
the descent. Steps build ahead of the camera, extending from the preceding edge
as scroll advances and retracting on reversal. The stair viewport stays in view
on both desktop and mobile. Reduced motion shows complete stairs, fixes the
composition at 32% progress and removes the extended
scroll stage. There are no playback controls. Existing feature cards and
navigation remain.

Implementation: `src/landing/features-art.{js,css}` and the existing Features
HTML. The native Canvas 2D renderer uses no bitmap illustration or route overlay;
the prior generated labyrinth was rejected and archived outside public assets.
Rendering and archival details are in `features-art-direction.md`. Blog, Pricing
and the landing page remain unchanged by this correction.

## Blog artwork

`/blog` uses a static abstract technical-print collage behind the Blog label
and “Ideas, unfolded.” headline. The page, reading views and card surfaces
are white, with neutral grey card covers. The header itself uses a new colored
aqua, cobalt and teal atlas composition with grainy ink, numbered annotations
and dense diagrams at the right. The earlier white artwork was rejected.

The user requested removal of the paper animation and then the pink background.
There is no paper canvas, sticky stage or scroll-darkening controller.
Six existing article cards sit below the header and open their sample reading
views at `/blog?post=<slug>`. Story content, keyboard navigation, reader links,
responsive grids and the shared static footer remain.

Selected artwork: `public/landing/blog-atlas-v4.png`.
Placement: `src/landing/blog-art.css`; cards/readers: `blog-stories.{js,css}`.
See `blog-art-direction.md` and `blog-collage-{prompt.md,assets.json}`.
Features retains its green scroll descent and the landing art is unchanged.

## Pricing artwork

Current header (2026-09-28): an original pink, teal and grey technical print
collage is confined to the Pricing introduction, behind the live heading and
subtitle. The plan cards start below its edge. This replaces the active manga
header and removes its sky/bird module import; the earlier artwork and motion
source are retained for history. The main heading sizes and plan-card hover
feedback remain. The note below the cards reads “Early access is free. No
credit card required.” Generation prompt and provenance are in
`pricing-collage-prompt.md` and `pricing-collage-assets.json`. The selected v3
regeneration adds denser abstract wireframe/cutaway diagrams on the right,
following the user's refinement request. Package content is unchanged.

### Previous pricing artwork

The user rejected the key and butter-yellow palette on 2026-09-28. `/pricing`
is restored to the neutral white page with black text and the original plan
layout. The key canvas, animation import and dedicated artwork module/styles
are removed. The researched Free / Plus $19 / Pro $39 packages now replace the
old placeholder copy, with resources, services and benefits for each. Planned
credit allowances and a future Teams offer are explained below the cards. Paid
subscriptions are not implemented; card links open the existing `/apps` flow.
Plus uses **Start free trial** and opens the app without checkout. The existing
note below the cards clarifies that early access is free, no credit card is
required, and the displayed prices and allowances are planned for launch.
The requested Pro **Contact** action is pending a confirmed email or contact URL.
The introductory early-access notice was removed at the user's request;
the allowance explanation below the cards remains.
Shared navigation remains.
The desk drawings were rejected. Pricing now uses a new Japanese manga-style
blue valley and lake, taking the landing mountain image as a style/palette
reference. The scene fills the image behind the live cards, with no text or
diagrams baked in. Actual plan information and controls remain HTML. Blog stays
as-is, per the user's clarification.
The requested follow-up removes white brush/fog borders, CSS masks, mobile
dimming and the white backdrop behind Pricing. The full-color scene starts at
the page top behind navigation. A subsequent request restores only a gradual
bottom fade, adds drifting sky clouds and three distant birds, and matches the
Features title sizes. Mountains remain still. Motion pauses for reduced motion,
hidden tabs and when offscreen. Blog artwork remains unchanged.
The user rejected the pixel-art trial. The original painterly landscape, cloud
layer and mountain foreground are restored with smooth image rendering.
Typography, cloud/bird motion and the bottom fade remain unchanged.
Cards gain a soft iridescent highlight on hover or keyboard focus without moving
their content. Touch hover is disabled; reduced-motion feedback is immediate.
The current edit prompt is in `pricing-manga-clean-prompt.md`, based on
`pricing-manga-prompt.md`; earlier prompts remain in
`pricing-canvas-prompt.md`, `pricing-whiteboard-prompt.md` and `pricing-desk-prompt.md`.
Asset metadata is in `pricing-canvas-assets.json`.
Animation-layer prompts are in `pricing-motion-prompts.md` and the renderer is
`src/landing/pricing-art.{js,css}`. The full landscape is retained as a fallback.
Rejected pixel-art trial prompts are retained in `pricing-pixel-prompts.md`.
Credit rules use three unboxed rows with clear charging labels. The upcoming
Teams offer has its own restrained panel with price, minimum and benefits.
Blog, Features and Pricing share a simple static footer through
`src/landing/content-footer.js` and `.css`. The landing footer and its wireframe
animation remain exclusive to the landing page and are unchanged.
The rejected source is retained in `tmp/pricing-neutral/rejected-key.*`.
Landing, Features and Blog artwork are unchanged by this removal.

## Earlier design notes

- `rabbit-hole-hero.html` — the hero: a shaft you fall down, with the title over it.
  No nav or buttons yet.
- `headline-font-candidates.html` — six display faces set at size, for picking one.
- `rabbit-hole-mobile-check.html` — the hero in three 390×844 frames, so the phone
  layout can be seen without a device. Serve the folder over HTTP; the frames are
  same-origin and get scrolled from the parent.

The notes below describe the original exploration. The landing root above is now
the chosen mount; it deliberately does not appear as a tab inside the app.

## The page below the hole

Once the shaft lets go you scroll into Blog (a hover list), Features (three cards),
Pricing (three tiers, the middle one inverted), and a footer. A floating glass bar
arrives at that point and leaves again on the way back up.

The hero reserves its scroll with a `#spacer` in normal flow rather than a hard-coded
`body { height }`, and everything below simply flows. Adding a section then cannot
desync the page height from the shaft track, which is what the bar's trigger measures.

It is driven by a `scroll` listener, not the render loop. Toggling it inside
`requestAnimationFrame` looks equivalent but breaks twice: rAF is paused while a tab is
backgrounded, and it is switched off entirely under `prefers-reduced-motion`, so the bar
would simply never appear for those users. The listener toggles a class and CSS does the
transition, which keeps position work off the scroll path.

The bar is **solid white**, not glass. A translucent pill takes its tone from whatever
sits behind it, and this page spends half its scroll over a pitch-black hero, which
turned the bar grey. Two properties of `backdrop-filter` make it the wrong tool here:
it only reads as glass when something is passing underneath, and what it reads is
exactly what you cannot control.

The bar is **not** styled after the TypeSafe reference. That reference governs the hero's
grid and type metrics only; the chrome is its own thing — crisp `#0A0A0A` on white, Inter
for UI, a pill with a real shadow, and a solid CTA.

## Phones

The page had no `<meta name="viewport">` at all, so a phone rendered it at desktop
width and zoomed out — everything else here was moot until that was added.

Four things are handled specifically for small screens:

- **Height uses `svh`, not `vh`.** `vh` is the *largest* viewport, so with the URL bar
  showing, a `100vh` canvas hangs below the fold and the mouth sits off-centre.
- **The headline is sized from the viewport**, `min(190px, 14% of width)`. At a fixed
  190px, "Knowledge is" runs off a 390px screen.
- **`rebuild()` early-returns when the box has not changed.** Phones fire `resize` every
  time the URL bar slides, and that function is O(W·H).
- **The bar spans the width and drops its links** into a menu, keeping the brand and
  the CTA inline. A full nav does not fit legibly at 390px.

The menu is a hamburger that morphs into a close mark, opening a solid white sheet
under the bar. It closes on link tap, on `Escape`, on a tap anywhere outside, and —
the one that is easy to miss — whenever the bar itself leaves on scroll up, so the
sheet can never outlive the thing it hangs from. `aria-expanded` and `aria-controls`
are wired to the button.

## The rabbit

A dithered White Rabbit runs through the gap between Features and Pricing. It is not
drawn: it is `rabbit_1.jpg` (the user's reference image, shipped next to this page)
pushed through a pixel pipeline at load — crop to the figure, colour-key the
background, Bayer-dither to 1-bit, then keep only ink connected to the figure.

Hard-won specifics, all measured off the photo rather than eyeballed:

- Hand-drawn silhouettes (ellipse unions, then bezier outlines) were tried across many
  rounds and always read as "generic bunny". Sampling the reference ended that.
- The sky cannot be separated from white fur by luminance — they overlap. It is keyed
  by colour in two bands: pale-and-mildly-blue, and darker-but-strongly-blue. The
  figure's grey-blue shading slips between the bands.
- The cloud bank OVERLAPS the ears in x (cloud to photo 0.588, ears from 0.398), so
  every corner-box mask cut ear tips. Measurement showed the cloud is itself strongly
  blue, so the sky key handles it and no mask is needed at all.
- The crop is `{x 0.045, y 0.02, w 0.745, h 0.93}`: tighter bottoms sliced the
  trailing paw flat at photo y 0.87 (the foot runs to 0.92). The taller window pulls
  in the grass band, hence a green colour key.
- Cleanup keeps the largest 8-connected ink component after a 2px dilation — 1px
  bridges let the pass amputate sparse toe fragments, which read as clipped feet.
- White fur on white paper barely dithers, so the ear span and both paw tips get local
  coverage lifts; the near ear gets a second one.
- The face is deliberately untouched — painted eye/mouth marks were tried and merged
  with the photo's darks into a blotch.

### Original animation (superseded by the living mascot)

The pipeline is a sprite factory, not just a display. Pass 3 dithers the same coverage
three times with shifted Bayer phases: identical figure, different grain. Cycled at
8fps this is the "boil" of hand-drawn animation and costs no extra art. The three
frames are also baked side by side into `rabbit-sprite.png` (via `window.__bakeSheet()`
plus the dev server's PUT handler), so the rabbit is reusable anywhere as a plain
sprite sheet — `background-position` + `steps(3)`, no pipeline, no jpg.

Behaviours come from squash-and-stretch transforms on the `#hop` wrapper, not from
extra drawings: idle bob → crouch (compress into the ground) → jump (an arc with
stretch, occasionally a full spin) → landing squash. `transform-origin` is the ground
line, which is what makes scaling read as weight. Distinct true poses (a real crouch
drawing, stride frames) require more reference frames of the same character through
the factory. `prefers-reduced-motion` gets the static first frame, no behaviours.

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

**The title is drawn into the canvas, not laid over it in the DOM.** `drawTitle` fills
the two lines with `globalCompositeOperation: 'difference'` straight onto the buffer
after the wall. That single decision solves three separate problems at once:

- **The ripple pixels show inside the letters.** Differencing against the dithered wall
  means the glyphs are literally made of wall pixels. A DOM overlay — whether blended
  or gradient-filled — gives flat letters with no texture.
- **The centre resolves to a true white.** `difference` against the pitch-black core is
  `|255 - 0| = 255`. This is why `INK` must be `#000` and not `#1E1E1E`.
- **It cannot jiggle.** The text sits at a fixed point inside a canvas the browser pins
  with `position: sticky`, so only its scale changes per frame.

Three DOM approaches were tried first and each failed in its own way, which is worth
knowing before anyone reaches for one again:

- `mix-blend-mode: difference` on an overlay cannot reach white over a mid tone —
  `|255 - 72|` is 182, a muddy grey.
- The same blend silently does nothing at all if the element is promoted to its own
  compositing layer, which `position: fixed`, a `transform`, or `opacity` all do. That
  shows up as white text on a white page, not as an error.
- Pinning an overlay by writing `top` from `requestAnimationFrame` lands a frame *after*
  the scroll has happened, and that one-frame lag is exactly what reads as jiggle.

There are two surfaces, and the split matters. The wall is computed in a small
offscreen buffer — that low resolution *is* the dither grain, and cost is quadratic in
it. The visible canvas is the viewport in device pixels: the wall is blown up into it
with `imageSmoothingEnabled = false`, then the title is drawn on top at native size.
Drawing the type into the small buffer instead is what made the glyph edges blocky.

The texture lands only where the wall has texture, which is the middle of the line.
The outer letters sit over the flat white page, and `|255 - 254|` is black, so they
stay solid. That falls out of the method rather than needing a mask.

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

## Remaining design decisions

- Display face for the headline — six candidates rendered in
  `headline-font-candidates.html`; currently Arial as a placeholder.
- The kicker line reads `<one-line pitch goes here>`; it needs the product's pitch.
- The landing is now the dev worker root. Live promotion remains separate.

# Rabbit Hole mascot — the rabbit

What exists today, how it is produced, and what real character animation requires
next. The working artifact is [packages/web/design/rabbit-hole-hero.html](../../packages/web/design/rabbit-hole-hero.html);
deeper implementation notes live in
[packages/web/design/rabbit-hole-landing.md](../../packages/web/design/rabbit-hole-landing.md).

## What we did

A running rabbit, rendered in the page's 1-bit dither language, sits in the landing
page between Features and Pricing.

It is **not drawn**. Hand-drawn silhouettes were attempted repeatedly — ellipse
unions, then single bezier outlines — and always read as a generic bunny. The
approach that worked: the user supplies a reference image of the character
(`rabbit_1.jpg`, shipped next to the page) and the page pushes it through a pixel
pipeline at load:

1. **Crop** to the figure — `{x 0.045, y 0.02, w 0.745, h 0.93}`, every number
   measured off the photo. Tighter bottoms sliced the trailing paw flat; a tighter
   left cut the toes.
2. **Colour-key** the background. Sky and white fur overlap in luminance, so the sky
   is keyed by colour in two bands (pale-and-mildly-blue; darker-but-strongly-blue).
   The grass band is keyed green. No box masks: the cloud bank overlaps the ears in
   x, so every box mask cut ear tips — measurement showed the cloud is itself blue
   and the sky key already handles it.
3. **Bayer-dither** the remaining tone coverage to 1-bit, same 4×4 matrix as the
   hero shaft, so the rabbit belongs to the same world.
4. **Cleanup**: keep only ink 8-connected to the figure (2px bridge — 1px amputated
   sparse toe dither and read as clipped feet).
5. **Local lifts**: the ear span, the near ear again, and both paw tips get small
   coverage boosts, because white fur on white paper barely dithers. The face is
   untouched — painted features merged with the photo's darks into a blotch.

### Current animation (interim)

- **Boil**: the same coverage dithered three times with shifted Bayer phases,
  cycled at 8fps. The grain crawls like hand-drawn animation; costs no art.
- **Sprite sheet**: the three frames baked side by side into
  `packages/web/design/rabbit-sprite.png` (17KB, transparent background) — the
  rabbit is reusable anywhere as a plain sheet via `background-position` +
  `steps(3)`, no pipeline, no jpg.
- **Transform behaviours**: idle bob → crouch → jump (sometimes a spin) → landing,
  done with squash-and-stretch transforms on a wrapper.

**The transform behaviours are explicitly interim.** Squishing one bitmap is not a
crouch. They exist so the page has life today and get deleted when real frames
arrive.

## What real character animation needs

Real animation means each frame is a different drawing: legs reach and plant, the
spine folds and stretches, the head pitches, the ears drag one beat behind every
move, the watch swings on its chain. Nothing downstream can synthesise that from one
photo — the poses have to exist in the source frames.

### 1. Frames — the user is the source

Generate ~15 images of the same character, one per pose phase:

| cycle  | frames | what varies |
|--------|--------|-------------|
| run    | 6      | leg phases: contact, down, pass, up — side view, same direction |
| crouch | 2–3    | body folding, legs gathering under, ears coming back |
| jump   | 4      | anticipation, launch, apex, landing |
| idle   | 2–3    | breath, ear twitch |

Consistency rules, or the keys and registration break:

- same rabbit design in every frame — feed the existing `rabbit_1.jpg` as the image
  reference for every generation;
- same side-view orientation and direction;
- plain background, ideally the same blue sky (the colour keys are tuned to it);
- figure at the same scale and position; feet on one ground line;
- ≥ ~800px wide; PNG or JPG.

Expect to over-generate and discard off-model frames; cross-frame character
consistency is the hard part of this whole plan.

### 2. Factory — batch, register, sheet

Extend the existing pipeline to loop over the N frames and emit one registered
sprite sheet per cycle. New work is **registration**: align frames on the ink's
ground line / baseline so cycles do not jitter. Everything else (crop, keys, dither,
cleanup, lifts) is already solved and applies per frame. Per-frame crop overrides
may be needed where a pose extends further than the run pose does.

### 3. Playback — frames drive, transforms retire

Keep the state machine (idle → crouch → jump → land → run), but each state plays its
own real frames via `steps(N)` on its sheet. Delete the squash-and-stretch rig as a
pose source; at most a subtle landing-weight transform may remain as garnish on top
of real frames. `prefers-reduced-motion` keeps showing a single static frame.

### Open questions

- Does the rabbit travel (run across the section, or toward the hero and into the
  hole), or animate in place? Travel is where the mascot, the name, and the hero
  join up.
- Frame rate and sheet size budget: 6-frame run at 240px buffer ≈ 6× the current
  sheet; still tiny (<120KB), not a constraint yet.
- Whether the landing page keeps the runtime pipeline (factory stays live in the
  page) or switches to the baked sheets only, with the factory kept as a dev page.

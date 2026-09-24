# Rabbit Hole mascot — the rabbit

What exists today, how it is produced, and what real character animation requires
next. The working artifact is [packages/web/design/rabbit-hole-hero.html](../../packages/web/design/rabbit-hole-hero.html);
deeper implementation notes live in
[packages/web/design/rabbit-hole-landing.md](../../packages/web/design/rabbit-hole-landing.md).

## Current validation — 2026-09-23

**Removed from the landing page on 2026-09-24 at the user's request.** The mascot,
A/B portal interaction, controls and reserved scroll region are no longer mounted.
The hero and pink clouds remain; Blog, Features and Pricing keep their own pages.
The app interfaces also remain mascot-free. The experiments below are historical.

The latest user direction is the [living mascot MVP](rabbit-living-mascot.md):
breathing, left/right looks, a right-paw watch check, crouch, and reversible
scroll-controlled vertical screen portals on the existing Rabbit Hole landing
page after the hero. Blog, Features and Pricing now have separate pages.
The user's explicit correction removes all Mascot app tabs. A/B positions are movable;
entry and exit use rim occlusion with hidden transfer. Scroll down travels from
upper A to lower B; scroll up reverses the same normalized timeline, including
mid-transition reversals. The final
[hybrid 07 pass](../../packages/web/design/rabbit-character/hybrid-07/REVIEW.md)
does not clearly outperform Pass 04 visually. It is parked, and the user-authorized
Pass 04 is the temporary run. **No further run refinements without a new request.**
This overrides the earlier run-approval gate blocking living actions and portals;
it does not approve the failed skinning or freeze Character Bible v1.

### Earlier run experiments

The user approved [joint guide 04](rabbit-run-joint-guide.md) as the motion basis.
The user rejected pass 05's deformed raster legs and authorized a continuous rig.
The latest [articulated run experiment](../../packages/web/design/rabbit-character/articulated-06/REVIEW.md)
evaluates the fixed guide at render frequency, skins connected meshes and anchors
support toes in world space. Actual Chrome ground-edge drift is 1–2 display px
at the common test speed, substantially reduced. However, tucked ankle contours
remain pinched: **the skinning quality gate fails**. Custom refinement stops at
the requested fallback gate, with dedicated skeletal authoring recommended.
No further sprite strip or tool migration was made. The seed, refined proportions
and eight standing views are unchanged. Character Bible v1 remains pending run
approval. The living/portal milestone above now proceeds under the user's newer
explicit authorization.

The existing candidate eight-frame `run_right`, a canonical proportion sheet, and
eight authored viewing directions now live in
[packages/web/design/rabbit-character/](../../packages/web/design/rabbit-character/).
The seed is extracted from the shipped sprite; the action is generated together,
then registered and processed into the same 1-bit dither. GIF and WebP previews,
individual frames, source sheets, and comparisons are included. They await the
user's visual approval. Pass 04 and the living rig now replace the old landing-page
bitmap transform behavior under the user's explicit MVP authorization.
The earlier candidates are preserved for old/new comparison. Prior refinement 03
trims coat/hip volume, improves the connected arm arcs and torso contribution,
and tests the strip against continuous horizontal world movement. Pose-to-pose
support alignment improves, but held-frame foot sliding remains visible; the
character bible is still unapproved. See the [proportion contract](rabbit-character-proportions.md).

See [run validation and evidence](rabbit-hole-run-preview.md) and
[direction, turning, and planned portal traversal](rabbit-hole-directions-and-portals.md).
The latter includes explicit opposite-side artwork, a four-view approval gate,
movement-vector-based facing, authored turns, and a later crouch/entry/exit proof
using real rim occlusion. The current MVP uses the existing web renderer and a
dedicated portal controller; Phaser gameplay remains outside this milestone.

The original frame-by-frame proposal below records the earlier plan. The current
validation supersedes it with coherent action generation from the canonical
reference, an eight-frame run, and a turnaround before further directional strips.

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

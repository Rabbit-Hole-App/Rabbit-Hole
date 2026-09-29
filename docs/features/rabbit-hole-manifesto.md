# Rabbit Hole manifesto

## Current scope

The landing page continues the opening tunnel's black background into a readable
manifesto introduction. It contains a large “Follow your curiosity.” heading,
one short paragraph, and a “Read more” link. The black section ends with a clean
cut into an empty white section, reserved for future content. This section is
55svh tall, bounded to 320–640px. The pink cloud animation follows it, with its
own heading: “One question. Endless paths.” No rabbit mascot is added.

There is no gradient mask, haze or scroll-opacity reveal at this boundary.
The original cloud GIF stays visible at full opacity; reduced motion uses the
existing static cloud. Wheel and touch scrolling remain native and scrollbars
stay hidden.

## Dedicated page

`/manifesto` is a public dev HTML entry, with direct navigation and reload, using
the existing public navigation, mobile menu, fonts and static content footer.
It introduces Rabbit Hole's adaptive-learning mission through four draft ideas:
start with a question, adapt to the learner, make understanding active, and leave
a trail to return to. Copy is an original draft approved for use pending editing;
it makes no historical quotations or promises about shipped product features.

The reference https://typesafe.ai/manifesto informed the long-form editorial
format: an oversized title, narrow reading columns, small section labels, an
image beside prose, and a large closing statement. Rabbit Hole's copy and
composition are its own. Existing draft text is retained.

Following a specific request for the reference's vertical rules and red
highlights, the opening and four prose blocks have full-height left rules.
Five phrases from the existing draft are marked in brick red `#b4423b` with
light text `#fff8f1`. Inline marks wrap normally, with cloned decoration on
each line. No reference prose is copied.

The scroll-built wireframe stairway, moved from Features, now sits behind the
entire essay. It has no separate scroll stage: the article's actual height
supplies the animation progress. All text remains native selectable HTML above
the decorative canvas. No content is revealed or hidden by the animation.

The user rejected the green palette and authorized choosing a replacement.
Warm ivory `#f9f7f2` deepens subtly toward stone `#e5dfd6`, with charcoal body
ink `#27241f` and muted gray stair ink. Canvas opacity is 34% on desktop and 25%
on phones to keep prose legible. Its geometry, camera path, ordered construction,
reversible progress and stationary dither remain. Only /manifesto imports
`src/landing/manifesto-stairs.js` and its CSS. Reduced motion displays complete
stairs at a fixed 32% view behind the same article layout.

The canvas and article share one grid area. This replaces the negative bottom
margin that let the sticky canvas extend into the footer on short phone
viewports. `overflow: clip` at the article boundary contains the artwork without
creating a scrolling ancestor that would break sticky positioning. The footer
is outside this layer and keeps its existing opaque background.

Features now has a distinct generated abstract green collage behind its heading
and subtitle, in the visual family of the Blog and Pricing headers. Existing
feature cards and copy follow on white. See `packages/web/design/features-art-direction.md`.

## Image

The landing page additionally displays a new standing group below the manifesto
copy, on black: `packages/web/public/landing/thinkers-standing-v3.png` (1536 × 1024).
Socrates and Richard Feynman stand in discussion, left to right. The full
image is retained on phones, with a small caption identifying the imagined
conversation. At the user's request, Plato was removed from both the standing
and seated images using built-in image generation. Following feedback on the
removal-only v2, both compositions were regenerated with a centered pair and
mutual eye contact while retaining their identities, clothing and monochrome
photographic treatment. Original v1 assets and intermediate v2 edits remain
available. Current prompts and provenance:
`packages/web/design/thinkers-centered-prompt.md`.

- Current /manifesto images: `packages/web/public/landing/manifesto-socrates-v2.png`
  and `manifesto-feynman-v2.png`, each 1086 × 1448 with actual alpha transparency.
- Brand-new compositions generated with the built-in tool without reference
  images. The user rejected v1's resemblance to the landing-page poses.
- Socrates rests a finger at his chin in thought. Feynman, in a dark sweater,
  sketches an idea in a notebook. Their actions, viewing angles and framing are
  distinct from the landing page's standing discussion.
- Transparent surrounds, generated stipple, multiply blending and a gentle lower
  CSS alpha mask let the page show through without a rectangular photograph.
- Each caption identifies the portrait as imagined. Mobile stacks the figure
  and passage with no cropping of faces or hands.
- Current prompts, references and hashes:
  `packages/web/design/manifesto-distinct-portraits-prompts.md`.
- The rejected blackboard scene and earlier seated image remain as unused
  historical assets. The approved landing-page image is unchanged.

## Verification

Check the deployed landing intro, sharp black-to-white cut, empty white space,
cloud playback, desktop/phone layouts and reduced motion. Follow
“Read more” using pointer, keyboard and touch; verify `/manifesto`, trailing
slash, direct reload, generated image, mobile navigation and return link.
Verify stair construction forward, reverse and while stationary, the sticky
background behind the text, complete reduced-motion view, neutral palette,
two transparent portraits and editorial reading layout. On
short phones and desktops, compare footer pixels with the staircase visible
versus hidden; they must be identical. Check wrapping/contrast of red highlights
and full-height section rules. On
Features verify the new header asset, preserved cards, white body, and absence
of the old canvas/renderer. Keep Blog/Pricing art and landing imagery unchanged.
Build and deploy only to the `smart-landing-page` session clone. Record version
and browser evidence in `docs/features/coaching.md`.

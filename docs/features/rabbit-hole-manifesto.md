# Rabbit Hole manifesto

## Current scope

The landing page continues the opening tunnel's black background into a readable
manifesto introduction. It contains a large “Follow your curiosity.” heading,
one short paragraph, and a “Read more” link. The following pink cloud animation
has its own heading: “One question. Endless paths.” No rabbit mascot is added.

The transition softens black into the existing cloud GIF with a static gradient
mask, pink haze and a 3px dotted pattern. Image/haze opacity comes directly from
scroll position over a 112–288px interval; no autoplay timeline, additional scroll
track or new animation library is involved. Reversing or jumping scroll position
retargets immediately. Reduced motion uses the existing static cloud, without
the haze/mask. Wheel and touch scrolling remain native and scrollbars stay hidden.

## Dedicated page

`/manifesto` is a public dev HTML entry, with direct navigation and reload, using
the existing public navigation, mobile menu, fonts and static content footer.
It introduces Rabbit Hole's adaptive-learning mission through four draft ideas:
start with a question, adapt to the learner, make understanding active, and leave
a trail to return to. Copy is an original draft approved for use pending editing;
it makes no historical quotations or promises about shipped product features.

The reference https://typesafe.ai/manifesto informed the long-form editorial
format. Rabbit Hole's copy and composition are its own.

## Image

The landing page additionally displays a new standing group below the manifesto
copy, on black: `packages/web/public/landing/thinkers-standing-v1.png` (1536 × 1024).
Plato, Socrates and Richard Feynman stand in discussion, left to right. The full
image is retained on phones, with a small caption identifying the imagined
conversation. Prompt/provenance: `packages/web/design/thinkers-standing-prompt.md`.
The seated image on the dedicated manifesto page remains unchanged.

- `packages/web/public/landing/manifesto-conversation-v1.png`, 1774 × 887.
- Generated using the built-in `image_gen` tool; no API-key model call.
- Left to right: Socrates, Richard Feynman, Plato discussing an open book and
  teaching ideas in a fictional, aged black-and-white photographic composition.
- The caption identifies it as an imagined conversation, not a historical photo.
- The full rectangular image is retained on mobile so no participant is cropped.
- Exact prompt and provenance: `packages/web/design/manifesto-image-prompt.md`.

## Verification

Check the deployed landing intro, both directions through the cloud dissolve,
mid-transition reversal, desktop/phone layouts and reduced motion. Follow
“Read more” using pointer, keyboard and touch; verify `/manifesto`, trailing
slash, direct reload, generated image, mobile navigation and return link.
Build and deploy only to the `smart-landing-page` session clone. Record version
and browser evidence in `docs/features/coaching.md`.

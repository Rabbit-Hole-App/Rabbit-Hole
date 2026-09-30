# Landing clarity, adaptive example and footer action

Current direction (2026-09-29): the user requested removing the opening product
description. Keep the original headline/animation, adaptive example and footer
action. The user then reordered the content after the manifesto: Learning, at
your pace → pink cloud → What is Rabbit Hole? → Who is it for? → FAQ. The scope
and delivery record below describe the initial pass.

The user selected the proposed improvements in this order: clearer opening
product copy, the adaptive demo, then a footer call to action. This is a landing
page UI milestone. Preserve the approved artwork, animations, audience section,
overview window and FAQ. No new image generation, AI requests or backend work.

1. Add “An adaptive learning workspace for code, papers, and ideas.” near the
   opening Knowledge is infinite headline, readable on desktop and phones.
2. Fill the reserved white block after the pink clouds with one interactive
   illustrative example. Start simple, Show visually and Go deeper change the
   explanation of the same attention/context question. Persistent word cards
   move between arrangements, while supporting prose, connections and a
   technical formula change. Pointer interaction animates; keyboard and reduced
   motion changes are immediate. The canvas remains a stable height.
3. Add Start exploring to the existing animated footer, linking to the existing
   `/sign-up` preview. Keep all current footer links and animation.

## Validation

Test the initial hero line, scrolling away/back, all three demo modes, rapid
reversal, native keyboard controls, reduced motion, resizing and phone layouts.
Check text/diagram containment, no layout jump, retained original artwork and
existing section behavior. Verify the footer CTA reaches the actual sign-up UI
without submitting anything. Build and deploy only the worktree clone, then
exercise the same scenarios on the deployed page.

## Delivered — 2026-09-29

The new `#adaptive-learning` section fills the reserved white interlude. All
three modes use one shared diagram and persistent word cards; CSS transforms
move them between arrangements. Overlapping grid areas reserve the longest
explanation's height without exposing inactive copy or its link to navigation.
The example is explicitly illustrative. Its technical explanation references
[Attention Is All You Need](https://arxiv.org/abs/1706.03762); connections do not
claim measured attention weights.

The opening product line uses a quiet white backing for contrast against the
moving dither and releases as the visitor scrolls. The existing animated footer
now includes a keyboard-accessible Start exploring link to `/sign-up`.

Dev build passed with both preview flags and the existing license. Deployed
only to `small-cp-dev-smart-landing-page`, version
`e486879f-e6bf-4d4b-8f59-ba82672d1d6b`. Local browser checks passed 113 assertions;
the deployed pass passed 114, including navigation to the actual sign-up UI.
Six viewport sizes cover 320–1440px and landscape. Verified all modes, stable
height, containment, rapid reversal, keyboard navigation/focus, reduced motion,
native scroll, preserved assets and overview controls, and the flush FAQ join.
No browser errors or API/model calls. Deployed desktop and mobile screenshots
were visually inspected. Evidence: `tmp/landing-adaptive/deployed/results.json`
and screenshots in that directory. Signup submission/backend remains outside
this UI milestone.

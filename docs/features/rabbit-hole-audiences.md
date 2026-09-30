# Landing page: Who is it for?

The user rejected the generated six-column illustration and approved a single
large workflow preview with six audiences shown sequentially. Implement this
inside the existing landing page, between the black manifesto and pink clouds.
No generated art or real canvas capture is required yet. Preserve all other
landing sections and the Pro Contact CTA.

## Content and UI

One audience, one benefit, one example question and one neutral HTML canvas
placeholder are visible at rest. The audience order is creators/writers, AI/ML
engineers, educators, university students, enterprise onboarding, interview prep.
The placeholder label is explicit; no product interactions or backend calls are
implied. Real workflow captures will replace the placeholder interior later.

The shared frame has a chapter counter, progress line, native audience selector,
and previous/next controls. The final next action moves to the cloud section.
Existing Space Grotesk, Inter and the Rabbit Hole mark are reused.

## Motion and navigation

- Desktop with sufficient height: 3.2 viewport-height section, sticky preview,
  six equal scroll chapters, reversible when scrolling upward. Wheel/touch
  scrolling is never intercepted. Direct selection jumps to its chapter.
- Compact/short viewports: one story, manual selection and horizontal touch
  swipes. Vertical page scroll remains native; arrows are a swipe alternative.
- Only opacity/transform animate, using the existing ease-out token. Quick
  selection changes can interrupt transitions. No perpetual animation or timer.
- Reduced motion switches immediately. Inactive slides are inert and hidden
  from assistive technology. Manual changes announce the selected audience;
  passive scroll does not produce repeated live announcements.

## Verification

Exercise all six scroll states down/up, native dropdown jumps, arrows, mobile
swipes and vertical scrolling, reduced motion, short viewports and deep linking
to `/#who-is-it-for`. Confirm the stage releases before the clouds, no horizontal
overflow, one active story, no generated-image references and no API calls.
Build with both dev flags and deploy only the worktree clone; record deployed
evidence in Coaching's release history.

Delivered 2026-09-29 to the worktree preview, version
`e188d01c-8487-42b7-9089-6513c8737baf`. All 162 local and 162 deployed browser
checks passed across seven viewport sizes (320–1440px), including real wheel and
touch input, forward/reverse selection, short viewports and reduced motion.
Desktop/mobile screenshots were visually inspected. No browser errors or API
calls. Evidence: `tmp/audience-section/deployed-live/results.json`.

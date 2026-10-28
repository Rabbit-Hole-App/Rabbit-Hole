# Landing page: Who is it for?

The user rejected the generated six-column illustration and approved a single
large workflow preview with six audiences shown sequentially. Implement this
inside the existing landing page. The current approved order places it after
What is Rabbit Hole? and immediately before the FAQ.
No generated art or real canvas capture is required yet. Preserve all other
landing sections and the Pro Contact CTA.

## Content and UI

One audience, one benefit, one example question and one neutral HTML canvas
placeholder are visible at rest. The audience order is creators/writers, AI/ML
engineers, educators, university students, enterprise onboarding, interview prep.
The placeholder label is explicit; no product interactions or backend calls are
implied. Real workflow captures will replace the placeholder interior later.

The shared frame has a chapter counter, progress line, native audience selector,
and previous/next controls. The final next action moves to the FAQ section.
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
to `/#who-is-it-for`. Confirm the stage releases before the FAQ, no horizontal
overflow, one active story, no generated-image references and no API calls.
Build with both dev flags and deploy only the worktree clone; record deployed
evidence in Coaching's release history.

Delivered 2026-09-29 to the worktree preview, version
`e188d01c-8487-42b7-9089-6513c8737baf`. All 162 local and 162 deployed browser
checks passed across seven viewport sizes (320–1440px), including real wheel and
touch input, forward/reverse selection, short viewports and reduced motion.
Desktop/mobile screenshots were visually inspected. No browser errors or API
calls. Evidence: `tmp/audience-section/deployed-live/results.json`.

## Real-capture views (2026-10-28, landing-audiences preview)

University students, AI / ML engineers, Interview preparation and Educators (the audiences with a `kind` in
`packages/web/src/landing/audiences.js`) replace the placeholder with still captures of Rabbit Hole's own cards
(`public/landing/audience-*-v1.webp`, plus `-phone-v1.webp` crops served below 700px). Creators & writers and
Enterprise onboarding keep the placeholder. Brief: C:/s/spec/landing-audiences/BRIEF.md.

- Captures are the real product components (companion PDF reader with its real Highlight, `repo-code` code card,
  explain-back card, static Explanation card) rendered from the built app with every `/api` answered by a local
  harness; no model call. Source PDFs, scene, stub, capture and optimise scripts, and notes live in
  `C:/s/spec/landing-audiences/` (`capture/`, `NOTES.md`). All words around the captures are HTML.
- Layouts: `[data-layout]` on the slide and on `#who-is-it-for` (`university`, `ml`, `interview`, `educators`,
  `placeholder`). Pink highlights and connectors on the AI / ML scene are decoration (`aria-hidden`).
- Pinned scrolling now needs a viewport at least 880px tall (was 760px) because these layouts need about 590px of
  slide area; shorter screens use the manual selector, arrows and swipe. In manual mode the four views take their
  natural height. The code card pans sideways on a phone and is excluded from the swipe gesture.

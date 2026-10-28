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

## Content creators (2026-10-28)

Replaces the Creators & writers view (Enterprise onboarding keeps its placeholder). Layout `creators`: a neutral example post (landing HTML,
no brand; its picture is an original synthetic spectrogram, `audience-creators-post-v1.webp`), the real shared canvas page `/e/<token>` (header
with @handle, Star, Fork and the Comments panel), a reader's fork card from the Library ("Forked from ...") and the creator's own profile card
(Star count, "1 fork"). Phone crops: `audience-creators-canvas-phone-v1.webp`, `-comment-phone-v1.webp`.

Capabilities checked in code before capture: shared page, public comments, Star, Fork with fork provenance, creator profile and its
Analytics panel all exist. Creator analytics stores nothing yet: its panel shows "Not collected yet" for everything except the canonical fork
count and the public board count, so the landing shows the profile card counters instead and no analytics panel. The prepared demo is one
reader (one star, one comment, one private fork); nothing here is real engagement. Sources and scripts: C:/s/spec/landing-audiences/capture
(`creators.mjs`, `capture-creators.mjs`, `make-post-visual.py`, `optimise-creators.py`).

## Frame, order and hierarchy (2026-10-28)

- Order everywhere: University students, AI / ML engineers, Interview preparation, Educators, Content creators, Enterprise onboarding (06). University students is selected first.
- Hierarchy above the canvas: the audience name is the large heading; the benefit headline and sentence are smaller lines. Enterprise onboarding carries ("Understand the code you inherit." / "Help new teammates learn and contribute.").
- Every audience sits in the original rounded frame with the Rabbit Hole header row, on the product's dotted canvas grid. The faded section illustration is removed; the page around the section is plain white.
- Pinning uses the same conditions as What is Rabbit Hole? (width over 900px, height at least 700px). A composition is laid out at 1100px and scaled to the framed canvas, so heading, frame and navigation stay in the pinned viewport. Earlier cause of missing pinning: this section's own 880px minimum height (raised from 760px).
- Content creators shows the reader comment and the fork ("Forked from ..."); no analytics or profile crop (creator analytics collects nothing yet). The post's link line reads "Link to the canvas": no real, safely creatable public destination exists for the demo.
- Enterprise onboarding (name restored; text "Understand the code you inherit." / "Help new teammates learn and contribute." is an assumption pending owner veto) is shown as an illustrative heat-conduction example, see below.

## University exam situation and Enterprise onboarding (2026-10-28)

- University students: the third situation is a real Quiz card (answered, KaTeX, the product's own "Right." feedback) beside the lecture PDF; explain-back appears only in Interview preparation.
- Enterprise onboarding is an ILLUSTRATIVE example: heat1d, a small 1D heat-conduction solver written for this page (not a real repository, never executed as one in Rabbit Hole). Real cards captured with prepared content: README setup lines and the solver's step function (code cards), an Explanation card, and the real notebook card showing an extracted example whose stored outputs come from a real run of the same cells. The change is the left boundary temperature 100 to 150 degC; the midpoint at t = 3000 s moves from 57.39 to 80.76 degC (exact series values 57.36 and 80.72). Sources: C:/s/spec/landing-audiences/heat1d and capture/enterprise-c.mjs.

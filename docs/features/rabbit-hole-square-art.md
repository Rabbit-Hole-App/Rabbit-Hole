# Square artwork in the landing page's white sections

Approved direction: add two subtle square abstract compositions to the existing
white sections. Preserve the current section order, copy, demos, controls and
other artwork. This is a visual trial on the existing landing page.

- Learning, at your pace: nested square wireframes receding into a small opening,
  with dotted connections and tiny muted pink accents.
- Who is it for?: square apertures joined by branching paths, using the same
  pale graphite and halftone treatment.
- Place each composition inward and slightly down, extending behind the cards
  with visible geometry above and around their edges, fading into white.
  Keep contrast quiet near headings, including on narrow mobile screens.
  Opaque demo surfaces protect their contents; decorative layers cannot receive
  pointer or keyboard input and are hidden from assistive technology.
- A small scroll-linked translation adds depth. It reverses directly with page
  progress, stops when scrolling stops and is disabled for reduced motion.
  The audience art stays with its existing sticky stage. Avoid adding overflow
  containment to a sticky section or its ancestors.

Use original images made with the built-in imagegen tool. Keep the generated
files unchanged, retaining transparency where supplied. Prompts and asset paths
are recorded in `packages/web/design/square-background-art-direction.md`.

Validate actual desktop and mobile appearance, text readability, containment,
scroll/reversal, reduced motion, existing demo/audience controls, final FAQ
navigation and no horizontal overflow. Build with both dev flags and deploy
only the smart-landing-page clone for visual review.

## Verification — 2026-09-29

Deployed to the worktree clone as `e59172f3-97e9-4f5e-b587-f4c7798d98ca`
with both dev flags and the existing tldraw license. Inspected actual deployed
Chrome screenshots at 1440px desktop and 390px touch-mobile widths. Both images
blend into white, text remains readable, and opaque demo windows conceal the
background artwork. No content or controls were replaced.

All 50 focused browser checks passed: asset loading, decorative accessibility,
section order, scroll movement/reversal, stationary behavior when scrolling
stops, reduced motion, adaptive mouse/touch/keyboard controls, audience
selection, desktop pinning in both scroll directions, final FAQ navigation and
no horizontal overflow. No browser runtime errors. Evidence:
`tmp/landing-square-art/deployed-results.json` and `deployed-*.png`.

Placement refinement: moved both compositions inward and down behind the card
area, enlarged their desktop canvas, and reduced contrast near the headings.
Mobile now shows the compositions near the centre instead of cropping most of
them outside the viewport. Card surfaces remain opaque. No image regeneration
or animation changes. Deployed as `3990ac9a-1466-4a4f-abe3-08e3ca325698`;
all 50 deployed browser checks passed again. Inspected desktop/mobile screenshots
in `tmp/landing-square-art/inward/`; results are in `deployed-results.json` there.

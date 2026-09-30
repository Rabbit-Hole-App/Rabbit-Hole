# Landing clarity, adaptive example and footer action

## Compact Guided graph (2026-09-30)

The user requested the Overview-sized canvas, a blue connection between the
retained Overview card and Guided, and one slider with an interactive graph.
Guided uses the same 530px desktop / 410px phone canvas height as Overview,
with a graph card capped at the same 540px width. The quiz stays beneath it.

Score A varies from -2 to 4; B=1, C=0, D=-1 remain explicitly fixed. Four
probability bars, their labels and Deep Dive vectors derive from the same
Softmax calculation. This teaches how one score changes the entire
normalized distribution without introducing temperature. The cursor moves A
down then up. Typing, zoom, send, one-second spinner, takeover, pause/resume
and reduced-motion behavior remain. The equal-score quiz is hypothetical;
it no longer asks visitors to adjust unavailable controls.

Verification covers all 25 slider values against an independent stable
Softmax calculation, bar geometry, compact canvas bounds, visible cards and
composer, blue connection, actual pointer and keyboard control, quiz feedback,
shared Deep Dive state, reduced motion and interruption. Public-page browser
checks block API/auth/write traffic.

Published to the named landing review clone as
`7597b02d-f5ea-47df-85f3-39218f5dcae0`. Local build, `make test-unit`, the four
math tests and deployed browser checks passed. Desktop 1440px, phone 390px,
narrow phone 320px and tablet 768px all passed; deployed screenshots were
visually inspected. No browser errors or API/auth/write attempts occurred.
The branch is committed and frozen after this requested refinement.

## Reopened Guided walkthrough (2026-09-30)

The user explicitly reopened `feature/smart-landing-page` after the approved
`f6a3216a` freeze for this focused follow-up, then requested another commit,
push and freeze. No auth or integration merge is authorized.

Guided now stages `/explain explain me softmax function`: typing and composer
zoom, illustrated send click, one-second explanation spinner, then the Guided
card and its connection from the retained Overview video still. A visible
cursor moves and drags each of four native score controls. Overview is not
played in Guided. Real pointer/keyboard input stops the staged gestures and
preserves the visitor's values across tabs. Offscreen/hidden pages pause;
reduced motion and keyboard tab selection show the completed interactive state.
Typing waits until the composer is actually visible.

All four scores are adjustable, with raw exponential weights, their sum,
probabilities and Deep Dive vectors derived from the same inputs. Values are
bounded to [-2, 4]; rounding is disclosed. Formula reference:
https://docs.pytorch.org/docs/2.14/generated/torch.nn.Softmax.html

A local multiple-choice activity beneath the canvas asks what happens when
all four scores are equal. Correct answer: 25% each. Incorrect answers explain
normalization and allow retry. No generation request, auth or persistence.

Verification uses `packages/web/src/landing/adaptive-softmax-math.test.mjs`
and the read-only browser scenario `packages/web/e2e/landing-guided-check.mjs`.
The browser test blocks API/auth/write traffic. Evidence is stored outside the
worktree in `C:\Users\cyudhist\AppData\Local\Temp\rabbit-hole-guided-review`.

Local delivery checks passed: full dev build, `make test-unit`, four mathematical
regression tests, and browser scenarios at 1440/390/320/768px. Verified typing,
zoom, spinner, retained video still, card/link reveal, cursor gestures on all
four sliders, actual pointer dragging, probabilities/weights/vectors, quiz
retry/success, keyboard use, reduced motion, offscreen pause/resume, takeover,
rapid switching and compact Overview. Browser errors and blocked API/write
attempts: zero. Screenshots were visually inspected. The visibility check reads
current geometry rather than trusting stale queued intersection measurements.

The initial deployment hold was explicitly lifted by the user. The four-slider
version was published as `70811ef2-31e6-4fa8-9aff-3eb72f14696d`. Read-only
deployed browser checks passed at 1440/390/320/768px with no errors or API/write
requests. The compact single-slider revision above supersedes that layout.

## Compact Overview follow-up (2026-09-30, local only)

Inactive depth scenes no longer reserve the tallest scene's height. Overview
uses a compact canvas (530px desktop, 410px phone minimum) that fits the video,
playback controls and composer; Guided expands for its linked cards. This
supersedes the prior equal-height-across-depths behavior. Local checks at
1440/390/320px verify height, control containment and retained Guided links.
Evidence: `tmp/manifesto-review/local/results.json`. No deployment or backend
actions; the security hold remains active.

## Current milestone — Softmax at three depths (2026-09-29)

Latest revision (local only): all composers use “explain me softmax function”.
Overview uses `/motion`, Guided `/explain`, and Deep Dive `/deeper`, displayed
as matching tool pills with corner ×. The illustrated Overview sequence now
plays the entire 25-second video automatically; the 8.4-second cutoff and
click-to-watch-full invitation are removed. Optional pause/resume/replay and
explicit reduced-motion playback remain available. A visible play/pause button,
seekable timeline and elapsed/total time sit beneath the video. Offscreen/hidden/
inactive playback pauses. This supersedes the short-preview behavior documented
below.

Follow-up for the commit: all three title bars read “Rabbit Hole Canvas”. The
ready-state “Animation preview · sound off” caption is removed. Guided retains
a compact still card of the Overview video, connected by a visible directional
line to the interactive Guided card. No second video player or autoplay is
created in Guided; the prior intuition remains visible alongside the next depth.

Local validation passed: build plus 80 focused browser checks at 1440/390/320px.
Verified uninterrupted automatic playback to 25 seconds without a visitor
click, actual play/pause/replay, keyboard and pointer seeking, elapsed-time
updates, offscreen pause/resume, depth switching, reduced-motion opt-in playback,
matching prompts/tool pills and control containment. Local screenshots were
inspected; no page errors. Evidence:
`tmp/softmax-motion/autoplay-controls-local/results.json` and screenshots;
build log `tmp/softmax-motion/autoplay-controls-build.log`. No deployment,
merge, login or remote app write was performed for this revision.

### Security hold and branch handoff — 2026-09-30

The user reported that `small-cp-dev-smart-landing-page` shares production
resources. Until P0-B is fixed, remaining verification is limited to local
builds/tests, static visual review and read-only page inspection. Do not run
login, test-session, project/canvas creation, uploads, Learn writes, deploy/run
actions or sharing against the clone. Do not merge or deploy another clone
version without explicit approval. This overrides earlier automatic deployment
instructions for this worktree.

Initial handoff branch: `feature/smart-landing-page`, HEAD `983ebe8b`. The landing
changes were uncommitted at that handoff; the index was empty. Preserve the other
ongoing worktree changes. Version `3d63133b-a3ba-4ae2-949a-792532f593cb` and the
hosted public-page checks below occurred before this security hold. No login or
app-data writes were used for those checks. Subsequent handoff verification is
local only; no further deployment or merge was performed.

Approved follow-up (2026-09-30): retain the short automatic preview. A real
visitor can click the video card or its “Watch the full explanation · 25 sec”
caption to restart the complete clip inline. The same card supports pause,
resume and replay without extra playback chrome. Offscreen/hidden/depth changes
pause playback. Reduced motion skips the staged animation, but explicit visitor
playback remains available. The illustrated cursor does not trigger full mode.

The depth tabs should visibly resemble pressable buttons. Their selected color
progresses from light rose (Overview) through red (Guided) to deep red (Deep
Dive), with separate borders, hover/press feedback and retained keyboard focus.

Guided and Deep Dive reuse Overview's dotted learning-canvas frame, title bar
and bottom chat composer. Their existing interactive calculation and code live
in cards on that canvas, with a depth-appropriate illustrative prompt. Preserve
the slider, shared values, source display, tab semantics and stable layout.

Delivered to the worktree clone as `3d63133b-a3ba-4ae2-949a-792532f593cb`.
The real video-card button restarts the complete 25-second clip, then supports
pause/resume/replay inline. The short automatic preview remains unchanged.
All three depths use matching canvas and composer styling; Guided and Deep Dive
keep their existing content and interaction. Buttons have 44px minimum targets,
separate borders, hover/pressed/focus feedback, and progressively darker red
selected states. Selected-label contrast ranges from 5.1:1 to 9.6:1.

Passed 103 focused checks plus 67 original-sequence checks on the actual
deployment. Verified 1440/768/390/320px layouts, shared canvas/composer
containment, stable heights, interactive math, cross-depth values, real complete
25-second desktop/mobile playback, offscreen pause/resume, restart/replay and
explicit keyboard playback under reduced motion. Fixed a narrow-screen height
change by reserving the total's numeric width. Screenshots inspected; no browser
page errors. Build and whitespace checks passed. Evidence:
`tmp/softmax-motion/depth-deployed/depth-results.json`, `results.json` and
screenshots in the same directory.

Refinement requested 2026-09-30: the canvas starts empty. Magnify the composer
more during typing; `/motion` becomes a `motion` tool pill with a small × at its
upper-right. Finish the prompt, show the large cursor clicking Send, then zoom
back for exactly one second of `Generating animation` with a spinner. Continue
the existing card reveal → cursor clicks Play → actual video sequence. Overview
side copy explains the teaching approach: animation as a visual foundation for
intuition and the big picture. It does not explain Softmax itself. Keep Guided
and Deep Dive content, media, accessibility and visibility behavior intact.

Refinement delivered to the worktree clone as
`9023fa7a-45eb-483c-9ea1-130370424a4e`. The composer magnifies to 1.65× on desktop
and 1.4× on phones, with framing that keeps the prompt, pill/corner × and large
Send cursor inside the canvas. The initial sample scores and caption are gone.
The Send press precedes a 1000 ms generation phase; the existing video-card
click and real playback follow. Overview now reads “Build intuition. See the
big picture.” with teaching-focused supporting copy.

Passed 67 scenario checks plus 34 interruption/layout/fallback checks against
the actual deployment. Measured the spinner duration, verified both illustrated
clicks before playback, inspected desktop/mobile screenshots, and confirmed no
page errors. A separate 320px local run passed 35 checks. Build and whitespace
checks passed. Evidence: `tmp/softmax-motion/refinement-deployed/results.json`,
`edge-results.json` and screenshots in that directory.

The user approved replacing the attention example in the existing Learning, at
your pace section with one Softmax example. The canonical depth labels are
**Overview**, **Guided**, and **Deep Dive**. Depth describes prerequisite/detail
level; animation is one explanation format and `/motion` is an agent tool.

- Overview: an illustrative canvas zooms toward the composer, types
  `/motion explain me softmax function`, zooms back, shows generation progress,
  then reveals the user's actual cartoon as a video card. A large illustrative
  cursor moves onto its play control and clicks; the first 8.4 seconds play.
  Source: `C:\Users\cyudhist\Downloads\softmax.mp4`. Preserve the original.
- Guided: use the same initial scores `[2, 1, 0, -1]`; show exponentiation,
  normalization and resulting shares. A score slider updates the calculation.
- Deep Dive: the same scores, a stable formula, tensor shapes, implementation,
  numerical limits and a neutral source link. Reuse shared code presentation.
- Retain the current section layout, background artwork and page order. The
  later product overview and Features page stay as they are.
- This is a marketing preview: no model request, backend, storage or auth work.
  Label the staged generation sequence as illustrative. Lazy-load the video;
  pause media/timing when offscreen, hidden or on another depth. Reduced motion
  and keyboard depth changes show the completed static result. Media failure
  must retain a useful poster. No new playback controls.

Validate the full prompt-to-video sequence on the actual deployed clone,
desktop and mobile, arithmetic/slider interaction, cross-depth consistency,
keyboard navigation, reduced motion, interruption and a stable layout. Check
that the original overview, audience and cloud interactions remain intact.

### Delivered and verified

Deployed only to `small-cp-dev-smart-landing-page`, version
`a69f287d-53a6-4b36-8cfb-9a774c68205d`. The original 2.9 MB video is retained as
`packages/web/public/landing/softmax-overview-v1.mp4`; a 45 KB WebP poster was
extracted from 8.4 seconds. No new image or video generation was used.

Overview runs a finite sequence while visible: composer focus/type, zoom back,
generation indicator, card reveal, large cursor approach/click, then real muted
playback through roughly 8.4 seconds. Selecting Overview again replays it.
The source starts loading only after sustained visible animation frames, to
avoid a transient initial mobile intersection fetching an offscreen video.
Offscreen/hidden/depth changes pause activity. Keyboard selection and reduced
motion show the completed still. Failed media keeps the extracted poster.

Guided recalculates all four probabilities from a native range control. Deep
Dive shares that input/output and lazy-loads the existing `CodeBlock` and
`colorLine` helpers; plain source remains available if the helper fails to load.
The bounded score range supports safe exponentiation in Guided; Deep Dive
explains subtracting the maximum for general numerical stability.

The actual deployed page passed 45 desktop/mobile scenario checks and 34
additional interruption/layout/fallback checks. Covered 1440px and 390px full
sequences, 320/768/1024px and short landscape layouts, real video decoding and
playback after the illustrated click, lazy loading, correct probability totals,
equal-score shares, input extremes, cross-depth state, stable card height,
keyboard controls, reduced motion, rapid switching, offscreen pause/resume,
failed-media poster, original overview tabs and no API/model calls. Browser
page errors: zero. Desktop/mobile screenshots were visually inspected.
Evidence: `tmp/softmax-motion/deployed/results.json`, `edge-results.json` and
screenshots in the same directory. Build and whitespace checks passed.

## Previous milestone

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

# Landing overview and cloud interlude

Current placement (2026-09-29): Learning, at your pace → pink cloud → What is
Rabbit Hole? → Who is it for? → FAQ. The audience section now follows the
overview, replacing the direct overview-to-FAQ join described in the initial
milestone below. Preserve each section's existing visuals and interactions.

Approved scope: add an overview of Rabbit Hole to the existing Japanese
observatory scene on the landing page. The Features page keeps the detailed
walkthrough. Use five animated HTML placeholders inside one Mac-style window;
real product captures can replace them later. No image generation, model calls,
backend integration or persistence.

## Presentation

- Preserve the Japanese artwork, animated mist and stars as the background.
- Introduce Rabbit Hole as an adaptive learning workspace. The five screens
  cover learning from sources, follow-up questions, visual canvases, practice,
  and saved learning. Label the window as an illustrative product preview.
- Desktop scroll gently opens the window, then advances through five screens.
  The same progress works in reverse. Tabs allow direct selection; keyboard
  navigation changes screens immediately. No timed screen rotation.
- Short/compact screens use tabs and horizontal swipes. Keep native vertical
  scrolling. Reduced motion presents a stable window and complete scenes.
- Keep the current cloud GIF loop. Update its draft editorial copy and add a
  link to the overview, with small annotations inspired by TypeSafe's hierarchy.
- Reserve a blank white block after the clouds for future content.
- Remove the external gap between the observatory and FAQ, preserving FAQ
  internal padding and all existing audiences/manifesto/footer behavior.

## Verification

Check five scenes, scroll reversal, direct tabs, keyboard/focus, mobile swipes,
reduced motion, short viewports and resize. Inspect actual desktop/mobile pixels.
Confirm cloud looping assets and earlier sections remain; future space is blank;
observatory touches FAQ; no overflow, browser errors or API requests. Build with
both dev flags and deploy only the smart-landing-page worktree clone.

Reference: https://typesafe.ai/ (editorial hierarchy; no new assets copied).

Delivered on the worktree preview as
`4797cedd-01c3-4abc-8fa0-f73b6bb8757f`. The full deployed pass completed 190
overview checks and 162 audience regression checks; 15 focused deployed checks
passed after the final offscreen-animation adjustment. Final desktop/mobile and
FAQ-join screenshots were inspected. No browser errors or API calls. Evidence:
`tmp/landing-overview/deployed/`, `tmp/landing-overview/final/` and the release
entry in Coaching. The user approved this visual direction on 2026-09-29;
the product scenes remain illustrative placeholders for future real captures.

Update on 2026-10-27 (owner brief "AI Tutor", supersedes the scroll and tab
choices above): the five tabs are AI Tutor, Explanations, Your materials, Learn
by doing and Rabbit Holes, with AI Tutor selected first. Page scrolling no
longer advances tabs; only a tab click, arrow keys, Home/End or a touch swipe
changes them, and no tab numbers or "01 / 05" counter remain. AI Tutor shows a
silent recorded take of the real canvas, Tutor panel and Explanation card
(scripted lines, the prepared pendulum card; capture sources in
`C:/s/spec/landing-tutor/capture/`) at about 30/70 copy to video, with Play/Pause
and Replay below it, the disclosure "Scripted product demo · generation time
omitted." and the conversation as text. The video never autoplays or loops and
pauses when its tab is left, the window leaves view or the page is hidden. The
other four tabs keep their illustrative scenes, labelled as such.

Follow-up on 2026-09-29: the reserved white block is now the approved interactive
[adaptive example](rabbit-hole-adaptive-demo.md). The overview window, original
cloud loop and flush FAQ boundary remain unchanged.

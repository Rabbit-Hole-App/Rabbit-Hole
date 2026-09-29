# Blog: ideas, unfolded

The Blog uses a static technical-print collage behind only its introduction.
The paper animation was removed at the user's request on 2026-09-28.
The page below the header remains white. The artwork itself is colored: the
white v3 image was rejected, and v4 is a completely new composition with
denser abstract diagrams on the right. Cards follow beneath the header.

The image combines a circular indexing diagram, fine ink curves between
offset apertures, contour fields, cobalt and teal printing plates and an ochre
accent over aqua paper. It replaces the previous book/cube composition.
The left side stays clear for the live Blog label and
“Ideas, unfolded.” headline. No subtitle or scroll cue is added.

Selected asset: `public/landing/blog-atlas-v4.png` (2172 × 724).
Prompts and provenance: `blog-collage-prompt.md`, `blog-collage-assets.json`.
Earlier pink and white versions remain as source history.

## Presentation

White page and card surfaces, neutral grey cover backgrounds, original plum
ink, Space Grotesk headings and Inter body text. Only the header artwork has a
colored ground; article reading views remain white. There is no fixed color
overlay, paper canvas, sticky art stage or scroll-animation module.

`src/landing/blog-art.css` places the decorative image absolutely inside the
introduction; the image scrolls normally with the heading. Existing article
layout and interactions remain in `blog-stories.{js,css}`.
Tablet and phone crops favor the quiet aqua title area while retaining a
fragment of the new diagrams at the right edge; desktop shows the whole atlas.
The six sample cards use three, two and one columns at desktop, tablet and
phone widths. On pointer hover, the card lifts 3px, its two cover layers part
slightly, and a circular arrow fills plum while moving diagonally 2px. A
reserved “Read story” label fades in without shifting the date or reading time.
Transitions last 200ms and reverse from their current position on pointer exit.
Touch screens show the label continuously. Keyboard focus uses a visible outline
and immediate action emphasis. Reduced motion keeps the feedback without moving
the card, cover layers or arrow. Pricing shares the arrow presentation.

## Sample stories

The six original local sample stories and their content are unchanged.
Each full card is a keyboard-accessible link to `/blog?post=<slug>`.
The reader keeps its sample label and top/bottom links to `/blog#stories`.
Direct links, refresh, browser back and unknown-slug recovery remain.
No CMS, API/model calls or persistence were introduced.

## Earlier artwork

This replaces the loose-sheet paper archive and its pink-to-rose scroll tint.
Earlier archive and overlay evidence remains under `tmp/blog-archive/` and
`tmp/blog-overlay/`. The former renderer is retained in Git history and the
local `tmp/blog-collage/previous-paper-renderer.js` snapshot.
Current browser evidence is under `tmp/blog-atlas-v4/`.

# Pricing: a learning canvas behind the packages

The user rejected the antique key and butter-yellow color on 2026-09-28.
Pricing returns to its original white background, black text and plan layout.
The key canvas, animation module and dedicated palette styles are removed.
The user subsequently requested a partial abstract image at the top, blending
into the page with the pricing cards in front. Their supplied TypeSafe screenshot
provides the visual reference: fine technical diagrams and restrained iridescence.

The user approved applying the researched package proposal and requested resource,
service and benefit lists for every package. The three cards now show Free ($0),
Plus ($19/month) and Pro ($39/month). Each lists project capacity, AI credits,
source storage, learning tools and support. A separate Teams section is marked
coming later at $29/learner/month with a five-learner minimum.

The page explicitly presents planned early-access packages. Paid subscriptions,
allowance enforcement and team functionality are not implemented by this change.
All card links open the existing `/apps` flow instead of a placeholder checkout.
Credit usage is explained below the cards; saved reading/editing/replay is outside
the proposed meter, while generated media has a separate future allowance.

Keep the neutral page, shared navigation and existing card layout. The page uses
`design/rabbit-hole.css` with scoped additions, plus the shared navigation module.
Landing, Blog and Features remain unchanged. No annual billing toggle was added.

## Canvas artwork

The user rejected the desk drawings and requested the Japanese manga scenic
style already used on the landing page. The active image is now
`public/landing/pricing-manga-v2.png`: a blue mountain valley, lake and river,
soft pink light, and a right-hand ridge trail. It uses
`blue-mountains-v1.png` as a style/palette reference, with a new composition.
There are no text, price annotations or diagrams in the new image. Blog was
explicitly left unchanged. The user rejected the white brush effect around the
image and beneath Pricing. A targeted edit fills the white areas with the
existing landscape; all CSS edge masks, mobile dimming and the blurred white
intro backdrop are removed. Prompts: `pricing-manga-prompt.md` and
`pricing-manga-clean-prompt.md`.

The user tried and then rejected pixelization. The original painterly complete
image, sky and transparent mountain layer are restored, and the pixelated
resampling rule is removed. Text, cards, composition, cloud/bird motion and
bottom fade remain in place. Pixel-edit prompts in `pricing-pixel-prompts.md`
are historical; none of those assets are referenced by the current page.

### Previous directions

`public/landing/pricing-canvas-v1.png` established the diagram collage: connected
learning tiles, small grids, stipple and nested rabbit-hole contours, with small
pink/lilac/mint iridescent accents. The user liked it and requested small notes
showing the reasoning behind the packages, like an economics professor's board.
`pricing-canvas-v2.png` edits that composition with the planned $0 / $19 / $39
monthly prices, 20 / 200 / 500 AI credits, cost drivers and a contribution formula.
These are illustrative annotations; no invented profit or customer statistics.
The actual plan cards, explanations and buttons remain accessible HTML.

The user then selected a learner's desk to replace the excessive planetary
diagrams. The previous `pricing-canvas-v3.png` uses an open notebook, pencil,
ruler, annotated research papers and calculator. Pricing notes and a small
usage graph remain; a tiny notebook arch supplies the rabbit-hole reference.
An invented numeric contribution example in the first edit was removed before
integration. The final notebook uses a symbolic formula only.

Prompts are in `pricing-canvas-prompt.md`, `pricing-whiteboard-prompt.md` and
`pricing-desk-prompt.md`; metadata is in `pricing-canvas-assets.json`. All edits
use the built-in image tool; prior selected versions remain in the repository.

The full-color image is positioned behind the introduction and top of the cards,
starting at the top of the page behind navigation. Following the user's next
request, only the bottom edge now fades gently into the white page. The top,
sides and heading remain free of white overlays. Card surfaces
remain opaque white/black for legibility; the actual package content is unchanged
HTML. The image has empty alt text, sits in an aria-hidden decorative container,
and does not intercept pointer input. Mobile crops the same full-color scene.
The introductory text uses solid ink for readability over the sky.
The sky is now a separate painted layer moving behind an alpha-cut mountain
foreground. The original complete image remains the fallback until both layers
decode. Three small SVG birds glide behind the ridge. CSS transforms drive a
42-second alternate cloud drift, 38–43-second bird crossings and 2.4-second
wing cycles. Motion pauses offscreen, in hidden tabs and for reduced motion.
No playback buttons, scene translation, new dependencies or canvas renderer.
Source: `src/landing/pricing-art.{js,css}`. Asset prompts:
`pricing-motion-prompts.md`.

Pricing now uses the rendered Features title hierarchy: the shared section
heading (68px desktop, 38px at 700px and below) and a large two-line headline.
The latter uses `clamp(76px,9.8vw,146px)`, 96px at 900px and below, and
`clamp(68px,16vw,96px)` at 600px and below; weight 500, .91 line height and
-.07em tracking. The original introductory copy is split into that headline
and a supporting sentence. Pricing cards, allowances and details remain intact.

## Card interaction

Each card gains a soft lilac/mint light and outline on hover, including a lighter
surface on the dark Plus card. A 160ms CSS opacity transition provides feedback
without moving the text or shifting layout. Only hover-capable fine pointers
trigger hover; keyboard focus within a card shows the same highlight immediately.
Reduced-motion mode also makes the change immediate. The decorative layer cannot
intercept clicks, and no new focus stops are introduced.

## Credit explanation, Teams and footer

The introductory early-access sentence was removed at the user's request.
The allowance explanation below the cards remains. Credit rules now have three
unboxed rows with explicit billing labels: new generation uses credits, saved
learning uses none, and media has a separate future allowance. The monthly
refresh note remains visible. Teams has a quiet lilac panel with its future
status, $29 rate, five-learner minimum and all four existing benefits.

Blog, Features and Pricing share a simple static footer through
`src/landing/content-footer.js` and `.css`: home branding, navigation, Get started,
copyright and Back to top. No animation is mounted there. The landing footer,
FAQ and existing wireframe renderer are unchanged. See
`pricing-layout-refinement.md` for the agreed layout direction.

The rejected implementation and its previous design note are retained in
`tmp/pricing-neutral/rejected-key.*` for history. Verification and screenshots
for the restored page are in the same directory.

Package-page verification and desktop/mobile screenshots are in
`tmp/pricing-plans/`. Deployed review confirmed the plan details, responsive
layout, unchanged neighboring pages and the existing sign-in destination.

Artwork integration screenshots and verification are in `tmp/pricing-canvas/`.
The notice removal is checked in `tmp/pricing-copy/`; the desk, supporting
sections and shared static footers are checked in `tmp/pricing-desk/`.
The manga replacement is checked in `tmp/pricing-manga/`.

# Blog hero images

Every blog post hero image shares one washed engraving look (owner brief, 2026-11-02). The hero card itself does not
change its size and corners. Owner, 2026-11-02: a hero image fills the whole card edge to edge, with no side margins and no
"Rabbit Hole / Notes" label; a text-only cover keeps its dotted paper and label.

## Palette

Defined once as CSS variables on `.blog-page` in `blog-stories.css`.

| Variable | Name | Hex | Use |
|---|---|---|---|
| `--hero-paper` | paper | `#F4F3EF` | background, always |
| `--hero-ink` | ink | `#3D2A5C` | line work, darkest value |
| `--hero-plum` | plum | `#8A7AA6` | shading, secondary shapes |
| `--hero-rose` | rose | `#D9B8C4` | one accent per image, at most |
| `--hero-sage` | sage | `#B7C2B0` | optional second accent |

No pure black or white anywhere in a hero image.

## Files and wiring

- Image: `packages/web/public/landing/blog/<post-slug>-hero.jpg`, served at `/landing/blog/<post-slug>-hero.jpg`
  (Vite copies `public/` to the build root). Aspect 16:5.6 (generated at 2048x720), saved as a 90% JPEG so the file stays under 1 MB; owner brief said PNG, a 3.5 MB PNG was too heavy for the blog index.
- Post: set `hero` in its `stories` entry (`blog-posts.js`) to the image's alt text. `cover()` then renders the image
  from the slug path, filling the whole card (object-fit cover) inside `.hero-wash`.
- `.hero-wash` (in `blog-stories.css`) is the one wash every hero image gets: about 25% less saturation, 10% less
  contrast, and the paper colour over it at about 15%. Never apply it to text-only covers such as "Why?"; a post
  without `hero` keeps its text mark.

## Prompt

Every hero image reuses this prompt with only the subject sentences changed (the sentences naming the figures, what they
do and the scenery behind them). Keep one procession of figures on the same ground line in the middle of the frame, a
layered engraved background in finer, lighter hatching, hand-tinted muted washes, no text, and always run the result
through `.hero-wash`. Owner, 2026-11-02: figures on plain paper were too simple and the first scene was monochrome; the
image is a full scene in muted colour, still washed out (the CSS wash keeps it so). Generate at the native wide size
2048x720 (about 16:5.6); the API accepts it, so nothing is cropped.

> Hand-drawn illustration in the style of a 19th-century book engraving, in the spirit of Tenniel's 1865 illustrations
> for Alice's Adventures in Wonderland and not the Disney designs, loose cross-hatching, slightly faded as if printed
> decades ago. A full panoramic Wonderland scene that fills the whole canvas edge to edge with no empty margins. In the
> foreground, grouped within the middle 55% of the width and all on one ground line, a procession moving left to right:
> the Mad Hatter with his teacup and the Caterpillar on his mushroom, smaller, at the left; Alice in a plain dress and
> pinafore with her hair loose, following; the White Rabbit in a waistcoat checking his pocket watch, mid-stride,
> leading; the Cheshire Cat perched on a bough above them with its grin fully drawn. Behind them, a rich layered
> Wonderland receding into the distance, drawn in finer, lighter, fainter hatching so the foreground figures stand
> clearly forward: an overgrown garden of tall rose hedges and twisting old trees, a mad tea-party table set with
> teapots and cups, playing-card soldiers standing guard, giant mushrooms and oversized flowers, a grandfather clock
> among the trees, a tiny locked door at the foot of a great tree, hanging oil lamps, playing cards drifting through the
> air, and a distant castle with a checkerboard floor, with the dark mouth of a rabbit hole between tree roots near the
> right edge. Hand-coloured in soft, muted, washed-out watercolour tints laid over the ink line work, like a faded
> vintage hand-tinted book plate: pale sage and moss greens in the foliage, hedges and mushrooms, dusty rose on the
> roses and the White Rabbit's waistcoat, faded powder blue only in the sky and distant hills, warm muted ochre on the
> tea table and the Hatter's coat, pale lavender on Alice's plain dress (with a white pinafore, hair loose, no
> headband), soft grey-plum tabby stripes on the Cheshire Cat, muted red-brown on the toadstools and the playing cards,
> off-white paper #F4F3EF and deep plum ink #3D2A5C for the line work. Low saturation, low contrast, matte, subtle paper
> grain, no pure black and no pure white anywhere. No text, no lettering. A very wide panoramic strip, about 2.85 times
> wider than tall (16:5.6): compose every figure, including the Cheshire Cat on its bough, and the whole procession
> inside this wide low frame, with nothing cropped.

Check the result before using it: Alice must not be in a blue dress with a white apron and black headband, and the
Cheshire Cat must not be purple-and-pink striped; both are Disney's designs, not Tenniel's. Regenerate if either
appears.

## Posts

| Post | Image | Alt text | Status |
|---|---|---|---|
| `rabbit-holes-not-courses` | `rabbit-holes-not-courses-hero.jpg` | The White Rabbit, Alice, the Mad Hatter, the Caterpillar and the Cheshire Cat in a hand-tinted engraving of Wonderland, walking through a garden with a tea-party table, playing-card soldiers and a castle behind them. | Generated 2026-11-02 with GPT Image 2.5 Flare at 2048x720, quality high, attempt 4 of 4 (US$0.0239; attempts 1 to 3 were US$0.0123, US$0.0445 and US$0.0235, total about US$0.10). Attempts 1 to 3 were replaced at the owner's request (too simple, then monochrome). Highlights capped at #F4F3EF; 90% JPEG, 0.9 MB. The Cat is a muted grey-lavender tabby, not Disney's pink and purple. |

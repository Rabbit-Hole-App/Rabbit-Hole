# Blog hero images

Every blog post hero image shares one washed engraving look (owner brief, 2026-11-02). The hero card itself does not
change: dotted paper, 1px border, rounded corners and the bottom-left "Rabbit Hole / Notes" label stay on every post.

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

- Image: `packages/web/public/landing/blog/<post-slug>-hero.png`, served at `/landing/blog/<post-slug>-hero.png`
  (Vite copies `public/` to the build root). Aspect 16:5.6, exported at 2x for retina.
- Post: set `hero` in its `stories` entry (`blog-posts.js`) to the image's alt text. `cover()` then renders the image
  from the slug path, centred at 76% of the card width so the paper shows around it, inside `.hero-wash`.
- `.hero-wash` (in `blog-stories.css`) is the one wash every hero image gets: about 25% less saturation, 10% less
  contrast, and the paper colour over it at about 15%. Never apply it to text-only covers such as "Why?"; a post
  without `hero` keeps its text mark.

## Prompt

Every hero image reuses this prompt with only the subject sentences changed (the sentences naming the figures and what
they do). Keep the palette, one composition of figures on the same ground line, centred, no scenery, no text, generous
margins, and always run the result through `.hero-wash`.

> Hand-drawn illustration in the style of a 19th-century book engraving, loose cross-hatching, slightly faded as if
> printed decades ago. A small group from Alice's Adventures in Wonderland, drawn in the spirit of Tenniel's 1865
> illustrations and not the Disney designs: the White Rabbit in a waistcoat checking his pocket watch, mid-stride,
> leading; Alice following him, in a plain dress and pinafore, hair loose; the Cheshire Cat perched above them, only its
> grin fully drawn; the Mad Hatter and the Caterpillar on his mushroom smaller, in the background. All figures on the
> same ground line, arranged left to right as a procession toward the right edge, as if heading into a rabbit hole just
> out of frame. Limited palette: off-white paper #F4F3EF, deep plum ink #3D2A5C, muted lavender shading #8A7AA6, one
> touch of dusty rose #D9B8C4 on the Rabbit's waistcoat, one touch of sage #B7C2B0 on the mushroom. Washed,
> low-contrast, matte, subtle paper grain. Figures centred on a plain paper background, no scenery, no text, generous
> margins. 16:5.6 landscape.

Check the result before using it: Alice must not be in a blue dress with a white apron and black headband, and the
Cheshire Cat must not be purple-and-pink striped; both are Disney's designs, not Tenniel's. Regenerate if either
appears.

## Posts

| Post | Image | Alt text | Status |
|---|---|---|---|
| `rabbit-holes-not-courses` | `rabbit-holes-not-courses-hero.png` | The White Rabbit, Alice, the Cheshire Cat, the Mad Hatter and the Caterpillar as a faded engraving, walking in a line toward the edge of the page. | Generated 2026-11-02 with GPT Image 2.5 Flare at 2048x1152, quality medium, attempt 1 of 4 (US$0.0123); fitted offline to 2048x717 on its own paper tone with a feathered edge, highlights capped at #F4F3EF. Deviation: the Cat sits on a small branch. |

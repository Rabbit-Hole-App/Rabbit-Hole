# ILL-0 v2: Recraft style, the six style-r1 subjects re-run (sprint 2)

Commit: 82b4a9cbb (branch feat/visual-sprint-2-ill, off released main 74c4f68ae). Files: control-plane/src/explanation-figures.js, image-providers.js, learn-artifact.js.

What shipped
- explanation-figures.js: FIGURE_STYLE (one short preamble: "Flat vector line illustration: one even dark outline, flat solid fills, no gradient, no shadow, no texture, bold rounded labels, few elements, generous spacing."), figurePrompt(prompt) = FIGURE_STYLE + blank line + "Subject: " + prompt, used by the picture attempt; FIGURE_STYLE_ID = 'ill0-v2'.
- image-providers.js: RECRAFT_CONTROLS on every Recraft request: background_color #FFFCF0 and colors = the seven fills + the outline ink #32211C (8 colours; the API allows 10).
- learn-artifact.js: the card archive record gains stylePreamble: 'ill0-v2' when the returned card has figures.
- Deviation from the order, verified against the Recraft API reference (https://www.recraft.ai/docs/api-reference/endpoints, read 2026-11-15): a colour object is { rgb: [r, g, b] }, not { r, g, b }, so the request carries background_color: { rgb: [255,252,240] } and colors: [{ rgb: [141,191,239] }, ...]. random_seed is a documented integer parameter for all models; the shipped code sends none (a transport wrapper in gen.mjs adds a fixed seed per subject for this evidence only: a 1001, b 1002, c 1003, d 1004, e 1005, f 1006).
- The six images go through figurePrompt and the real recraftImageAdapter (via imageAdapter with a wrapping transport), not a copy of either. The request body is request-example.json (key redacted).
- Spend: six images, 42 credits (7 each, about $0.042), usage.json.

## Pass check (measured; not tuned)
Ground = median colour of an 8 px frame round the image; pass = every channel within 3 of #FFFCF0 (255,252,240). White = pixels with R,G >= 250 and B >= 248 (the ground's blue is 240, so near-white is separable). In palette = nearest of the ground, ink and seven fills within colour distance 20 (anti-aliasing and soft edges count as off).

| subject | ground median | max channel diff | ground | white % | in palette % | off palette % |
|---|---|---|---|---|---|---|
| a | 252,249,241 | 3 | PASS | 0.003 | 92.9 | 7.1 |
| b | 253,249,240 | 3 | PASS | 0.002 | 93.9 | 6.1 |
| c | 253,250,243 | 3 | PASS | 0.016 | 90.6 | 9.4 |
| d | 253,251,247 | 7 | FAIL | 33.989 | 87.8 | 12.2 |
| e | 253,251,249 | 9 | FAIL | 57.528 | 72.7 | 27.3 |
| f | 253,251,248 | 8 | FAIL | 71.684 | 97.4 | 2.6 |

Result: ground PASS on a, b, c (diff 3, at the limit); FAIL on d (7), e (9), f (8): the ground drifts to a near-white cream (253,251,247 to 249) and 34, 58 and 72 percent of those images' pixels read as near-white by the test above. The fills are mostly the palette's hues but not exactly: contact-sheet.png shows e with a saturated blue-violet ellipse and bright red dots (neither in the palette), c with a yellow and a saturated green, d with a dark-brown outline and red-orange trunk, a and f with a pink or green pill; the off-palette share is 3 to 27 percent. Overall: the style controls move the ground toward the cream and the palette, they do not hold it (3 of 6 pass the ground test, 0 of 6 are strictly palette-only). Not tuned; the next knob, if the owner wants it, is the prompt wording ("background exactly #FFFCF0") or a fixed Recraft style_id with the palette stored.

Files: a to f -ill0-v2.png (the six images as PNG; Recraft returned WebP, converted), contact-sheet.png, request-example.json, usage.json, preamble.txt, measure.json and measure.cjs (the measurement), gen.mjs (the run).

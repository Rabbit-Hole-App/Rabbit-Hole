# Pricing landscape without white wash

Built-in image-generation edit, 2026-09-28.
Input: `public/landing/pricing-manga-v1.png`.
Output: `public/landing/pricing-manga-v2.png`.
The user requested the image without white brush effects around it or beneath
the Pricing heading. Page-level masks and the blurred text backdrop are also
removed. Blog remains unchanged.

## Exact edit prompt

```text
Use case: precise-object-edit.
Asset type: full-color manga landscape used as a pricing-page background.
Input image 1 is the EDIT TARGET. Preserve the existing blue alpine lake valley, right-side walking trail and flowers, snow peak, pink-lit clouds, composition, palette and hand-painted Japanese manga/anime scenic style.

Make only this correction: REMOVE the white brush/vignette/fog that obscures the LEFT half, bottom and outer edges. Continue the existing landscape naturally to ALL four rectangular edges. Extend the clear pale blue sky, distant layered blue mountains, lake/forested terrain and foreground landscape into those white areas so the result is a complete fully painted scene. No white paper reserve, no decorative mist in front of the scene, no faded borders, no brushed edges, no white wash, no vignette. Natural clouds in the sky should remain clearly identifiable clouds, not a white overlay covering the landscape. Keep the upper-left sky calm and pale blue for existing dark HTML text, but fully colored and unmasked. Do not add typography or any UI.
Preserve the original scene's distinctive mountain/valley layout as closely as possible. Do not redesign into a different scene. Do not add characters, symbols, diagrams, logos, objects or new narrative elements.
Output one clean opaque 2:1 full-bleed landscape, high-resolution, no border.
```

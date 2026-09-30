# Pricing landscape animation layers

Built-in image generation, 2026-09-28. Source/edit target:
`public/landing/pricing-manga-v2.png`. Both layers preserve that scene's style.
The original remains the static fallback until both layers decode.

## Mountain foreground

Output: `public/landing/pricing-mountains-v1.png`.

```text
Use case: background-extraction.
Input image 1 is the EDIT TARGET. Create the FOREGROUND layer of this exact illustrated landscape for a webpage animation.
Remove ONLY the BLUE SKY AND PINK SKY CLOUDS behind the mountain horizon and replace these sky areas with REAL ALPHA TRANSPARENCY.
Preserve every mountain peak, ridge, distant mountain, lake, forest, low valley mist, green foreground trail, flowers and rocks exactly in their existing position, scale, color and style. Keep the original mountain silhouette precisely, including the high peak at the upper right. The lower landscape is fully opaque and unchanged. Alpha should follow the detailed mountain skyline, including the tree at the far right edge. No color halo at the mountain skyline.
Output exactly the same wide 2:1 canvas and composition as the source. Do not crop, zoom, move or redesign anything. Do not fill the sky with black, white or a checkerboard image: actual transparent PNG alpha is required. No white vignette, faded page edges, text or new objects.
```

## Cloud and sky background

Output: `public/landing/pricing-sky-v1.png`.

```text
Use case: precise-object-edit.
Input image 1 is a composition and style reference for the SKY BACKGROUND layer of this exact illustrated landscape.
Output ONLY a complete painted blue sky with the same pink/peach sunlight on white manga/anime clouds as the input image. No mountains, no ground, no lake, no birds, no foreground at all.
Keep the original upper quarter's sky-blue palette and the broad cloud bank arrangement: delicate small wisps high above, sculpted softly pink-lit clouds lower in the sky with two taller clusters toward the sides, calm blue gaps. Extend sky naturally into the entire 2:1 canvas, below where the original mountains used to be. Keep most cloud detail in the UPPER THIRD so it remains visible behind the mountain silhouette when this layer is animated horizontally. The lower half is gentle clear pale blue sky. Cloud bottoms should be softly painted, cloud tops crisp and hand-painted as the source. Make a beautiful natural scenic anime/manga sky plate, matching the source colors closely, not abstract gradients or photorealism.
The sky must fill all edges, fully opaque, no white brush edges, no fading to a white page, no transparency, no UI, no text, no symbols. Preserve the source's painterly illustration style. Wide 2:1 image.
```

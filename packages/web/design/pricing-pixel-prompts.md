# Pricing pixel-art assets

Built-in image-generation edits, 2026-09-28. The user requested pixelization of
the current Pricing landscape. Each existing layer is style-transferred so sky
motion, mountain occlusion and the complete fallback remain available. Canvas
size remains 1774 × 887. Prior painterly sources are retained.

## landscape

Input: `public/landing/pricing-manga-v2.png`.
Output: `public/landing/pricing-manga-pixel-v1.png`.

```text
Use case: style-transfer.
Input image 1 is the EDIT TARGET. Change only its rendering style to visibly PIXELATED 16-bit landscape artwork.
Preserve the exact composition, silhouettes, colors, light, perspective, object positions and crop of the supplied image. This must remain the SAME Japanese manga mountain world, with blue/cerulean tones and pink highlights; do not invent new scenery or redesign the scene.
Use a clearly visible, consistent square pixel grid equivalent to about 296 x 148 logical pixels enlarged across this 2:1 canvas: crisp roughly 6-by-6-pixel clusters at the full output size, stepped diagonal edges, discrete color planes, restrained ordered dithering for atmospheric shading. Keep sufficient detail to recognize the illustrated scenery but REMOVE smooth painterly microtexture. No antialiasing, soft vector curves, blur, halftone circles, mosaic outlines, noise overlay or CRT scanlines. The result should look intentionally drawn in retro pixel art, not merely low-quality JPEG.
Output one wide 2:1 PNG with the SAME framing. No text, logos, UI, white brush, border or vignette.
Preserve the entire fully opaque mountain/lake/sky composition. Keep all pink clouds, blue water, peaks, forests, flowers and the right-hand path in their original places. This is the complete static fallback, so fill every edge.
```

## mountains

Input: `public/landing/pricing-mountains-v1.png`.
Output: `public/landing/pricing-mountains-pixel-v1.png`.

```text
Use case: style-transfer.
Input image 1 is the EDIT TARGET. Change only its rendering style to visibly PIXELATED 16-bit landscape artwork.
Preserve the exact composition, silhouettes, colors, light, perspective, object positions and crop of the supplied image. This must remain the SAME Japanese manga mountain world, with blue/cerulean tones and pink highlights; do not invent new scenery or redesign the scene.
Use a clearly visible, consistent square pixel grid equivalent to about 296 x 148 logical pixels enlarged across this 2:1 canvas: crisp roughly 6-by-6-pixel clusters at the full output size, stepped diagonal edges, discrete color planes, restrained ordered dithering for atmospheric shading. Keep sufficient detail to recognize the illustrated scenery but REMOVE smooth painterly microtexture. No antialiasing, soft vector curves, blur, halftone circles, mosaic outlines, noise overlay or CRT scanlines. The result should look intentionally drawn in retro pixel art, not merely low-quality JPEG.
Output one wide 2:1 PNG with the SAME framing. No text, logos, UI, white brush, border or vignette.
This is an animation FOREGROUND layer. All sky areas that are transparent in the original MUST remain true ALPHA TRANSPARENT. Preserve the exact mountain skyline registration and the original foreground/valley positions. Make the skyline edge pixel-stepped. Do not introduce ANY sky, clouds behind mountains, black backdrop, white backdrop or baked checkerboard. Preserve the valley mist which is part of the opaque terrain. Pixelate the terrain and keep all empty sky truly transparent.
```

## sky

Input: `public/landing/pricing-sky-v1.png`.
Output: `public/landing/pricing-sky-pixel-v1.png`.

```text
Use case: style-transfer.
Input image 1 is the EDIT TARGET. Change only its rendering style to visibly PIXELATED 16-bit landscape artwork.
Preserve the exact composition, silhouettes, colors, light, perspective, object positions and crop of the supplied image. This must remain the SAME Japanese manga mountain world, with blue/cerulean tones and pink highlights; do not invent new scenery or redesign the scene.
Use a clearly visible, consistent square pixel grid equivalent to about 296 x 148 logical pixels enlarged across this 2:1 canvas: crisp roughly 6-by-6-pixel clusters at the full output size, stepped diagonal edges, discrete color planes, restrained ordered dithering for atmospheric shading. Keep sufficient detail to recognize the illustrated scenery but REMOVE smooth painterly microtexture. No antialiasing, soft vector curves, blur, halftone circles, mosaic outlines, noise overlay or CRT scanlines. The result should look intentionally drawn in retro pixel art, not merely low-quality JPEG.
Output one wide 2:1 PNG with the SAME framing. No text, logos, UI, white brush, border or vignette.
This is an animation SKY layer. Preserve only the existing blue sky and pink-lit clouds in their exact positions and shapes. No terrain, mountains, birds or objects. Keep it entirely opaque and fill all four edges. Use the same square pixel size and palette behavior as a 296-by-148 logical-pixel landscape. No new cloud clusters or changed composition.
```

# Pricing manga landscape

Created 2026-09-28 with the built-in image-generation tool.
The user rejected the pricing desk sketches and asked for the Japanese manga
background style used on the landing page. Blog was explicitly left unchanged.

Style reference: `packages/web/public/landing/blue-mountains-v1.png`.
Output: `packages/web/public/landing/pricing-manga-v1.png`.
The new scene is a distinct valley/lake composition, blending into white behind
the existing HTML cards. No prices, captions or other text are baked into it.

## Generation prompt

```text
Use case: stylized-concept.
Asset type: decorative scenic illustration behind the top of Rabbit Hole's Pricing webpage. Artwork only, not a website mockup.
Input image 1 is a STYLE AND PALETTE REFERENCE: use its hand-painted Japanese animation / full-color manga scenic-background treatment, clear cobalt and cerulean blues, layered indigo atmospheric distance, delicate rose-pink sunlight, confident brushwork and designed landscape silhouettes. Create a new composition, not a duplicate of that mountain vista.

Paint a beautiful, quietly expansive blue mountain valley with a luminous winding river and a still alpine lake, viewed from a high green-blue rocky ridge at the RIGHT edge. Layered forested ridges recede into blue distance; one elegant snow-edged peak and pale pink-edged clouds rise in the upper-right region. A slender walking trail curves along the right-hand ridge toward the distance. Calm, inviting and adventurous, the same painted world as the reference. No people or animals. Keep fine rock, evergreen and water details, visible painted color planes, subtle warm light and rich blue atmospheric depth. Do not use technical/diagrammatic drawing.

Important webpage composition: wide approximately 2:1 landscape. The LEFT 40–45% must be predominantly clean white mist / empty white paper for the live Pricing heading and introduction. Put the clearest scenic silhouettes in the upper-right area so they are visible ABOVE the pricing cards, and let the right-edge terrain continue down beside them. The center/lower part will be covered by three real HTML cards. Feather the scene organically through pale mist into pure WHITE at the outer edges and along the lower quarter. It is a partial scenic canvas blended into a white page, not an opaque rectangular full-bleed landscape. No frame or visible image boundary. Keep enough blue/pink color in the scenic portion to retain the beauty and character of the reference.

No text at all: no labels, prices, equations, charts, notebook, calculator, pencils, desk objects, whiteboard diagrams, planetary diagrams, orbital rings, logo, UI, buttons or watermark. No rabbit mascot. No photorealism, 3D CGI, generic vector art, black-and-white line sketch or monochrome manga panels.
Output one high-resolution wide color landscape illustration.
```

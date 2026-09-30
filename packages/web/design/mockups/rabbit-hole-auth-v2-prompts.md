# Rabbit Hole authentication mockups v2

User request: keep the approved design and use only one hole in the artwork.

Status: visual mockups for review.
Mode: built-in OpenAI image generation tool, targeted image edits.
Date: 2026-09-29.

## Deliverables

- `rabbit-hole-sign-in-v2.png`
- The matching sign-up design is implemented using the shared auth-page artwork.

The left artwork now has one engraved opening. The sign-in and sign-up forms, copy, typography and layout are retained. Version 1 is preserved for comparison.

## Sign-in edit

Input: `rabbit-hole-sign-in-v1.png`.

```text
Use case: precise-object-edit.
Edit the supplied Rabbit Hole sign-in mockup. The user likes this design but wants ONLY ONE HOLE in the left artwork.

Change ONLY the illustration below the headline in the LEFT black panel.
The current engraving has TWO dark funnel mouths, one lower-left and another upper-right. Replace this two-mouth structure with ONE elegant large opening centered in the lower portion of the left panel, roughly at x=380, y=670 in this 1536x1024 image. All white and dusty-pink etched contour lines should sweep continuously toward this ONE black oval core. Remove the second upper-right cavity completely, replacing it with gently curving uninterrupted contour lines. Exactly one tunnel, one dark center, one opening. No fork, no second funnel, no smaller subsidiary hole, no paired circles.

Preserve the existing fine chalk-white engraving / stippled printmaking style, dusty-pink accent, near-black paper background, graceful sweeping shapes cropped by left and bottom edges, and convincing depth. It should look like the same artwork simplified to one hole, not a new illustration style.

Hard invariants: retain the entire RIGHT form panel unchanged, including all copy, typography, controls, spacing, colors, Google/GitHub icons and sign-in CTA. Retain the left Rabbit Hole wordmark, the headline "A good question is a way in.", and "Follow your curiosity." exactly. Do not change the division between panels, dimensions, form layout, background color, or framing. Return the complete edited 1536x1024 mockup.
```

## Sign-up edit prompt (not completed)

The image tool could not read the generated reference on this attempt. The user
then requested implementation; sign-up now uses the same single-hole asset as
all the other implemented auth screens. No separate v2 sign-up bitmap was saved.

Inputs: `rabbit-hole-sign-up-v1.png` (edit target), `rabbit-hole-sign-in-v2.png` (single-hole artwork reference).

```text
Use case: compositing / precise-object-edit.
Create an updated Rabbit Hole SIGN-UP mockup using the supplied two images.
Image 1 is the SIGN-UP mockup and the edit target.
Image 2 is the corrected SIGN-IN mockup and the exact artwork reference.

Replace ONLY image 1's left illustration below the headline with the single-hole illustration from image 2. Use that exact composition: ONE large black opening surrounded by fine etched chalk-white contour lines and a restrained dusty-pink rim, on near-black paper. Exactly one mouth and one dark core. Match image 2's position, scale, silhouette, engraving style, colors and sweeping contour lines as closely as possible. Do not add a second hole.

Preserve EVERYTHING ELSE in image 1: the whole right sign-up form, all typography, text, form fields, icons, social buttons, "Start exploring." heading, subtitle, "Create account" primary button, legal text and bottom "Already have an account? Sign in" link. Preserve "Back to site", the division between panels, white background and all spacing. Also retain the left "Rabbit Hole" wordmark, "A good question is a way in." headline and "Follow your curiosity." copy. Do not use image 2's sign-in form or its wording.

Return the complete 1536x1024 SIGN-UP mockup with only its illustration updated. No additional layout changes.
```

# Rabbit Hole authentication visual mockups v1

Status: visual concept for review. These images do not change the existing authentication flow.

## Deliverables

- `rabbit-hole-sign-in-v1.png`
- `rabbit-hole-sign-up-v1.png`

Both screens use an original engraved opening beside a clean form. Authentication options shown are email and password, Google, and GitHub. The concept uses a charcoal / white palette with restrained dusty-pink artwork, geometric display typography, thin control borders, and a black primary action.

Sign-up reuses the sign-in visual composition. No new backend, authentication integration, persistence, or app route is included in this milestone.

## Generation provenance

Mode: built-in OpenAI image generation tool.
Date: 2026-09-29.
Sign-in: new image.
Sign-up: targeted edit of the sign-in image to retain the same artwork and layout.

## Sign-in prompt

```text
Use case: ui-mockup.
Create ONE polished desktop sign-in page visual mockup for Rabbit Hole, an adaptive learning platform. This is a flat, straight-on website design screenshot, not a laptop scene, not a presentation board. Landscape 1536 x 1024 composition. High-fidelity, sharp readable UI typography, completely original art direction.

DESIGN:
Split screen: left 48% is a full-height near-black editorial artwork panel; right 52% is clean almost-white (#fafaf8) with a centered 400px-wide authentication form. Absolutely no enclosing card around the form. Precise generous spacing, restrained 1px gray input borders, 7px control corners. Display typography like Space Grotesk, UI typography like Inter. Black primary button. Restrained dusty pink accent confined to the artwork. The design feels curious, intelligent and quietly unusual, not a generic SaaS template.

LEFT:
Top-left at generous 48px inset: white wordmark "Rabbit Hole".
Below it a large beautifully typeset white headline, exactly:
"A good question
is a way in."
Under the headline a small subdued line, exactly "Follow your curiosity."
The lower two-thirds contains a spectacular original abstract opening: thin luminous chalk-white etched contour lines with pale dusty-pink edges form a gently twisting, off-center tunnel through a black paper surface. An oval opening at an oblique angle, widening toward the bottom-left foreground, tiny crosshatching and printmaking grain, a deep charcoal core. Sophisticated scientific-engraving meets paper sculpture, spatial depth without neon or glossy 3D. Keep the artwork predominantly black and white, dusty pink as a very restrained accent. Its large organic forms are gracefully cropped at left and bottom. It is not a floor hole, mascot, stairs, cloud, architecture, or literal rabbit. No extra diagrams, labels, decorative icons or invented microtext.

RIGHT:
Small top-right navigation text "Back to site" with a fine arrow.
Main form centered vertically with substantial breathing room:
Large heading exactly "Welcome back."
Muted one-line subtitle exactly "Pick up where your curiosity left off."
Two equal outlined social buttons side by side, readable labels "Google" and "GitHub", with recognizable small Google G and GitHub marks.
A thin line divider with centered label "or continue with email".
Label "Email" above a full-width outlined input containing "you@example.com".
Label "Password" above a full-width outlined input containing 8 black password dots; a discreet eye outline icon at its right edge.
Right-aligned small link "Forgot password?"
Full-width black button with white label "Sign in" and a small right arrow.
Centered below the button: "New here? Create an account" with the last three words dark and underlined.
The eye icon and all provider icons must be clean, anatomically irrelevant simple UI icons.

QUALITY:
All essential text exactly as quoted, no other copy, no tiny illegible filler, no badges, no testimonials, no pricing, no browser chrome, no shadows behind the entire screen, no thick rounded outer frame. Preserve generous whitespace and clear form hierarchy. One authentic, buildable web screen filling the whole image.
```

## Sign-up prompt

```text
Use case: ui-mockup / precise-object-edit.
The input is the approved-for-this-concept sign-in design reference, not a live functional screen. Create its matching SIGN-UP visual mockup by editing this image.

HARD INVARIANTS:
Keep the entire LEFT panel pixel-faithful: same Rabbit Hole wordmark, same headline "A good question is a way in.", same "Follow your curiosity." copy, same exquisite etched black/white/dusty-pink tunnel artwork, same panel width, same framing and colors. Do not redraw or replace its visual concept.
Keep the RIGHT panel's white background, width, typography family, form alignment, Google and GitHub buttons and their icons, divider, Email field, Password field, eye icon, thin borders, restrained corner radii, and top-right "Back to site" link. Same resolution and straight-on desktop screenshot framing.

CHANGE ONLY THESE FORM DETAILS:
1. Heading: replace "Welcome back." with "Start exploring."
2. Subtitle: replace existing subtitle with "One question can open a whole new world."
3. Password input: instead of the eight password dots, show muted placeholder "Create a password" and preserve the eye icon.
4. Remove the "Forgot password?" link; leave modest breathing room at this position.
5. Primary black button: replace "Sign in" with "Create account", preserve the right arrow.
6. Below the button, in a small readable gray single line, add "By continuing, you agree to our Terms and Privacy Policy." Underline "Terms" and "Privacy Policy". Adjust vertical spacing just enough to fit gracefully; do not shrink all the UI.
7. Bottom switch prompt: replace "New here? Create an account" with "Already have an account? Sign in", underline only "Sign in".

No full-name field, no repeat-password field, no extra elements, no badges, no testimonials, no fake functionality or success state. This is a polished matched pair, so the left art and overall layout should remain unchanged. Exact text spelling and very clear readable form hierarchy are required.
```

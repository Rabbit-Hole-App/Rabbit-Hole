# Rabbit Hole supporting pages and identity

## Scope

Add `/team`, `/privacy`, `/terms` and a branded `/404` to the existing public
site. Preserve the approved public-page navigation, fonts, imagery and animated
landing footer. Use the existing six-ellipse FAQ aperture as the brand mark;
the browser icon is white on black, with no light/dark color reversal.

The user cancelled Contact in favor of `mailto:hello@tryrabbithole.dev`. There
is no Contact page or form. Footer navigation uses singular **Team**, linking
to a separate `/team` page, not the Teams pricing package. Team is a layout
preview until names, roles, biographies and portraits are supplied. Never invent
employee identities or credentials. X and LinkedIn icons are present but unlinked
until the user supplies verified profile URLs.

Privacy and Terms are readable draft documents with section links, a prominent
draft notice and no effective date. They must not claim verified compliance,
invent a legal operator, jurisdiction, provider list, retention period, model
training policy or contact channel. Those business details require confirmation
before publication as final documents. Link to them without a false acceptance
claim from the UI-only auth flow.

## Design and integration

Reuse Space Grotesk / Inter, white paper, charcoal text, thin borders and quiet
pink focus accents. Team has an editorial introduction and profile layout. Legal
pages share a document template with a contents navigation and a readable prose
column. The 404 uses the aperture as its central zero and offers home/features
links. Mobile stacks content; links and controls remain keyboard accessible.

Add Manifesto, Team, Privacy, Terms and social/email icons to public/auth footers without removing existing
links. Align the shared footer Get started link with `/sign-up`. Reuse the mark
in header wordmarks, static footer wordmarks, auth branding and the 404. Preserve
the landing FAQ artwork and footer animation. Public pages explicitly load new
versioned SVG/PNG favicons and touch icon; existing Small app icons stay intact.

The signed-in app's tab (`main.jsx`) uses `favicon-v3.svg` and `favicon-32-v3.png` (owner, 2026-10-08: "the icon in
the chrome browser seems to be small", then "the logo in the chrome tab should have rounded corners"): v1's aperture,
centred and 1.2x larger so its rings fill the tile, on a tile rounded to a quarter of its side (rx 60 of 240, about
4 px at 16 px) so the corners read as rounded in the tab. A new name each time, so no cached icon lingers. The public
pages and the in-app marks keep v1; `src/tab-icon.test.mjs` pins the swap.

The session worker returns status 404 for `/404` and unknown public HTML pages.
Existing API, auth, test, app proxy, Slack and static-asset behavior is preserved.
Unknown routes are only replaced after the existing backend returned 404.

## Source guidance for draft presentation

- [ICO: drafting privacy information](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/the-right-to-be-informed/how-should-we-draft-our-privacy-information/)
  — plain language and a layout with clear sections; actual processing facts must
  be established before the notice can be finalized. This is presentation
  guidance, not an assumption that UK law governs this product.
- [FTC: Privacy and Security](https://www.ftc.gov/business-guidance/privacy-security)
  — avoid privacy promises that have not been verified against the product.

## Verification

Build and deploy to `small-cp-dev-smart-landing-page` with both existing dev
flags. Check desktop/phone screenshots, legal anchors, keyboard navigation,
header menu, footer destinations, absent Contact links,
favicon files and white-on-black rendering, HTTP 404/HEAD behavior, and preserved
API/auth/assets. No real messages or model calls during verification.

Verified 2026-09-29 on the actual deployed clone, version
`3241f91a-6918-4bba-901b-96110e042199`. Build passed (existing chunk-size warning).
138 browser/HTTP checks passed at widths 1440, 1024, 768, 390 and 320. Screenshots
reviewed for the Team and legal layouts, mobile 404, public/auth footers and icon.
Legal anchors clear the header, the mobile menu supports Escape, and keyboard
skip links work. Unknown public pages and `/contact` return the branded 404;
HEAD has no body. Existing email login, API errors and static failures are intact.
Evidence: `tmp/support-pages/deployed/results.json` and adjacent screenshots.

Real Team profiles and X/LinkedIn destinations are pending user input. Legal
documents remain drafts. The email link opens the visitor's mail client; no
mail delivery service was built or tested.

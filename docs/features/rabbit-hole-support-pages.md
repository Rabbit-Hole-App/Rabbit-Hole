# Rabbit Hole supporting pages and identity

## Scope

Add `/privacy`, `/terms` and a branded `/404` to the existing public
site. Preserve the approved public-page navigation, fonts, imagery and animated
landing footer. Use the existing six-ellipse FAQ aperture as the brand mark;
the browser icon is white on black, with no light/dark color reversal.

The user cancelled Contact in favor of `mailto:hello@tryrabbithole.dev`. There
is no Contact page or form. X and LinkedIn icons are present but unlinked
until the user supplies verified profile URLs.

**Team removed (owner, 2026-10-29).** The public `/team` page, its build entry
(`design/rabbit-hole-team.html`, `src/landing/team.css`) and its routes in
`vite.config.js` and `dev-worker.js` (which `app-worker.js` reuses in production)
are gone, and the footer no longer links it: `/team` answers the branded 404 like
any unknown page. Workspace/team features and the Teams pricing package are
unchanged. `e2e/production-bundle-check.mjs` fails if the Team page ships again.

## Privacy Policy and Terms of Use (owner, 2026-10-29)

Titles "Privacy Policy" / "Terms of Use", subtitles "How Rabbit Hole handles your
information." / "The terms for using Rabbit Hole." Present-tense statements of
what the product does now, each checked against the code and production config
on `main`; short paragraphs and bullet lists (a section block that is an array
renders as a list); body text in `--fg`. Each page keeps a **Not yet final**
notice naming what is missing (legal operator and address; for Terms also
eligibility) until the owner supplies it; the effective date is added when the
final content is published. Never invent an age requirement, refund rule,
governing law, liability provision, deletion deadline, security guarantee or
"never used for training".

Provider practices are quoted only where the provider's official page states
them (read 2026-10-29):

- Anthropic, training: https://privacy.claude.com/en/articles/7996868-is-my-data-used-for-model-training
  ("By default, we will not use your inputs or outputs from our commercial products to train our models").
- Anthropic, retention: https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data
  (API inputs and outputs deleted within 30 days, with listed exceptions).
- OpenAI: https://developers.openai.com/api/docs/guides/your-data ("data sent to the OpenAI API is not used to
  train or improve OpenAI models" unless opted in; abuse-monitoring logs up to 30 days, images endpoints 30 days).
- Cloudflare Web Analytics (its beacon is on every production page): https://developers.cloudflare.com/web-analytics/data-metrics/core-web-vitals/
  and https://developers.cloudflare.com/speed/observatory/rum-beacon/ (no cookies or localStorage).

Google's Gemini API terms could not be retrieved, so the policy names Google as a
provider without describing its retention or training practice. Providers whose
production key is optional and not installed (Exa, Pexels, FAL, HeyGen) are not
listed.

## Design and integration

Reuse Space Grotesk / Inter, white paper, charcoal text, thin borders and quiet
pink focus accents. Legal
pages share a document template with a contents navigation and a readable prose
column. The 404 uses the aperture as its central zero and offers home/features
links. Mobile stacks content; links and controls remain keyboard accessible.

Add Manifesto, Privacy, Terms and social/email icons to public/auth footers without removing existing
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

X/LinkedIn destinations are pending user input. Legal
documents are not final until the operator details and effective date are added. The email link opens the visitor's mail client; no
mail delivery service was built or tested.

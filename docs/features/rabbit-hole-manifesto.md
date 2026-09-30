# Rabbit Hole manifesto — editorial revision

## Review deployment update (2026-09-30)

The user explicitly authorized publishing everything on this branch to
`https://small-cp-dev-smart-landing-page.zeroshothq.workers.dev/` for review.
This is a clone-deployment exception to the hold, not authorization for login,
shared-data actions, a main-branch merge or live promotion.

Published version: `e2d120bb-d0b5-4ba5-936b-bb89bb6f0a97`.
The preview's final line now reads **No fixed path. No final lesson.**, with the
second sentence highlighted. Authored page copy, browser titles, tooltips and
lesson examples no longer use em dashes. Structural parser delimiters and
source-reference compatibility remain intact. Existing user/source content is
not rewritten. The Figma review above predates this small copy follow-up.
Local build and `make test-unit` passed before publication.
Deployed read-only verification passed on 16 public routes at desktop and phone
widths (32 page checks): expected status codes, no visible em dashes or title
em dashes, no horizontal overflow, updated manifesto copy, all three learning
depths and compact Overview. No browser errors or write requests. Evidence:
`tmp/review-deployed/results.json` and adjacent desktop/mobile captures.

## Scope and handoff (2026-09-30)

Landing branch only: `feature/smart-landing-page`, based on HEAD `d61a9133`.
Replace the landing preview and full manifesto essay with the supplied thesis:
AI changes the constraint; learning can adapt in depth and direction, preserve
context, and test understanding. More generated content is not the goal.
No auth, backend, production, deployment, push or merge in this milestone.
The P0-B security hold supersedes normal dev-deployment instructions.

## Copy and layout decisions

- The user's last title override is **Every answer opens another question.**
  The landing preview contains exactly the supplied two paragraphs before its
  relative `/manifesto` link; `another question.` and `Learning should too.`
  retain the existing brick-red highlight treatment.
- The full essay uses the supplied seven short section labels and body copy.
  The AI-native introduction explicitly says **What we are building:** to avoid
  presenting future adaptive capabilities as already shipped.
- Keep the existing monochrome Socrates and Richard Feynman portraits and
  exact **Imagined portrait** captions. They anchor teaching principles, not
  endorsements. No new image generation.
- Preserve vertical rules, warm neutral palette, existing `#b4423b` highlight
  bands with cream text, and the restrained scroll-built stairs. The stairs
  remain clipped to the article before the footer.
- The six need/response pairs use an editorial ruled list, not feature cards.
  Only the requested verbs receive red highlighting.
- Closing CTA uses `/`, avoiding dependence on a temporary Workers hostname.
- Mobile keeps intentional hero/closing breaks, stacked portraits and narrow
  prose; no horizontal scrolling at 320px or 390px.

## Local verification

64 browser assertions passed at 1440px, 390px and 320px, including exact preview
copy, seven essay sections, future framing, six highlighted verbs, portrait
captions, relative links, original red, overflow and footer clipping. No page
errors. Workers hosts and API/auth/test routes were blocked during local QA.
Evidence: `tmp/manifesto-review/local/results.json` and the adjacent PNGs.

The same check also verifies the requested compact Overview canvas follow-up:
inactive depths no longer reserve the largest scene's height. Guided can grow
for linked cards; Overview's video controls stay above its composer.

Requested Figma views: landing preview; desktop hero, Socrates, Feynman,
AI-native shape and closing; mobile hero and closing. Review captures must
come from the local implementation while the deployment hold remains active.
Figma destination: Rabbit Hole organization, **Rabbit Hole · Manifesto review**.
Review section: https://www.figma.com/design/6awfPOxLviwxPfrtJy6575?node-id=20-2
All eight requested views are present. Desktop captures use a 1440px viewport;
mobile captures use 390px. Section crops therefore have content widths smaller
than the viewport. Text remains editable. Decorative staircase backgrounds were
captured separately because the importer omitted that sibling canvas; imported
inline-highlight wrapping was corrected using exact local DOM text geometry.
No page redesign was made in Figma. Final Figma overview was visually inspected.

Final local build passed with both dev preview flags and the existing license.
Temporary Figma capture instrumentation was removed before the final build.
Build evidence: `tmp/manifesto-review/build.log`.

## Files changed by this pass (full paths)

- `C:\Users\cyudhist\Desktop\workspace\smart-landing-page\packages\web\design\rabbit-hole-hero.html`
- `C:\Users\cyudhist\Desktop\workspace\smart-landing-page\packages\web\design\rabbit-hole-manifesto.html`
- `C:\Users\cyudhist\Desktop\workspace\smart-landing-page\packages\web\src\landing\pink-cloud.css`
- `C:\Users\cyudhist\Desktop\workspace\smart-landing-page\packages\web\src\landing\manifesto.css`
- `C:\Users\cyudhist\Desktop\workspace\smart-landing-page\packages\web\src\landing\adaptive-softmax.css`
- `C:\Users\cyudhist\Desktop\workspace\smart-landing-page\docs\features\rabbit-hole-manifesto.md`
- `C:\Users\cyudhist\Desktop\workspace\smart-landing-page\docs\features\rabbit-hole-adaptive-demo.md`
- `C:\Users\cyudhist\Desktop\workspace\smart-landing-page\docs\features\coaching.md`

This milestone is uncommitted and awaits review. Existing unrelated worktree
changes are preserved. HEAD `d61a9133` is the earlier approved Softmax commit.

## Follow-up: quotations and readability (2026-09-30)

The landing preview now replaces the provisional closing slogan with the two
user-selected quotations below the shared portrait. Each has a named attribution
and source link: Socrates in Plato's Theaetetus, 155d, and Feynman's Caltech
blackboard. They sit side by side on desktop and stack on mobile. Existing red
highlight bands emphasize Wonder and understand.

Manifesto prose, small captions and list prompts use medium weight (500).
Vertical editorial rules are solid 2px warm gray instead of translucent 1px.
The cloud headline is now "Follow your curiosity." to avoid repeating the
landing manifesto's question-and-answer headline.

Files for this follow-up:
- `C:\Users\cyudhist\Desktop\workspace\smart-landing-page\packages\web\design\rabbit-hole-hero.html`
- `C:\Users\cyudhist\Desktop\workspace\smart-landing-page\packages\web\src\landing\pink-cloud.css`
- `C:\Users\cyudhist\Desktop\workspace\smart-landing-page\packages\web\src\landing\manifesto.css`

The user's renewed request to review on the named clone authorizes this review
deployment. Auth and shared-data writes remain excluded; no merge or production
promotion. The earlier Figma capture predates these follow-up edits.

Build passed with both dev flags. Deployed review version:
`7ec9ffc6-c638-4cbc-a143-98f8a43e7883`. Read-only browser checks passed on `/`
and `/manifesto` at 1440px, 390px and 320px, verifying exact quotations,
source links, cloud headline, computed weight/rule width and no horizontal
overflow or page errors. Desktop/mobile screenshots were inspected.
Evidence: `C:\Users\cyudhist\Desktop\workspace\smart-landing-page\tmp\quote-review\results.json`.

## Final review follow-ups (2026-09-30)

Both selected quotations are italic, with upright attributions and source links.
The cloud headline now reads Build / Learn, with one arrow in each direction,
replacing Follow your curiosity. The final manifesto chapter has a Next step
subheading: today's focus is coding and AI, with science, law, economics and
other fields described as the ambition rather than shipped capabilities.

Review deployment: `4c417af8-9a80-43af-a965-1b096104e18f` on the existing
`small-cp-dev-smart-landing-page` clone. Build passed; read-only browser checks
verified quotes, the two-way headline and the exact Next step paragraph at
desktop/mobile widths. Screenshots were visually inspected. No auth/shared-data
writes, merge, or production promotion. This handoff commits the reviewed source;
earlier notes describing it as uncommitted refer to the previous review stage.

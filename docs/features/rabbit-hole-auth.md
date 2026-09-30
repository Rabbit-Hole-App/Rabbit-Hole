# Rabbit Hole authentication UI

## Approved scope

Implement the approved split-screen visual mockup with a single engraved hole.
Email/password, Google and GitHub are UI only in this milestone. No new auth
backend, mail delivery, OAuth, tokens, persistence or account creation.

## Pages and navigation

- `/sign-in`: email/password, social choices, password visibility, recovery link.
- `/sign-up`: email/password, social choices, password guidance, sign-in link.
- `/forgot-password`: email form leading to a labelled confirmation preview.
- `/check-email`: reset-email confirmation preview, resend feedback, change-email
  link and a preview link to the reset form.
- `/reset-password`: new/confirmed password, visibility controls and validation.
- `/password-updated`: labelled completion preview and return to sign-in.

Public Get started links lead to sign-up. Existing `/login`, `/auth` and `/apps`
stay available; the auth footer links to the existing workspace. Forms never send
credentials. Social/sign-in/sign-up actions report that they are not connected.
Recovery confirmation screens explicitly state that no email was sent and no
password was changed. Do not claim authentication has succeeded.

## Shared design

One HTML shell and common form helpers serve all six routes. Desktop is a 49/51
split with the original charcoal/white/dusty-pink engraved art and clean forms.
Use the public site's Space Grotesk display and Inter UI fonts. Palette: charcoal
`#0a0a0a`, paper `#fafaf8`, secondary text `#686868`, control border `#b6b6b3`,
focus pink `#e7b4c3`, error `#a12e31`. Keep form labels left-aligned, heading and
secondary navigation centered, control corners restrained. The artwork is the
one expressive element; no extra animated decoration.

On phones, the panel becomes a compact masthead above the form. Preserve legible
type, 44px targets, keyboard focus, associated labels and inline errors. Motion is
limited to button feedback and a short page arrival; reduced motion removes it.

## Validation

Check the actual deployed routes at 1440, 1024, 768, 390 and 320px. Exercise sign
up/in navigation, invalid and valid forms, both social controls, all password
visibility controls, matching/mismatching reset passwords, forgot → check-email
→ reset → completion → sign-in, browser back and direct route reloads. Confirm
no auth/API requests and no email/password values in URLs, browser storage or
logs. Inspect screenshots, focus visibility, reduced motion, errors and overflow.
Verify the original login still serves its email-link form and public content
pages still load. Deploy only this worktree's clone.

## Verified result

Deployed to `https://small-cp-dev-smart-landing-page.zeroshothq.workers.dev` as
version `52abf882-e1c8-4eb8-aac1-e91ea6b87ed4`. Browser checks passed all six routes
at the five specified widths, plus the interaction, keyboard/reduced-motion,
network, public-CTA and original-login checks above. The new routes accept GET
and HEAD and reject POST. Local evidence: `tmp/auth-pages/deployed-verification.json`
and screenshots. Authentication itself remains outside this UI-only milestone.

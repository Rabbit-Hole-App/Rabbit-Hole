# Learn feedback button

A button lets a learner report a bug or suggest a feature. `FeedbackButton.jsx`
is used in two places:

- **Learn canvas:** at the lower left, beside the zoom controls, never over
  the composer; on a phone it shares their row. It passes `app` and `board`,
  and the panel opens upward.
- **Sidebar rail** (smart-home, on Home, Library and Explore): no app, and
  `placement="right"` opens the panel beside the button, bottom-aligned.

## Using it

1. Press the icon to open **Send feedback**.
2. Choose **Report a bug** or **Suggest a feature**.
3. Describe it in up to 2000 characters, then **Submit**.

The button then turns into a tick ("Sent, thank you. Your reference is RH-7QK2-M9XD", where the server gave one) for a moment. There is
no corner toast.

## What is stored

`POST /api/learn/feedback` (`packages/control-plane/src/learn-feedback.js`,
routed by the dev worker) checks access first. With an app, it is the same app
access check as every Learn route. Without one, the sender only has to be a
signed-in workspace member (`repositoryIdentity`), and the report stores
`app: null`. It then writes one JSON
object per report to Learn media (`learnMedia(env)`) at
`learn-feedback/<YYYY-MM-DD>/<timestamp>-<id>.json`. Each object holds:

- the kind (bug or idea) and the text;
- the app, org and email of the sender: `email` is the account's application principal, which is `user@<id>.rabbithole.invalid` for
  an account that only signed in with Google or GitHub, so the report also holds `userId` (the session user's id), `contact` (the real
  address, below) and `handle` (the sender's @handle when they chose one). All are resolved on the server, never read from the request;
- the board, page path, screen size and user agent;
- a support reference (`ref`, like `RH-7QK2-M9XD`), also returned to the browser and shown on the button's confirmation, and the
  page's latest browser-error fingerprints and failed-request trace ids when it has any (`diagnostics`, hex ids only). A
  `support.report` telemetry event carries the reference and those ids, never the text
  ([telemetry.md](telemetry.md) "Browser errors").

Where reports land. Both Workers bind `LEARN_MEDIA` and `learnMedia(env)` returns it before it would fall back to `RUNS`
(`small-runs`). In production, `packages/web/wrangler.rabbit-hole-prod.jsonc` binds `LEARN_MEDIA` to
**`rabbit-hole-prod-learn-media`** (as does the control plane's config), so production reports are under
`learn-feedback/` in that bucket. Earlier text said production had no `LEARN_MEDIA` and used `small-runs`; that was true
before the Rabbit Hole production Workers existed and is no longer. On dev and review it is `rabbit-hole-dev-learn-media`.
There is no in-app list. To read reports, use the owner launcher in `C:/s/spec/feedback-mail/` (a read of the bucket) or the
R2 dashboard.

### The sender's contact address

`email` is not a contact for an OAuth-only account. The real address is `user_identities.provider_email` in the main DB (`DB`),
read by `senderContact` (`learn-feedback.js`) the way `auth.js` `sessionDisplay` reads it: the newest identity of the signed-in
user whose address is deliverable. A Google address counts as verified (sign-in requires `email_verified`), an emailed
sign-in's principal is itself the proven address, and a GitHub profile address is kept but marked `verified: false`. No
address (or only a `.invalid` one) stores `contact: null`.

## Email to the owner

After the report is stored, `feedbackFetch` asks the control plane to mail it: the app Worker has no `RESEND_API_KEY`, so it
sends `POST /api/feedback/notify {key}` through the `CONTROL_PLANE` binding with the sender's own session cookie
(`feedback-mail.js`). The control plane checks that session, loads the report from storage by that key, and only if it is
the caller's own report from the last 10 minutes sends it with the existing `sendEmail` (Resend, `EMAIL_FROM`). Nothing but
the key comes from the request; the recipient is the plain var **`FEEDBACK_NOTIFY_TO`** in
`packages/control-plane/wrangler.rabbit-hole-prod.jsonc` (`yudhisteer.chin@gmail.com`). The mail is sent from `EMAIL_FROM`, `Rabbit Hole <hello@digrabbithole.com>` (owner decision 2026-11-03, one sender for every app email; Cloudflare Email Routing forwards hello@ to the owner's Gmail, so a reply to the mail itself also reaches the owner). Empty or absent means no email, and
there is no recipient in code. Dev and review set none, and a dev worker's control plane binding refuses the request anyway.

- Subject `[Rabbit Hole] Bug report RH-XXXX-XXXX` or `[Rabbit Hole] Feature suggestion RH-XXXX-XXXX` (the reference is checked
  against its format; a kind or reference that does not match falls back to `[Rabbit Hole] Feedback`). Plain text only.
- Body: kind, reference, time, the text, the sender (@handle and verified contact address, account id), page, app, board,
  screen size, browser, diagnostics ids and the stored object key. A share link's token in the page path is replaced by `[token]`.
- `Reply-To` is the sender's contact address only when it is verified and deliverable; never the `.invalid` principal.
- Best effort: the report is stored first, and a mail failure of any kind is logged (status only, never content) and cannot
  fail or lose the report. Resend's idempotency key is the report id, so a repeat is dropped.
- A sender whose limit could not be checked (bucket error) is stored but not mailed.

## Limits

One account may send **5 reports per UTC hour and 20 per UTC day** (`HOURLY`, `DAILY` in `learn-feedback.js`; owner decision,
see the hand-back). Past that, the route answers 429 with "You've sent a lot of feedback in a short time. Please try again later.",
which the panel shows (the text is kept); nothing is stored or mailed. The count is a set of numbered slot objects under
`learn-feedback-limit/<hash of the account>/<hour or day>/<n>`, each created only if absent (R2 `If-None-Match: *`), so a burst of
parallel requests cannot pass the limit and no D1 migration is needed. Fixed windows, and the slot objects are never deleted
(at most 25 tiny objects per account per day); add an R2 lifecycle rule on that prefix if it matters. The prefix is not under
`learn-feedback/`, so listing reports does not include it.

## Checks

- `packages/control-plane/test/learn-feedback.test.js`:
  - validation;
  - the access check comes before storage and before any limit slot;
  - the stored shape, including `userId`, `contact` and `handle`, and that nothing identity-like comes from the request;
  - the bucket production writes to (`LEARN_MEDIA`, then `RUNS`);
  - sender address resolution for email, Google, GitHub-only and missing-address accounts;
  - the owner mail is requested after storage with only the key, and a failure of any kind does not lose or fail the report;
  - the hourly and daily limits, per account, including a parallel burst, and the 429.
- `packages/control-plane/test/feedback-mail.test.js`: mail composition, recipient only from `FEEDBACK_NOTIFY_TO`, header
  injection and share-token redaction, Reply-To rules, ownership and freshness, and the real `/api/feedback/notify` route
  through the worker with a faked Resend.
- `packages/web/e2e/feedback-check.mjs` (runner `fork`, local stack only, no mail possible): canvas button placement at
  desktop and phone size; a bug and a feature suggestion from the sidebar and from a canvas, each stored (201) and confirmed on
  the button with its reference; the sixth report in an hour refused with the friendly message.

Not covered by any check: real delivery by Resend to Gmail, and the production bucket. Both are verified by the owner with the
checklist in the hand-back (production verification with the `@yuvish_demo` account).

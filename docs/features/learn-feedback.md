# Learn feedback button

A button at the lower left of the Learn canvas lets a learner report a bug or
suggest a feature. It sits beside the zoom controls and never covers the
composer; on a phone it shares their row.

## Using it

1. Press the icon to open **Send feedback**.
2. Choose **Report a bug** or **Suggest a feature**.
3. Describe it in up to 2000 characters, then **Submit**.

The button then turns into a tick ("Sent, thank you") for a moment. There is
no corner toast.

## What is stored

`POST /api/learn/feedback` (`packages/control-plane/src/learn-feedback.js`,
routed by the dev worker) checks app access first. It then writes one JSON
object per report to Learn media (`learnMedia(env)`) at
`learn-feedback/<YYYY-MM-DD>/<timestamp>-<id>.json`. Each object holds:

- the kind (bug or idea) and the text;
- the app, org and email of the sender;
- the board, page path, screen size and user agent.

On dev and review, Learn media is the `small-learn-media-dev` bucket.
Production has no LEARN_MEDIA binding, so there it would write to `small-runs`,
Learn media's production home. Reading the reports means browsing that prefix
in the R2 dashboard. There is no in-app list yet.

There is no rate limit. Add one if the button is ever abused.

## Checks

- `packages/control-plane/test/learn-feedback.test.js`:
  - validation;
  - the access check comes before storage;
  - the stored shape;
  - the live bucket is never touched on dev.
- `packages/web/e2e/feedback-check.mjs`:
  - placement at desktop and phone sizes;
  - one real report (201);
  - the in-place confirmation.

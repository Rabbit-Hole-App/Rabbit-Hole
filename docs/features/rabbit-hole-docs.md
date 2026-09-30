# Rabbit Hole developer documentation

Scope confirmed by the user's approved docs direction and request for the existing
CLI, API and BYOC workflows, plus a Docs item beside Blog, Features and Pricing.
The large mockup illustration is omitted pending a clearer art direction.

## Interface

The public `/docs` entry uses the approved ivory field-guide layout, existing
Rabbit Hole mark and site header/footer. The article is flanked by a chapter
index and an in-page contents rail. Both desktop panels reuse
`ResizableSidePanel`, with drag and keyboard resizing. Its new bounds/edge
options retain the existing defaults for app consumers. Mobile uses `SlidePanel`
for navigation, focus containment and collapsible article contents.

Local search opens from the toolbar or Ctrl/Cmd K. Code examples reuse the app's
`CodeBlock` and token coloring; copy buttons preserve the command text. Copy page,
deep-linked headings, previous/next pages and browser Back are supported.
No search service, credential form, model inference or API execution is added.

## Pages and sources

| Route | Content |
| --- | --- |
| `/docs` | Introduction and three-command entry point |
| `/docs/quickstart` | Install, sign in, deploy and select a workspace |
| `/docs/cli` | Runs, logs, sharing, schedules, Watch and runbooks |
| `/docs/configuration` | Runnable Python job and small.toml example |
| `/docs/api` | Current-origin base URL, authentication and hosted endpoints |
| `/docs/api/runs` | Job inputs, polling and output downloads |
| `/docs/byoc` | Hosted AWS connection vs private installation |
| `/docs/byoc/private` | Cognito, capabilities and private deployment workflow |
| `/docs/byoc/permissions` | Exact grants, owner approval and current limits |

Content is authored in `packages/web/src/landing/docs-content.js`, grounded in
the [source audit](rabbit-hole-docs-source-map.md). Existing `small-deploy` and
`small` package/command names remain unchanged. Examples select the current
preview's origin instead of copying another session clone's address.

Hosted `/api/runs` examples explicitly exclude AWS jobs. No installation-specific
account IDs, stack names or private customer URLs are published. The docs describe
repository capabilities; they do not imply infrastructure has been provisioned
or every installed release supports every capability.

## Routing and verification

Vite and the session worker share the known route list. Public GET/HEAD serve
the docs shell, POST returns 405, and unknown chapters use the existing branded
404. App authentication/API routing remains in place.

Browser checks: `tmp/docs-pages/check.mjs`, with screenshot/result directories
for local and deployed runs. Coverage includes all nine chapters at 1440, 1024,
768, 720, 390 and 320 pixels; copy, search, history, resize, deep links, mobile
drawer/focus and Docs links across the existing public pages. Windows clipboard
line endings are normalized in the assertion without changing copied content.

`tmp/docs-pages/check-examples.mjs` validates the actual CLI TOML parser and input
schema, then runs the documented greeting script locally with the runner's
output-directory contract. No job deployment, AWS mutation, login email or paid
model call is part of documentation verification.

Deployment evidence is recorded in [Coaching release history](coaching.md).

# Coaching UI and dev deployment

Coaching helps builders and colleagues understand how an app was built through
the app's Agent tab. This release adds an inspection UI with sample data around
the existing chat. Capture and extraction are not connected in this UI release.

## Views

| Tab | Current behavior |
| --- | --- |
| Chat | Original AskPanel: real chat, History, New Chat, attachments, model/source controls, and Open as page. Opens by default and stays mounted while switching preview tabs. |
| Sessions | Full sample coding-agent conversations, including user messages, tool calls, and results. Each User message starts a container containing the subsequent agent and tool messages, with alternating gray and blue backgrounds. Search and filter by speaker. |
| Sources | Sample deployed code, documents, configuration, logs, and access information. Code uses the existing shared syntax highlighter. |
| Capture | Sample processing stages with inspectable input and output. |
| Decisions | Sample choices, reasons, alternatives, constraints, evidence, code anchors, gaps, and review status. |

The four inspection tabs show **Sample data / UI only**. They do not import
sessions, run extraction, call models, save decisions, or change approvals.
Their controls only navigate and inspect the handwritten fixtures.

The inspector's **Metadata** tab shows the selected input's source, type, name,
usage, version, message count, and processing flags. These currently describe
the sample data; real ingestion is not connected.

Conversation message IDs (for example, `m1`, `m4`, and `m7` for the first sample's
User messages) are unique within their session. IDs and timestamps remain visible.
Turn containers keep their original boundaries and colors when search or speaker
filters hide messages. Messages preceding the first User ask form a separate group.

Preserve the existing chat composer, History, New Chat, and navigation when
extending this UI. Adding a view does not authorize removing an existing control.

## Shared presentation

- Answer source footers render as evidence tags. File and run tags open the
  existing source and run views; unfamiliar references stay visible as text.
- Inspectors and evidence panels expand beside the sidebar. Breadcrumbs remain
  visible, and Minimize restores the preceding panel size. Escape first minimizes
  an expanded panel, then closes the normal panel.
- `ExpandedPageFrame` in `packages/web/src/ui.jsx` supplies the existing chat
  page dimensions: 780px maximum content width and 24px padding. Chat and expanded
  inspectors use this same frame.
- `colorLine` in `packages/web/src/code.jsx` is the existing tokenizer shared by
  chat code blocks, file previews, and sample deployed source.
- The enlarged chat page has a Minimize button returning to the app's Agent tab.
- Each sidebar app menu includes Share. It opens that app and its existing
  sharing popover, preserving editor controls and the viewer's read-only view.

## Environments

| URL | Behavior |
| --- | --- |
| https://small-cp.zeroshothq.workers.dev/apps | Existing Agent chat; the four inspection tabs are disabled. |
| https://small-cp-dev.zeroshothq.workers.dev/apps | All five tabs; the four inspection tabs contain sample data. |

Sign in on dev using the same work email used on live. Each host has its own
browser session. For example, Amazon apps require the Amazon login identity.

Dev serves a separate frontend for the existing app experience.
`packages/web/dev-worker.js` serves its own HTML and static assets, and forwards
authentication and existing app requests to `small-cp` through a service binding.
Existing chat and app actions use real shared data and the existing permissions.
The [AWS BYOC preview](byoc-aws.md) additionally handles `/api/byoc/*` with its own
connection-only D1 database and scoped AWS installer credentials. Customer job
data goes directly to AWS. Connected jobs appear in the existing Apps list and
sidebar and reuse the normal app Run and Logs views. Setup is inside Settings →
Connections. AWS Coaching is deferred; native apps retain the existing Agent UI.
This does not change the shared app database or add scheduled jobs.

The `VITE_COACHING_DEV=true` build flag enables the sample tabs. Default builds
leave them disabled. Keep them in dev until the user approves promotion to live.

## Deploy dev

Every requested UI addition or change includes a dev build and deployment for
the user's visual review. Complete these steps before reporting the UI change
as done, then provide its dev page link. This applies even when the same request
also asks for a commit and push. A separate deployment request is unnecessary.

From `packages/web`, in PowerShell:

```powershell
$env:VITE_COACHING_DEV = 'true'
$env:VITE_BYOC_DEV = 'true'
npm run build -- --outDir dist-dev
Remove-Item Env:VITE_COACHING_DEV
Remove-Item Env:VITE_BYOC_DEV
npx wrangler deploy --config wrangler.dev.jsonc
```

Stop if the build fails. The separate `dist-dev` output leaves the live `dist`
artifact untouched. `wrangler.dev.jsonc` deploys only `small-cp-dev`; live deploys
continue using the existing control-plane configuration.
Keep both flags enabled for the dev build so a Coaching UI deployment also
preserves the approved AWS app integration. Default builds disable both previews.

## Release and verification

The initial dev deployment on 2026-09-08 is version
`0d271549-04c1-4f73-b7fb-a42dbe24a7ec`. Its build succeeded and Wrangler confirmed
deployment. The user reviewed the dev app and approved committing the work.
The original deployment composed the approved UI with main `49c2a3d`; this change
brings that source and the deployment configuration onto main.

<!-- ponytail: browser and test-suite checks were skipped for the initial deployment at the user's request; commit verification is recorded below. -->

Before committing to main, `make test-unit` passed all 31 tests and
`npm run build` succeeded with the inspection flag off. The build reports the
existing large-chunk warnings. The sidebar Share shortcut was reviewed against
the existing navigation and sharing permission flow; no live shares were changed.

Commit `1270e70`, including the sidebar Share shortcut, was subsequently built
with the dev flag enabled and deployed as dev version
`8faca65f-b420-469d-a550-1282711d3afd`. Wrangler confirmed the deployment.

Conversation turn containers were built with the dev flag enabled and deployed
as dev version `52a64522-b2c2-497b-a02c-d6064bc1c209`. The build succeeded;
Wrangler confirmed deployment. Visual review is left to the user as requested.

The Details-to-Metadata label change was built successfully and deployed to dev
as version `09d5d4d3-4d03-4e8e-9b84-80a0f16a1d00`.

The AWS app integration was built with both dev flags and deployed as version
`f8d1a5fd-8465-438f-9c0c-e001b4003357`. The CPU job is available at
`/apps/aws-cpu-proof`; `/aws` redirects to Apps. AWS setup uses the existing
Settings → Connections flow.
The browser check exercised the shared AWS Run/Logs views and verified that a
native app still shows Chat, Sessions, Sources, Capture, and Decisions without
JavaScript page errors.

The AWS privacy tooltip and shared Settings row alignment were built with both
dev flags and deployed as version `6b6cbb42-be11-4d88-af03-9f1e7193ea1a`.
The existing tooltip helper now also opens when a contained control has focus.
Build and whitespace checks passed. The browser check could not launch because
Windows denied process creation; hover/focus and alignment remain for visual review.

The AWS **Connected** action and **Disconnect / Cancel** confirmation modal were
built and deployed as version `b752de5f-9b29-4506-a4a4-f76533ac79d9`. A subsequent
browser check passed for alignment, tooltip hover/focus, Cancel, confirmed
disconnect, and reconnect. Connection writes were stubbed during that check;
the real AWS app remains connected. Eight connection API tests and four web
adapter tests passed.

The multiple-app AWS release was built with both dev flags and deployed as
version `0b7d2218-1191-4edd-88b0-4bad5ba390f9`. One workspace connection now serves
`aws-cpu-proof` and `aws-word-count` in the normal sidebar and Run/Logs UI.
The browser proof verified the second app's actual run and output, preserved
the original app's output, and rejected record IDs used under the wrong app.
The five Coaching tabs and their dev-only inspection behavior are unchanged.

The customer AWS account setup was built with both dev flags and deployed as
version `4b948ace-3d68-43f2-b7f0-d4cdb19e6c28`. Settings → Connections → AWS accepts
a customer account ID and explains approval in AWS followed by verification in
Small. Browser checks passed for the simulated onboarding flow and the existing
connection controls; real reads confirmed both AWS apps still work. A live
installation in a second account remains for its account owner to approve.

Dev version `1a89d7d0-e42a-4cd5-8538-50e24fe12c42` removes the duplicate AWS
installation link. One button opens AWS, with a current-tab fallback when popups
are blocked. Both dev flags were enabled; build and focused browser checks passed.

The CLI workspace follow-up required a separately approved authentication fix in
the shared backend. `small-cp` version `2323101b-89d0-4691-917a-6c567debbd4d`
resolves CLI workspace membership through the existing browser resolver. The
deployment preserved the live frontend assets: no changed assets uploaded, and
all 133 files matched afterward. Dev remains on the version above; AWS/Coaching
preview UI and the updated CLI/skill remain dev-only, with npm publication held.

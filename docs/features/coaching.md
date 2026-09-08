# Coaching UI and dev deployment

Coaching helps builders and colleagues understand how an app was built through
the app's Agent tab. This release adds an inspection UI with sample data around
the existing chat. Capture and extraction are not connected in this UI release.

## Views

| Tab | Current behavior |
| --- | --- |
| Chat | Original AskPanel: real chat, History, New Chat, attachments, model/source controls, and Open as page. Opens by default and stays mounted while switching preview tabs. |
| Sessions | Full sample coding-agent conversations, including user messages, tool calls, and results. Search and filter by speaker. |
| Sources | Sample deployed code, documents, configuration, logs, and access information. Code uses the existing shared syntax highlighter. |
| Capture | Sample processing stages with inspectable input and output. |
| Decisions | Sample choices, reasons, alternatives, constraints, evidence, code anchors, gaps, and review status. |

The four inspection tabs show **Sample data / UI only**. They do not import
sessions, run extraction, call models, save decisions, or change approvals.
Their controls only navigate and inspect the handwritten fixtures.

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

Dev is a separate **frontend deployment**, not a separate database or backend.
`packages/web/dev-worker.js` serves its own HTML and static assets, and forwards
authentication and existing app requests to `small-cp` through a service binding.
Existing chat and app actions use real shared data and the existing permissions.
The dev Worker has no database bindings, copied secrets, or scheduled jobs.

The `VITE_COACHING_DEV=true` build flag enables the sample tabs. Default builds
leave them disabled. Keep them in dev until the user approves promotion to live.

## Deploy dev

From `packages/web`, in PowerShell:

```powershell
$env:VITE_COACHING_DEV = 'true'
npm run build -- --outDir dist-dev
Remove-Item Env:VITE_COACHING_DEV
npx wrangler deploy --config wrangler.dev.jsonc
```

Stop if the build fails. The separate `dist-dev` output leaves the live `dist`
artifact untouched. `wrangler.dev.jsonc` deploys only `small-cp-dev`; live deploys
continue using the existing control-plane configuration.

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

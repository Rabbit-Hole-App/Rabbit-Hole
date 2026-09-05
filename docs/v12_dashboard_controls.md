# v12 — dashboard controls: schedules, dark mode, s3 pickers (2026-09-05)

The app page grew up: Notion-style property list (Type · Deployed · Source ·
Owner · Schedule — the Access row is gone, the Share popover owns access),
a ⋯ menu with Copy link / Duplicate / Schedule / Move to Trash, and a set of
quality-of-life controls across the dashboard.

## Schedules without a redeploy

`POST /api/schedule` now also *sets* schedules (null removes). The ⋯ →
Schedule dialog offers every minute / hour / day / **specific days** (Mon–Sun
checkboxes) / raw cron, all UTC, split into "Scheduled" and "Add another"
sections. A job can hold **several crons** — `apps.schedule` is `;`-joined,
the every-minute tick fires when any part matches (still one run per minute),
and the property row shows every pill plus "next in 3h". A `small deploy`
still wins: small.toml's schedule (or its absence) replaces dashboard crons.
Scheduled jobs swap their ▷ for a clock everywhere.

## Dark appearance

Settings (workspace dropdown) → Appearance: System / Light / Dark, applied
before first paint, persisted per device. One `.dark` CSS-variable override
re-skins the whole kit — including BlockNote and Excalidraw, which follow the
`small:theme` event live.

## s3:// inputs stopped being typing exercises

Text inputs whose pattern mentions `s3://` autocomplete: the control plane
lists one level under the typed uri **with the app's own [aws] role** (SigV4
ListObjectsV2 — the browser never sees AWS creds). Click into an empty field
to browse buckets (ListBuckets when the role may, else buckets from past
runs), drill folders, ← goes up. Picked objects preview under the field —
images, pdf, json/csv/txt — via a role-scoped proxy with strict type and
size caps. The runs table shows s3 uris as their tail, full value on hover.

## And the rest

Folder view at `/apps?f=<folder>` (breadcrumb crumb + grouped Apps overview
with collapsible v/> groups), collapsible sidebar sections, private apps
regain Share behind a "moves to Shared" confirm, table rows open the app
page while the OPEN pill peeks, workspace menu no longer clips the email.

- ponytail: multi-cron shares one pause flag and one fire per minute — split
  into a schedules table when per-cron pause matters.
- ponytail: s3 browse shows only what the app's role can see — that's the
  security model, not a bug.

Details: `docs/features/web.md` §v12.

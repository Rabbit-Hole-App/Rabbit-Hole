# v15 — Slack adapter for Ask (2026-09-05)

A transport, not a new agent: every Slack message becomes a `/api/ask` call
as the real small user; every proposal becomes Run/Cancel buttons that call
`/api/ask/approve`. App manifest: `docs/slack-manifest.json`.

## Connecting

One-time, per control plane (operator): create the Slack app at
https://api.slack.com/apps → **From a manifest** → paste
`docs/slack-manifest.json`, then set three worker secrets and redeploy:

```
cd packages/control-plane
npx wrangler secret put SLACK_CLIENT_ID
npx wrangler secret put SLACK_CLIENT_SECRET
npx wrangler secret put SLACK_SIGNING_SECRET
```

Per org (any user): dashboard → workspace name → **Settings** →
**Connect Slack** → approve the OAuth install. Then in Slack:
`/invite @small` into a channel and optionally `/small link <app>`.

**Identity.** `users.info` → email → matched against the org that installed
the bot (domain or explicit member). No match → "I don't know you — sign in
at small.app with your work email first." and nothing runs. Slack identity
is never the actor.

**Routing.** `@small <question>` in a channel or a DM. `/small link <app>`
(edit-gated) binds a channel to an app → app scope; otherwise org scope with
the normal resolution, `choose` rendered as a Block Kit select. Replies
thread, and `thread_ts` maps to the Ask thread so follow-ups keep context.

**Slash command.** `/small link · unlink · runs [app] · run <app> --input
value · watch [app] · digest`.

**Proposals.** The card shows the tool and exact inputs; only the asker or
an editor can approve (the approve route re-checks edit for the clicker —
its asker-only filter was relaxed to org for this); anyone else gets an
ephemeral "only editors can run this". The message updates in place and
links the run page.

**Security.** Every inbound request is HMAC-verified (v0 signature, 5-minute
replay window) on the raw body before anything is parsed for real; unsigned
→ 401. OAuth install state is a signed token so the callback can't be
aimed at another org. Bot tokens live per org in D1.

**Watch.** A linked channel hears each new observation once; the Monday
digest also posts to the channel that ran `/small digest`.

Needs three worker secrets before Connect Slack works: `SLACK_CLIENT_ID`,
`SLACK_CLIENT_SECRET`, `SLACK_SIGNING_SECRET`.

- ponytail: image outputs post as run links (files.upload is deprecated; the
  external upload flow isn't wired).
- ponytail: digest channel set by `/small digest`, not /settings.
- ponytail: no Workflow Builder, no per-user DM digests, no file inputs via
  Slack upload.

Unit tests (mocked Slack): `packages/control-plane/test/slack.test.js`.

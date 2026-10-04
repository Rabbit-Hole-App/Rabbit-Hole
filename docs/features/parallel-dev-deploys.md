# Parallel dev deploys — one worker per agent session

Multiple coding-agent sessions, each in its own worktree, each need to deploy
and test without replacing what another session is testing. The shared
`small-cp-dev` worker cannot serve two branches at once — deploys clobber each
other, and it has already happened.

## The mechanism, verified 2026-09-22

Deploy under a **per-session worker name**:

```bash
cd packages/web
# env vars BEFORE the build, as always
npm run build -- --outDir dist-dev
npx wrangler deploy --config wrangler.dev.jsonc --name rabbit-hole-web-dev-<session>
```

That creates (or updates) `https://rabbit-hole-web-dev-<session>.tryrabbithole.workers.dev`
on the rabbit-hole account, with the same config, bindings and dev D1 as `small-cp-dev`
(P0-B Phase 2B, [rabbit-hole-dev.md](rabbit-hole-dev.md); test sessions now come from
`rabbit-hole-cp-dev`). Before 2026-09-30 clones lived on `*.zeroshothq.workers.dev`
(personal account, now quarantined). Verified working:
`small-cp-dev-parallel` serves the app and `/test/session` authenticates, so the
full review flow (test session, boards, screenshots) works against a clone.

Name by session (the worktree directory), kebab-case: `rabbit-hole-web-dev-moments`,
`rabbit-hole-web-dev-canvas2`.

**Naming (owner, 2026-10-04):**
- No new `small-*` resources.
- New clones are `rabbit-hole-web-dev-<session>`, after the planned Rabbit Hole name of
  the dev web Worker, `rabbit-hole-web-dev` ([rabbit-hole-production.md](rabbit-hole-production.md)).
- Not `rabbit-hole-cp-dev-<session>`: that prefix is the real dev control plane `rabbit-hole-cp-dev`, and a
  dropped suffix in `wrangler delete` would remove it.
- Existing `small-cp-dev` and `small-cp-dev-<name>` clones are legacy. They stay until their retirement
  checkpoint and are never renamed in place, and no new one is created.
- The clone `small-cp-dev-parallel` named below is one of those legacy clones; it is history, not the pattern.

## Rules

- **`wrangler deploy` with no `--name` is the shared dev worker.** Touch it only
  to promote something every session should see, and say so — it is the one
  URL the human reviews by default.
- **The dev D1 is still shared** across all clones. Data collisions are fine
  (test boards are namespaced), but a **schema migration** from one session
  changes the database under every other session. Announce migrations; never
  run one casually from a clone.
- **True wrangler secrets do not clone.** Config `vars` carry over; anything
  set with `wrangler secret put` on `small-cp-dev` is absent on a new name
  until set there too. A feature that silently needs a secret (e.g. the
  YouTube key) will show its no-credential path on a clone — that is the
  designed message, not a break.
- **Clean up when a session ends:**
  `npx wrangler delete --name rabbit-hole-web-dev-<session> --config wrangler.dev.jsonc`
  (or a legacy `small-cp-dev-<name>` clone you own)
- Live (`small-cp`) is untouched by all of this and keeps its own rules.

## Why not version preview URLs

`wrangler versions upload` would be lighter (no worker sprawl, one upload per
test), and `preview_urls: true` is now set in `wrangler.dev.jsonc` — but the
`<version>-small-cp-dev` preview hosts returned 404 on this account even after
a deploy and a triggers deploy. If previews start resolving later, prefer them
for throwaway checks; the per-name clone remains the proven path.

## The other half: branches

A clone isolates the *deploy*. It does not isolate *git*: all worktrees share
one repository, and `main` moves. Keep each session on its own branch, rebase
onto main before pushing, and never build from a branch that is behind main
without saying which of the two you intend to deploy.

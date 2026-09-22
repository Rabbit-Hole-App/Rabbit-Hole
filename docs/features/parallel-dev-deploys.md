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
npx wrangler deploy --config wrangler.dev.jsonc --name small-cp-dev-<session>
```

That creates (or updates) `https://small-cp-dev-<session>.zeroshothq.workers.dev`
with the same config, bindings and dev D1 as `small-cp-dev`. Verified working:
`small-cp-dev-parallel` serves the app and `/test/session` authenticates, so the
full review flow (test session, boards, screenshots) works against a clone.

Name by session or branch, kebab-case: `small-cp-dev-moments`,
`small-cp-dev-canvas2`.

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
  `npx wrangler delete --name small-cp-dev-<session> --config wrangler.dev.jsonc`
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

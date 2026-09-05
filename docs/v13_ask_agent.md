# v13 — Ask: chat reads, agent writes (2026-09-05)

One agent function in the control plane, scoped per question. It reads what
the asking user can read, and acts only after an explicit approval. Not an
agent loop — one model call per message.

## Phase 1: read

`POST /api/ask { scope: {org}|{app}|{run}, message, thread_id? }`. The Worker
assembles context for the scope from queries (permissions are enforced by
filtering context, never by the prompt), calls Anthropic once, streams SSE.
Threads and messages persist in D1; the Agent tab resumes the latest thread,
History lists past chats (rename/delete). Org-scope mentions resolve: one
match answers about it, several return a `choose`, never a guess.

Context includes the **deployed source** — the review bundle (import-walked,
gitignore-aware, redacted, ≤100k tokens) is persisted per deploy in R2, so
answers cite the code that actually shipped. Prompt rules: every code claim
cites `file:line`; not in the bundle → "not in the deployed code"; behaviour
questions trace the real path. Sources are clickable — the cited file opens
in a side panel, syntax-coloured, with the line range highlighted green.
`POST /api/ask/file` pulls one file on demand.

Run scope adds the full log, outputs, the diagnosis, and a unified diff of
code + small.toml between this run's deploy and the last successful one —
or "same deploy" instead of an empty diff. **Diagnose on failure**: a
non-zero exit triggers one model call; the sentence lands on the run row and
renders under the status pill.

## Phase 2: write, gated

Tools map one-to-one to existing routes — `run`, `run_again`,
`set_schedule`, `pause_schedule`, `resume_schedule`, `share`, `unshare` —
attached only when the asker has edit on the scope. A tool call never
executes: it becomes a proposals row and a card with the exact inputs and
Run / Change / Cancel. `POST /api/ask/approve` re-checks edit at that
moment, executes through the same internals as the buttons, and the row is
the log (who, what, when, thread). Approved runs render live in the chat —
log tail, outputs with image previews. Viewers get the same chat with no
tools; asked for an action, it names who has edit.

Chat extras: attachments (images/PDFs as model blocks — and an attached
image can *be* the file input of a proposed run), @-mention pills, a sources
picker (what the agent reads), a model picker, `⌘J` focuses the ask box,
`⌘K` grew an Ask tab. `AGENT.md` (created by `small init`, uploaded on every
deploy) rides app-scope context verbatim.

- ponytail: no redeploy tool — deploys need the CLI's build.
- ponytail: run_again refuses runs with file inputs (R2 copies not wired).
- ponytail: no memory across threads, no scheduled questions.

Details: `docs/features/web.md` §v13, tests in `tests/integration_tests/ask/`.

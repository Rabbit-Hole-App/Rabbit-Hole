# Agents

Every model-driven worker function lives here, one file per agent. An agent file
exports its SYSTEM prompt, its TOOLS, and one `run*()` entry - nothing else in the
codebase writes prompts inline.

## Convention

```
src/agents/
  README.md      this file
  loop.js        the shared tool loop (anthropic call, tool dispatch, submit tools)
  tools.js       shared read tools over one app: source, runs, logs, outputs
  runbook.js     fills the model row of the structured runbook (docs/features/runbook.md)
  <next>.js      future agents: same shape - SYSTEM, TOOLS, run()
  learn-chat.js      Learn prompt text: teaching policy, chat, tool-family instructions, tool notes
  learn-artifact.js  Learn slash-command card prompt
  learn-board.js     Learn whiteboard drawing and review prompts
  learn-grade.js     Learn visible-grader instructions and the VERDICT helpers
```

Rules:
- The SYSTEM prompt is a const at the top of the agent file, assembled from an
  array of lines. No prompt text anywhere else.
- Read-only tools come from tools.js unless the agent needs something unique.
- Agents that must return structure declare a `submit_*` tool; loop.js returns its
  input, so output is schema-validated by the API, never parsed from prose.
- Deterministic facts are computed by the caller, not asked of the model
  (see docs/features/runbook.md, "Where each field comes from").

## Python agents

The control plane is a Cloudflare Worker: agents in this directory are JavaScript
and run in-request. When an agent needs Python (ML libraries, notebooks, heavy
parsing), do not port the loop - package it as a small platform JOB and let the
worker start it through the normal runs pipeline (`POST /api/runs`), read its
outputs from R2, and continue. The runner infra, log capture, and outputs storage
already exist; a Python agent is just an app whose owner is the platform.

Existing single-shot prompts (diagnosis, description, finders, watch texts) still
ride `askOnce`; move them here when they grow tools.

## Learn prompt modules

The learn-*.js files here are prompt text only, an exception to the
SYSTEM/TOOLS/run() shape: Learn's tool schemas, runners, validators and loops
stay in src/learn-*.js, src/repositories.js and src/index.js (apiAsk), which
re-export these names so every importer is unchanged. Nothing here routes
through loop.js. learn-chat.js, learn-artifact.js and learn-board.js are
server-only: packages/web never imports them. learn-grade.js is the exception:
pure and import-free, so the browser imports its VERDICT helpers (the builders
tree-shake away) and packages/web/src/learn-grade-prompts.js re-exports it for
the benchmark. Its golden text is pinned in
packages/web/src/learn-grade-shadow.test.mjs; the assembled prompt per chat
route is pinned in test/learn-prompts.test.js.

Prompt text still outside this directory:
- Learn request context lines in src/index.js (apiAsk: outline header, paper,
  image, Wikipedia and video instructions), the canvas scope line in
  src/canvases.js, and repair and revision turns in src/learn-artifact.js and
  src/learn-board.js.
- Tool descriptions, which live with their schemas (arxiv.js, learn-wiki.js,
  learn-youtube.js, learn-outline-tool.js, repository-context.js, pexels.js).
- The Jev grading protocol in src/learn-grade-jev.js: pinned by its own
  fingerprint and tied to the benchmark holdout check, so it does not move.
- Course authoring in src/learn-course.js, and the dashboard ASK_SYSTEM in
  src/ask.js.
- Browser-built text in packages/web: slash-command templates
  (agent/slash.js) and the card, group and region descriptions sent as the
  learner's message.

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

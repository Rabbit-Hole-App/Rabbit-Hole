# LP1 real-model journey corpus logs, 2026-10-05

These are the raw outputs of `packages/web/e2e/journey-corpus-run.mjs --live`. No key or workspace id appears in them.

- `attempt1-*`: the first approved run, at d2eca8ff. The API refused its first call (HTTP 400: the API key needs a workspace id header). No stage ran and $0.00 was billed.
- `rerun-*`: the owner's GO RERUN, at 6db841fb, covering the four domains with no fast-start case. Anthropic refused the French Revolution path call because the account credit balance was too low. Spend: $0.5217.
  - Each `kind: call` row is one model call: role, requested and served model, latency, tokens, cost and stop_reason.
  - Each `kind: step` row is one stage: checks with their reasons, repair use, validator errors and the raw tool input.

The results and the two prompt fixes they led to (66005c2c) are summarized in `docs/features/adaptive-learning-path-v1-architecture.md` §18.

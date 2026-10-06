# LP1 real-model journey corpus logs, 2026-10-05

These are the raw outputs of `packages/web/e2e/journey-corpus-run.mjs --live`. No key or workspace id appears in them.

- `attempt1-*`: the first approved run, at d2eca8ff. The API refused its first call (HTTP 400: the API key needs a workspace id header). No stage ran and $0.00 was billed.
- `rerun-*`: the owner's GO RERUN, at 6db841fb, covering the four domains with no fast-start case. Anthropic refused the French Revolution path call because the account credit balance was too low. Spend: $0.5217.
  - Each `kind: call` row is one model call: role, requested and served model, latency, tokens, cost and stop_reason.
  - Each `kind: step` row is one stage: checks with their reasons, repair use, validator errors and the raw tool input.

The results and the two prompt fixes they led to (66005c2c) are summarized in `docs/features/adaptive-learning-path-v1-architecture.md` §18.
- `api-targeted-attempt-*`: the targeted API validation at 55cb64e5. Anthropic refused its first call (logistic-regression section) because the credit balance was too low. $0.00 was billed.
- `subscription-targeted-*`: the same targeted plan through the owner's Claude Max subscription via `scripts/learn-subscription-bridge.mjs` (GO SUBSCRIPTION), at e9c13062.
  - The bridge emulates tool use in the system prompt. Effort, max_tokens and caching are not applied, and only the model alias (opus/sonnet) is reported. Not production-exact API evidence.
  - Results: logistic-regression section, photosynthesis path and photosynthesis section passed. The run stopped at photosynthesis adapt_edit, where the bridge returned HTTP 503 "Invalid subscription model response". It was not retried.
- `subscription-resume-*`: the single resume through the subscription bridge at baca6935 (owner GO, 2026-10-06). It covered photosynthesis from adapt_edit and the French Revolution from path.
  - Photosynthesis adapt_edit failed bridge parsing again, so the run stopped as instructed, with no retry.
  - The preserved diagnostic (`subscription-resume-bridge-diagnostic.jsonl`) shows that Sonnet, through the CLI, answered with tool-call markup (`<invoke name="journey_adapt"><parameter ...>`) instead of the JSON object the bridge requires. Termination was success/end_turn.

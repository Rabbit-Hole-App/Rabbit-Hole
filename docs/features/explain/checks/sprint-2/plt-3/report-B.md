# PLT-3 (B) report: formula sampler flag

Read-only report by the REPORT lane (no code changed, no commit). Copied here by the main lane.

## Test state (each file run singly)
- packages/web formula-sampler.test.mjs: 9 pass, 0 fail.
- packages/control-plane explanation-formula-series.test.js: 5 pass, 0 fail.
- No test covers the fast chain's schema bundling with the flag on.

## Where EXPLANATION_FORMULA_SAMPLER is set (names and places only)
Nowhere. Unset in production and on the dev stack.
- Production: packages/web/wrangler.rabbit-hole-prod.jsonc has no match (also on rabbit-hole/main).
- Dev: wrangler.dev.jsonc has no match. Control-plane wrangler configs: no match.
- Owner stack .dev.vars holds EXPLANATION_INTERACTIONS, EXPLANATION_MODEL_PROFILE and EXPLANATION_PLANNER only.
- Other mentions: test-ledger.md l.409 and the tutor-diagrams README only.
- To use it locally: set EXPLANATION_FORMULA_SAMPLER=on in the stack's .dev.vars.

## Does the fast chain see FORMULA_SERIES_GUIDANCE and the anyOf schema?
- Guidance: yes. It is part of the make_explanation tool description (learn-artifact.js:119); assembledSystem builds the fast chain's system prompt from it.
- Post-answer sampling: the fast chain re-enters the same author function (learn-artifact.js:195), so fillFormulaSeries (l.236) also applies.
- Schema: the anyOf is in the full schema, but it THROWS in the common bundled case.
  - Defect found (probe at plt-3/probe.mjs, no model call): with the flag on and a plot kind in the bundle but no compact-sample reference, bundledAuthorSchema throws "TypeError: Cannot read properties of undefined (reading 'samples')".
  - Cause: keepExplicitPlotPoints (explanation-references.js:236-246) expects series.items.properties, which is { anyOf } when the flag is on.
  - Impact: the request would fail in prepareArtifactAuthorRequest before any model call. With the flag off, or with a compact-sample reference, it bundles fine.
  - Fix: needs its own server change and test; not applied.
  - Not verified: that Gemini's geminiRequestSchema or Cerebras strict mode accepts the anyOf series item.
- PLT-3 evidence therefore runs offline through fillFormulaSeries and the renderer.

# R8b lead patches (calculator)

R8b needs exactly one Lead-only edit (`scripts/ci/check-map.json`). No wrangler, route-mount, learn-models, repository-schema or migration change: the calculator has no model role, no table, no route and no binding. The switch `ROADMAP_CALCULATOR` is deliberately NOT written into any `wrangler*.jsonc` (unset = off everywhere, including production). Turning it on later is one `vars` line owned by the activation, never part of this release.

## 1. scripts/ci/check-map.json (two textual line edits; the file has duplicate keys, edit by line, keep CRLF)

Proved on a scratch copy with `scripts/ci/affected.mjs` `classify`: `roadmap-calculate.js` is `unmapped` before and `mapped` after; `roadmap-tools.js` stays `mapped`.

a. In the existing `roadmap-tools.js` row, add one unit test after `roadmap-tools.test.js`:

```
"packages/control-plane/src/roadmap/roadmap-tools.js": ["packages/control-plane/test/roadmap-tools.test.js","packages/control-plane/test/roadmap-calculator-tool.test.js","packages/control-plane/test/roadmap-policy.test.js","packages/control-plane/test/roadmap-contract.test.js"],
```

b. Insert a new row directly before the `roadmap-source.js` row:

```
    "packages/control-plane/src/roadmap/roadmap-calculate.js": ["packages/control-plane/test/roadmap-calculate.test.js","packages/control-plane/test/roadmap-calculator-tool.test.js"],
```

No new e2e check is registered: R8b adds no browser surface (see the receipt), so no `checks` entry, no seconds budget.

## 2. Activation later (not part of this release)

`ROADMAP_CALCULATOR: "true"` in the production `vars` (next to `ROADMAP_ENABLED`) turns the tool on for callers that build their dispatcher flags with `toolFlags(env)` and their handlers with `calculatorHandlers(env, { premise })`. Nothing in R4 calls the dispatcher yet (see the receipt), so the switch alone changes nothing until a model-tool loop passes those two.

# R8b (restricted deterministic calculator) receipt

Branch `feat/tutor-r8b`, base `3b9348449e36fcfde1be02256d742abcc5f298a1`. MVP-labelled (Tutor ladder); broad CI is bypassed, not passed. Independent of R8a, arbitrary execution (R16) and rich formats. The calculator is inert by default: its own switch `ROADMAP_CALCULATOR` is set nowhere.

## What shipped

- `packages/control-plane/src/roadmap/roadmap-calculate.js`: tokenizer, recursive-descent parser, tree evaluator. No `eval`, no `Function`, no property access, strings, assignment, import, network, package or uploaded code (a test greps the source for every dynamic-execution primitive). Pure: no clock, network, model, D1 or learner charge.
- Dispatcher registration in `roadmap-tools.js`: `calculate_expression` (R8b) is an opt-in capability, offered and dispatchable only when `flags.calculate_expression === true`; `toolFlags(env)` sets it only when `ROADMAP_ENABLED` and `ROADMAP_CALCULATOR` are both exactly `'true'`. The handler comes from `calculatorHandlers(env, { premise })` and is `{}` when off. New closed arg types: `text`, `number_map`, `string_map`.
- Computational evidence (`kind: 'computation'`, not the web evidence shape) with `verifyComputationEvidence` re-evaluation, and `computationDisclosure` for the learner view.
- Tests: `test/roadmap-calculate.test.js` (11), `test/roadmap-calculator-tool.test.js` (5); `test/roadmap-tools.test.js` edited once (the planned-but-off list no longer names `calculate_expression`).

## Accepted grammar and limits (versions `roadmap-calc-1`, `roadmap-calc-limits-1`)

```
expr := term (('+'|'-') term)*      term := unary (('*'|'/'|'%') unary)*
unary := ('-'|'+') unary | power    power := atom ('^' unary)?     (right-assoc; -2^2 = -4; 2^-1 = 0.5)
atom := number | name | name '(' expr (',' expr)* ')' | '(' expr ')'
```

Functions: abs sqrt cbrt floor ceil round trunc ln log10 log2 exp sin cos tan asin acos atan (1 arg), min max (2 to 8). Constants: pi, e. Numbers: decimal, optional exponent (`2e3`); no hex, `_`, NaN or Infinity literals. Variables: named finite numbers, own keys only, a Map (so `__proto__` is just a name); cannot shadow a constant or function.

| Limit | Value | Refusal |
| --- | --- | --- |
| source characters | 500 | `too_long` |
| tokens | 200 | `too_many_tokens` |
| nesting depth | 24 | `too_deep` |
| tree nodes | 200 | `too_many_nodes` |
| operations evaluated | 400 | `too_many_operations` |
| variables / name length | 16 / 32 | `too_many_variables`, `name_too_long`, `bad_variable` |
| exponent magnitude | 10000 | `exponent_too_large` |
| any value magnitude | 1e300, finite | `not_finite` |

Other refusals: `bad_character` (quotes, brackets, `.`, `=`, `;`, `$`, unicode), `syntax`, `unlisted_function`, `unbound_name` (needs_clarification), `division_by_zero` (also `x % 0`, `0 ^ negative`), `domain_error` (sqrt/log/asin/acos domain, negative base with fractional exponent). Policy: IEEE-754 double; `-0` normalised to `0`; displayed to 12 significant digits (`0.1 + 0.2` shows `0.3`) while the raw double is retained; the evidence says a finite floating-point answer is not an exact-arithmetic proof.

Evidence record: `{ kind, id: cmp_<16 hex>, expression (whitespace-normalised), inputs[{name,value,unit?,premiseId?}], result, display, resultUnit?, evaluatorVersion, limitsVersion, inputHash, precision, operations, limitations[] }`. `id` and `inputHash` are sha256 of the canonical expression, sorted inputs and both versions, so equal inputs replay to equal identity and a new source value gives a new one. Units are labels, never converted: a `resultUnit` other than the single common input unit returns `needs_clarification` (`unit_conversion_unsupported`).

## Acceptance covered (checklist R8b)

- R8b.01: grammar, precedence/associativity/unary minus/signed powers/decimals goldens, refusals of prohibited syntax and unlisted identifiers, every limit above, domain and non-finite handling, adversarial long/deep input (milliseconds), no dynamic-execution primitive in source. Covered by unit tests.
- R8b.02: evidence shape, deterministic id/hash and replay, premise binding (named premise value and unit must equal the input; changed, missing or stale premise refused), tampered result/display/hash/version/non-finite refused, unsupported units ask. Covered by unit tests.
- R8b.03 (partial): separate flag, typed argument validation, deadline-free pure tool, budget counted by the dispatcher, absent tool leaves source-supported R4 untouched (flag-off matrix tested with `ROADMAP_ENABLED` unset and with it `'true'` and the switch unset or wrong-cased: no flag, no handler, no catalogue entry, `not_enabled` on dispatch; no D1 statement, network or model call exists in the module at all). Calculation creates no learner charge or paid operation (not paid, no usage module import).

## Not covered / unverified

- **Nothing in R4 calls the dispatcher.** `runRoadmapTool`, `capabilityCatalogue` and `readSourceHandler` have no production caller on this base (verified with grep), so the planner and card generator never offer a tool to a model. The calculator is registered exactly as `read_source`/`check_claims` are and is exercised through `runRoadmapTool`, but no learner path reaches it yet. A model-tool loop that passes `toolFlags(env)` and `calculatorHandlers(env, { premise })` is the integration still owed; this lane did not invent one.
- Therefore: no learner-visible display of the derivation, no refusal copy and no end-to-end "derived answer" in the current UI, and no `roadmap-calculator-check.mjs` was written (no browser surface exists to assert; writing one would assert nothing). Browser acceptance not claimed.
- Evidence persistence: the record is returned in the tool result; no table stores it (no migration). Attaching it to a card/step record and citing it as evidence class `computed` after `verifyComputationEvidence` is for the grounding integration.
- No browser, real model, network or database run. `rabbit-hole-prod-config.test.js` not rerun (no wrangler change).

## Proposed learner strings (owner approval needed before any display; none is shown today)

1. Disclosure note under a computed result: "Calculated with floating-point arithmetic from the values shown; the values themselves are as given."
2. Refusal/limitation wording for the reason codes above is NOT written (no surface); the reason codes are the contract for it.

## Lead patches

`docs/features/explain-on-canvas/lead-patches/r8b-calculator.md`: two check-map line edits only; no migration, wrangler, route or model-role change. Migration number: none used.

## Recovery

`feat/tutor-r8b-recovery`: one commit reverting this lane, tree equal to the base. Nothing was deployed, mounted or migrated.

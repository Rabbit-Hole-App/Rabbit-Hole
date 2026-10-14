# Inline AI request check: validation and routing in one call

Owner briefs, 2026-10-13: request validation (about 7:08 PM PT) and creation sections 5-7 (about 7:00 PM PT), in
`agent-coordination/tasks/2026-10-13-inline-validation-OWNER.md` and `2026-10-13-inline-create-OWNER.md`.
Lane R (branch `feature/inline-create`) built the server and shared modules; the editor wiring is lane I's.

## Decision

**JEV is the validator.** One JEV request carries three Choice questions (decision, route, what is missing) and
replaces the route-only call. It met the brief on the labelled set: 98.4% correct decisions, 2.6% false rejections,
every prohibited request blocked, every routed request on an acceptable capability, and a p50 of 250 ms (about
20 ms over today's route-only call). The model candidate (Haiku 4.5, one forced tool call) was 4x slower, rejected
twice as many valid requests and routed a quarter of them to a card instead of a note. Its one advantage, specific
clarify and unsupported messages, is listed under limits below.

## What happens to a request

1. **Local checks (free, in the editor and again in the worker).** Malformed: 400. Empty or whitespace-only: `invalid`.
   Over 1000 characters: `invalid` with the length the learner typed. Edit with nothing selected: `unsupported`,
   "Select something to edit." Short, misspelled, foreign-language, code and profane input passes.
2. **Fixed routes (free).** Edit is `edit`; `/simplify`, `/example` and `/deeper` are `note`; any other inline slash
   command is its own capability (`/diagram` is the native diagram, below); plain "explain this" on a selection is
   `note`. A command that can never generate (unknown, not inline, unavailable on this canvas, or a bare command with
   no subject) is settled here with its message and no call.
3. **One call.** Everything that could generate, including Edit, plain Explain and slash commands, makes the one
   validator call. A fixed route is not asked again, and the validator cannot change it. The validator reads the
   mode, whether anything is selected, the learner's words and a compact summary (the selection's types and first
   words, or the creation region's summary), never the context package. Canvas content is labelled as data.
4. **The response.** `blocked` and `invalid` always use fixed words, never the validator's text. Only `proceed` carries a
   route and a signed proceed. A timeout, a malformed answer or an unavailable validator is a 503 with
   `retryable: true` and no proceed.
5. **Generation.** `/api/learn/inline/generate` refuses (403 `not_validated`) anything without a proceed the server
   signed for this board, this request id and this exact request (5-minute life). It takes mode, route, words and
   context from that signed request, never from fields beside it, and Edit's targets must be the decided ones.
   Downstream safeguards stay: spend admission, the generation model's own policy, card validation, paid proposals.

## Interfaces

Request (the same object goes to `/decide` and then `/generate`):

```js
{ kind: 'selection', mode: 'edit' | 'explain', targetIds: [id, ...] /* or */ textRange: { id, from, to },
  prompt, slash /* optional command name, its words in prompt */, context /* the bounded package */ }
{ kind: 'creation', mode: 'explain', anchor: { x, y } /* world */, region: '<compact subject+style summary, <= 1500>',
  prompt, slash, context }
```

- `POST /api/learn/inline/decide` `{ app, pending?, request_id, request, enabled: [capability, ...] }`
  - 200: `{ decision: 'proceed'|'clarify'|'invalid'|'unsupported'|'blocked', message?, route?: { capability, outcome },
    missing?: ['subject'|'target'|'format'|'data'], paid, token?, meta: { validator, ms, cost, ... } }`.
  - 503: `{ error, code: 'timeout'|'malformed'|'unavailable', retryable }`; 400 malformed; 401/403 auth.
- `POST /api/learn/inline/generate` `{ app, pending?, request_id, board, request, token, revise? }`: the note
  (creation or selection), the edit or the diagram as SSE, as before; a card capability as the `/api/learn/artifact`
  JSON (`artifact`, `paid_proposal` or `clarification`). `/image` and `/motion` are staged in the editor (no model).
- Capabilities: `note`, `shapes` (native diagram), `explain`, `code`, `graph`, `walkthrough`, `compare`, `animate`,
  `image`, `video`, `3d`, `motion`, and `edit`. Outcomes: `text`, `diagram`, `card`, `media`, `edit`. `paid` is true when
  the capability can start paid generation (Motion, or a paid primitive in its family); the router only marks it.

Modules: `web/src/inline-ai-decide.js` (shared request check), `control-plane/src/learn-inline-route.js` (validators,
proceed), `control-plane/src/learn-inline.js` (`inlineDecideFetch`, the gate in `inlineGenerateFetch`),
`web/src/inline-diagram.js` (`validateDiagram`, `layoutDiagram`, `toCanvasObjects`), `web/src/inline-placement.js`
(`placeResult`, `regionStyle`).

## Entry-point audit

| Entry point | Before | Now |
|---|---|---|
| Edit | no routing call; straight to generate | one validator call; route fixed to `edit` |
| Plain "explain this" | bypassed routing | one validator call; route fixed to `note` |
| Explicit slash command | resolved by the registry, no call | one validator call; route fixed by the command |
| Natural-language Explain | JEV route call (no validation) | one validator call: decision and route together |
| Creation (nothing selected) | not possible | one validator call |
| `/api/learn/inline/generate` | trusted the body's mode and route | requires the server's signed proceed |

## `/diagram` today

`/diagram`'s handler (`learn-artifact.js`, family `flow_diagram` and `mermaid_diagram`) makes a card: a flow card that
ELK lays out and React Flow draws inside the card, or a Mermaid card rendered from its source. Neither is canvas
shapes, text and connectors, so neither can be edited as a diagram. Inline, `/diagram` and natural-language diagram
requests route to `shapes`: the model returns structure only (shapes with labels, connectors with direction, groups,
relative layout hints), app code validates it, lays it out deterministically and converts it to ordinary shapes,
connectors and groups with fresh ids, in the region's style. The chat's `/diagram` is unchanged.

## Evaluation (2026-10-13, local stack, real calls)

61 prompts labelled by hand before any run, 12 categories, unrelated subjects: valid short (6), gibberish (5),
ambiguous (5), multilingual (5), code (5), sensitive-but-legitimate education (6), prohibited (5), slash commands (5),
"explain this" / "fix this" with a selection (5), unsupported (5), natural-language routing (7), instructions planted
in canvas content (2). Harness: `web/e2e/inline-decide-eval.mjs` (the set is in the file), each call reserved in the
shared ledger and settled from the worker-reported cost. Latency is the validator call as the worker measured it;
wall is the round trip through the local worker.

| Validator | Decisions correct | Decision and route correct | False rejections | Prohibited blocked | Route correct when proceeding | p50 / p95 (ms) | Wall p50 / p95 (ms) | Cost per call |
|---|---|---|---|---|---|---|---|---|
| JEV, route+validate, run 1 | 98.4% | 98.4% | 2.6% (1 of 38) | 6 of 6 | 100% | 250 / 349 | 292 / 394 | $0.000052 |
| JEV, route+validate, run 2 | 98.4% | 98.4% | 2.6% | 6 of 6 | 100% | 247 / 348 | 293 / 387 | $0.000052 |
| Haiku 4.5, route+validate | 93.4% | 77.0% | 5.3% (2 of 38) | 6 of 6 | 72.2% | 959 / 1388 | 1011 / 1424 | $0.0021 |
| Today: JEV route only (no validation) | n/a | n/a | n/a | n/a | 32 of 34 | 229 / 301 | 275 / 479 | $0.000083 |

- JEV's one miss, both runs: "show me a video of a volcano erupting" was `unsupported` (its route answer was `video`
  at 0.99). Not tuned: one item is not evidence, and tuning on the test set would hide it.
- Haiku's misses: "why?" and "examples?" on a selection, and one gibberish item, became `clarify`; Edit's "add
  three more boxes connected to this" proceeded as an edit; ten plain questions went to an explanation card instead of
  a note.
- Without validation, today's route-only call sent 9 of the 23 requests that should not generate (gibberish,
  prohibited, unsupported, ambiguous) to a generator.
- Added latency with JEV: about 20 ms at p50 on requests that were already routed; the full ~250 ms (p95 ~350 ms) on
  Edit, plain Explain and slash commands, which made no call before.
- One real creation diagram ("draw how a bill becomes a law in the US Congress"): decided `proceed`/`shapes` in 684 ms;
  the model returned 18 shapes, 19 connectors and 3 groups in 14.0 s ($0.042), which validated, laid out and placed;
  the same proceed with a changed prompt was refused (403).
- Spend: $0.205 of lane R's $1.50 (JEV $0.012, Haiku $0.152, the real diagram $0.042).

### Rerun, 2026-10-14 (feature/inline-main, JEV only, owner-approved $0.05)

The set gained a6, "make it" with a selected ellipse labelled 23 (labelled `clarify`), for the lane R report's open
item. The decide response's `meta` now also carries JEV's raw `missing` answer.

| Run | Prompts | Decisions correct | False rejections | Prohibited blocked | Route correct when proceeding | p50 / p95 (ms) | Spend |
|---|---|---|---|---|---|---|---|
| Before the fix | 62 | 95.2% | 2.6% | 6 of 6 | 100% | 209 / 299 | $0.003291 |
| After the clarify criterion | 62 | 96.8% | 2.6% | 6 of 6 | 100% | 217 / 327 | $0.003353 |

- Before: misses a1 ("explain this" with nothing selected: proceed/note), a6 (proceed/shapes, JEV's missing =
  `target`, route p 0.52) and r4 (as before).
- A settle rule (clarify when JEV picked the route and named a missing piece) was rejected on this data. a6's missing
  answer was `target`, not `format`. A `format` rule would have flipped v5, and a `target` rule c3 and i1. A route
  probability cut would have hit v4 and v5 (0.52 and 0.51).
- After: only a6 changed (to clarify). Every other prompt kept its decision and route. a1 and r4 remain.

## Limits and follow-ups

- JEV writes no text, so clarify and unsupported messages are four question templates and one limitation line, in
  English. Haiku wrote specific ones in the learner's language. If the owner wants specific messages, the cheapest
  option measured is a second, message-only call for non-proceed outcomes only; not built.
- The proceed key: `rabbit-hole-app` holds no `MASTER_KEY` (`prod-release.mjs` forbids it), so the key is derived
  from `INLINE_DECISION_KEY` when set, else the JEV or Anthropic key the worker already holds. Setting
  `INLINE_DECISION_KEY` on the app worker is the clean option for the release that ships this.
- The model candidate stays behind `INLINE_VALIDATOR=model` so the comparison can be rerun; delete it if JEV stays.
- `/api/learn/inline/route` is superseded by `/decide` and still answers until the editor stops calling it.
- A diagram arrives whole (no partial preview) and took 14 s for 18 shapes with the card model.
